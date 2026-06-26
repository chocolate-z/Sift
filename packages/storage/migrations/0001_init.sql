-- ============================================================================
-- Sift · SQLite schema — migration 0001 (initial, MVP / M0)
-- Canonical, language-neutral source of truth. The Rust engine
-- (src-tauri/infra, rusqlite/sqlx) executes THIS file; the front-end uses the
-- mirrored TS row types in ../src/types.ts.
--
-- Conventions:
--   • Timestamps are INTEGER epoch milliseconds (UTC).
--   • Booleans are INTEGER 0/1.
--   • Enum-like columns are guarded by CHECK constraints (kept in sync with the
--     TS string-literal unions).
--   • Encrypted credential material is a BLOB; the encryption KEY lives in the
--     OS keychain / Tauri stronghold, NEVER in this database (§2, §5.2④).
--   • The app MUST set `PRAGMA foreign_keys = ON;` per connection (SQLite
--     defaults it OFF; it cannot be persisted in the schema).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- migration bookkeeping --------------------------------------------------------
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- rules: a compiled Rule IR (point-pick / book-source / handwritten) ----------
CREATE TABLE rules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  origin      TEXT NOT NULL CHECK (origin IN ('visual-picker', 'book-source', 'handwritten')),
  source_type TEXT CHECK (source_type IN ('api', 'web')),
  source_url  TEXT,
  ir_version  INTEGER NOT NULL,
  ir_json     TEXT NOT NULL,            -- serialized @sift/core-ir Rule
  status      TEXT CHECK (status IN ('ok', 'warning', 'error')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- tasks: a runnable collection job (a rule + run params + optional schedule) ---
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  params_json   TEXT,                   -- entry params, e.g. {"keyword":"…"}
  enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  schedule_cron TEXT,                   -- phase-2 (capabilities.schedule); NULL = manual
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_tasks_rule ON tasks(rule_id);

-- runs: one execution instance of a task --------------------------------------
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'ok', 'warning', 'failed', 'canceled')),
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  rows_count  INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);
CREATE INDEX idx_runs_task ON runs(task_id, started_at DESC);

-- results: extracted rows for a run (friendly-column records) ------------------
CREATE TABLE results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  row_index  INTEGER NOT NULL,
  data_json  TEXT NOT NULL,             -- one record keyed by OutputColumn.name
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, row_index)
);
CREATE INDEX idx_results_run ON results(run_id, row_index);

-- credentials: encrypted Cookie / Token / Header / proxy (credentialRef target)
CREATE TABLE credentials (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  domain       TEXT,                    -- associated site
  type         TEXT NOT NULL CHECK (type IN ('cookie', 'token', 'header', 'proxy')),
  value_enc    BLOB NOT NULL,           -- ciphertext only — key lives in OS keychain
  enc_meta     TEXT,                    -- {algo,iv,…} metadata (NOT the key)
  status       TEXT DEFAULT 'unknown'
                 CHECK (status IN ('valid', 'expiring', 'expired', 'unknown')),
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_credentials_domain ON credentials(domain);

-- downloads: queue items with resume support (断点续传) ------------------------
CREATE TABLE downloads (
  id          TEXT PRIMARY KEY,
  run_id      TEXT REFERENCES runs(id) ON DELETE CASCADE,   -- nullable
  kind        TEXT NOT NULL CHECK (kind IN ('text', 'image', 'video', 'file')),
  url         TEXT NOT NULL,
  dest_path   TEXT,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'downloading', 'paused', 'done', 'failed')),
  bytes_total INTEGER,
  bytes_done  INTEGER NOT NULL DEFAULT 0,   -- resume offset
  error       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_downloads_status ON downloads(status);

-- logs: run / system log lines (info / warn / error) --------------------------
CREATE TABLE logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  level   TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source  TEXT,                         -- e.g. 'engine', 'rule:qimao'
  message TEXT NOT NULL,
  run_id  TEXT REFERENCES runs(id) ON DELETE CASCADE   -- nullable
);
CREATE INDEX idx_logs_ts ON logs(ts);
CREATE INDEX idx_logs_run ON logs(run_id);
