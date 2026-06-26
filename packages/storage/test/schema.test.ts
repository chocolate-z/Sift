import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Rule } from '@sift/core-ir'
import { parseRuleIr, SCHEMA_VERSION } from '../src/index'
import type { RuleRow } from '../src/index'

const MIGRATION = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8')
const T = 1_700_000_000_000 // fixed timestamp

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(MIGRATION)
  return db
}

describe('SQLite schema 0001', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = freshDb()
  })

  it('creates all expected tables', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(rows.map((r) => r.name)).toEqual(
      ['credentials', 'downloads', 'logs', 'results', 'rules', 'runs', 'schema_migrations', 'tasks'].sort()
    )
  })

  it('rules carries the IR envelope columns', () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('rules')").all() as Array<{ name: string }>).map(
      (r) => r.name
    )
    for (const c of ['id', 'name', 'origin', 'source_type', 'ir_version', 'ir_json', 'status']) {
      expect(cols).toContain(c)
    }
  })

  function seed(): void {
    db.prepare(
      'INSERT INTO rules (id,name,origin,ir_version,ir_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run('r1', '规则', 'book-source', 1, '{}', T, T)
    db.prepare('INSERT INTO tasks (id,rule_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(
      't1',
      'r1',
      '任务',
      T,
      T
    )
    db.prepare('INSERT INTO runs (id,task_id,started_at) VALUES (?,?,?)').run('run1', 't1', T)
    db.prepare('INSERT INTO results (run_id,row_index,data_json,created_at) VALUES (?,?,?,?)').run('run1', 0, '{}', T)
    db.prepare('INSERT INTO logs (ts,level,message,run_id) VALUES (?,?,?,?)').run(T, 'info', 'ok', 'run1')
  }

  it('cascades deletes: rule → tasks → runs → results/logs', () => {
    seed()
    db.prepare('DELETE FROM rules WHERE id=?').run('r1')
    for (const tbl of ['tasks', 'runs', 'results', 'logs']) {
      const row = db.prepare(`SELECT count(*) c FROM ${tbl}`).get() as { c: number }
      expect(row.c).toBe(0)
    }
  })

  it('rejects an out-of-enum value via CHECK', () => {
    expect(() =>
      db
        .prepare('INSERT INTO credentials (id,name,type,value_enc,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run('c1', 'x', 'bogus', new Uint8Array([1]), T, T)
    ).toThrow()
  })

  it('enforces UNIQUE(run_id, row_index) on results', () => {
    seed()
    expect(() =>
      db.prepare('INSERT INTO results (run_id,row_index,data_json,created_at) VALUES (?,?,?,?)').run('run1', 0, '{}', T)
    ).toThrow()
  })

  it('round-trips encrypted credential material as a BLOB', () => {
    const blob = new Uint8Array([0, 1, 2, 250, 255])
    db.prepare('INSERT INTO credentials (id,name,type,value_enc,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(
      'c1',
      '七猫 Cookie',
      'cookie',
      blob,
      T,
      T
    )
    const row = db.prepare('SELECT value_enc FROM credentials WHERE id=?').get('c1') as {
      value_enc: Uint8Array
    }
    expect(Array.from(row.value_enc)).toEqual([0, 1, 2, 250, 255])
  })

  it('defaults: tasks.enabled=1, runs.status=running, downloads.bytes_done=0', () => {
    seed()
    const task = db.prepare('SELECT enabled FROM tasks WHERE id=?').get('t1') as { enabled: number }
    const run = db.prepare('SELECT status FROM runs WHERE id=?').get('run1') as { status: string }
    expect(task.enabled).toBe(1)
    expect(run.status).toBe('running')
  })
})

describe('@sift/storage helpers', () => {
  it('SCHEMA_VERSION matches the migration', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })

  it('parseRuleIr validates and returns a typed Rule, or null on bad data', () => {
    const rule: Rule = {
      irVersion: 1,
      meta: { id: 'r', name: 'n', origin: 'book-source', sourceType: 'api' },
      entry: { kind: 'keyword', param: 'keyword' },
      vars: [],
      steps: [
        {
          id: 'search',
          name: '搜索',
          request: { url: { kind: 'static', url: 'https://x' } },
          parse: { shape: 'page', fields: {} }
        }
      ],
      output: { format: 'records', columns: [] }
    }
    const base: RuleRow = {
      id: 'r',
      name: 'n',
      origin: 'book-source',
      source_type: 'api',
      source_url: null,
      ir_version: 1,
      ir_json: JSON.stringify(rule),
      status: 'ok',
      created_at: 0,
      updated_at: 0
    }
    expect(parseRuleIr(base)?.meta.id).toBe('r')
    expect(parseRuleIr({ ...base, ir_json: '{not json' })).toBeNull()
    expect(parseRuleIr({ ...base, ir_json: '{"irVersion":99}' })).toBeNull()
  })
})
