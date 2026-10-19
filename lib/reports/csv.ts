/**
 * Minimal, dependency-free CSV helpers for exported attendance reports.
 * Follows RFC 4180 quoting: cells containing a comma, quote, CR or LF are
 * double-quoted and embedded quotes are doubled.
 *
 * To ensure Microsoft Excel (especially on Windows) displays Vietnamese and other
 * UTF-8 characters correctly without mojibake/lỗi phông, UTF-8 Byte Order Mark
 * (\uFEFF) is prepended by default when exporting CSV.
 */

export const UTF8_BOM = '\uFEFF'

export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export type CsvColumn = { header: string; key: string }

export type CsvOptions = {
  /**
   * Whether to include the UTF-8 Byte Order Mark (\uFEFF) at the start of the file.
   * Defaults to true so Excel on Windows opens Vietnamese characters cleanly.
   */
  bom?: boolean
}

export function toCsv(
  columns: CsvColumn[],
  rows: Record<string, unknown>[],
  options?: CsvOptions,
): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  const content = [header, ...body].join('\r\n')
  const includeBom = options?.bom ?? true
  return includeBom ? `${UTF8_BOM}${content}` : content
}

/** Counts occurrences of each attendance status in a set of records. */
export function attendanceSummary(records: Array<{ status: string }>): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const record of records) {
    summary[record.status] = (summary[record.status] ?? 0) + 1
  }
  return summary
}

/** Percentage of records that are present/late, rounded to one decimal. */
export function attendanceRate(records: Array<{ status: string }>): number {
  if (records.length === 0) return 0
  const attended = records.filter((r) => r.status === 'present' || r.status === 'late').length
  return Math.round((attended / records.length) * 1000) / 10
}