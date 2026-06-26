// ============================================================================
// @sift/storage — TS row types mirroring migrations/0001_init.sql.
// Shapes are what the driver returns: TEXT→string, INTEGER→number, BLOB→
// Uint8Array, nullable column→ `| null`. Enum unions track the SQL CHECKs.
// ============================================================================

import type { SourceType, ValidationStatus } from '@sift/core-ir'

export type RuleOrigin = 'visual-picker' | 'book-source' | 'handwritten'
export type RunStatus = 'running' | 'ok' | 'warning' | 'failed' | 'canceled'
export type CredentialType = 'cookie' | 'token' | 'header' | 'proxy'
export type CredentialStatus = 'valid' | 'expiring' | 'expired' | 'unknown'
export type DownloadKind = 'text' | 'image' | 'video' | 'file'
export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'failed'
export type LogLevel = 'info' | 'warn' | 'error'

/** sqlite boolean (0/1). */
export type SqliteBool = 0 | 1

export interface SchemaMigrationRow {
  version: number
  applied_at: number
}

export interface RuleRow {
  id: string
  name: string
  origin: RuleOrigin
  source_type: SourceType | null
  source_url: string | null
  ir_version: number
  /** serialized @sift/core-ir `Rule`. */
  ir_json: string
  status: ValidationStatus | null
  created_at: number
  updated_at: number
}

export interface TaskRow {
  id: string
  rule_id: string
  name: string
  /** JSON entry params, e.g. `{"keyword":"…"}`. */
  params_json: string | null
  enabled: SqliteBool
  schedule_cron: string | null
  created_at: number
  updated_at: number
}

export interface RunRow {
  id: string
  task_id: string
  status: RunStatus
  started_at: number
  finished_at: number | null
  rows_count: number
  error: string | null
}

export interface ResultRow {
  id: number
  run_id: string
  row_index: number
  /** one record keyed by OutputColumn.name. */
  data_json: string
  created_at: number
}

export interface CredentialRow {
  id: string
  name: string
  domain: string | null
  type: CredentialType
  /** ciphertext only — the key lives in the OS keychain, never here. */
  value_enc: Uint8Array
  enc_meta: string | null
  status: CredentialStatus | null
  last_used_at: number | null
  created_at: number
  updated_at: number
}

export interface DownloadRow {
  id: string
  run_id: string | null
  kind: DownloadKind
  url: string
  dest_path: string | null
  status: DownloadStatus
  bytes_total: number | null
  /** resume offset (断点续传). */
  bytes_done: number
  error: string | null
  created_at: number
  updated_at: number
}

export interface LogRow {
  id: number
  ts: number
  level: LogLevel
  source: string | null
  message: string
  run_id: string | null
}
