/**
 * Minimal, dependency-free CSV helpers for exported attendance reports.
 * Follows RFC 4180 quoting: cells containing a comma, quote, CR or LF are
 * double-quoted and embedded quotes are doubled.
 */

export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export type CsvColumn = { header: string; key: string }

export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  return [header, ...body].join('\r\n')
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