// ============================================================================
// @sift/core-ir — output: friendly dataset schema + provenance. The
// (fromStep, fromField) pair disambiguates same-named fields across steps.
// ============================================================================

import type { DownloadSpec } from './capabilities'

export interface OutputSpec {
  format: 'records' // add 'text'/'tree' later
  columns: OutputColumn[]
  /** keep provenance: which step produced each row. */
  trackProvenance?: boolean
  /** default export formats (MVP csv/json/xlsx/txt; phase-2/3 epub/zip/cbz/pdf). */
  formats?: ExportFormat[]
  /** PHASE-2/3 batch download (text/image/video). */
  download?: DownloadSpec
}

export interface OutputColumn {
  /** friendly display name. */
  name: string
  /** raw field key it maps from. */
  fromField: string
  /** which step produced the field (provenance / disambiguates same-named keys). */
  fromStep: string
  type?: 'string' | 'number' | 'url' | 'image' | 'text'
}

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'txt' | 'epub' | 'zip' | 'cbz' | 'pdf'
