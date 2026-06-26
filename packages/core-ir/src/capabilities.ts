// ============================================================================
// @sift/core-ir — PHASE-2/3 leaves. Representable, NOT built. Absent == off.
// The MVP engine never reads these; adding a capability is non-breaking.
// ============================================================================

export interface RuleCapabilities {
  schedule?: ScheduleSpec // phase-2 cron
  incremental?: IncrementalSpec // phase-2 fingerprint dedup
  notify?: NotifySpec // phase-2 change notification
  exportTargets?: string[] // phase-2/3 epub/db/webhook ids
}

export interface ScheduleSpec {
  cron: string
  timezone?: string
}

export interface IncrementalSpec {
  keyField: string
  strategy: 'fingerprint'
}

export interface NotifySpec {
  on: 'change' | 'new'
  channelRef?: string
}

export type DownloadSpec =
  | { kind: 'text'; field: string; ext?: 'txt'; merge?: boolean } // phase-2
  | { kind: 'image'; field: string; pack?: 'zip' | 'pdf' | 'cbz'; refererRef?: string } // phase-2
  | { kind: 'video'; field: string; format: 'm3u8' } // phase-3
