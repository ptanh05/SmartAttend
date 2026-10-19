import { describe, expect, it } from 'vitest'
import { attendanceRate, attendanceSummary, escapeCsvCell, toCsv, UTF8_BOM } from './csv'

describe('escapeCsvCell', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"')
  })
})

describe('toCsv', () => {
  it('writes a header and rows separated by CRLF with UTF-8 BOM by default', () => {
    const csv = toCsv(
      [
        { header: 'Student', key: 'student' },
        { header: 'Status', key: 'status' },
      ],
      [
        { student: 'Anna', status: 'present' },
        { student: 'Bob "B"', status: 'late, ' },
      ],
    )
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv).toBe(`${UTF8_BOM}Student,Status\r\nAnna,present\r\n"Bob ""B""","late, "`)
  })

  it('produces just a header with BOM for no rows', () => {
    expect(toCsv([{ header: 'A', key: 'a' }], [])).toBe(`${UTF8_BOM}A`)
  })

  it('allows disabling BOM with { bom: false }', () => {
    const csv = toCsv([{ header: 'A', key: 'a' }], [{ a: '1' }], { bom: false })
    expect(csv.startsWith(UTF8_BOM)).toBe(false)
    expect(csv).toBe('A\r\n1')
  })

  it('correctly formats detailed record rows with Vietnamese characters and UTF-8 BOM for Excel compatibility', () => {
    const columns = [
      { header: 'Sinh viên', key: 'student' },
      { header: 'Môn học', key: 'course' },
      { header: 'Điểm', key: 'score' },
    ]
    const rows = [
      { student: 'Nguyễn Văn An', course: 'CS101 · Lập trình Web', score: 100 },
      { student: 'Trần Thị Bích', course: 'CS102 · Cấu trúc dữ liệu', score: 85 },
    ]
    const csv = toCsv(columns, rows)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toBe(
      `${UTF8_BOM}Sinh viên,Môn học,Điểm\r\nNguyễn Văn An,CS101 · Lập trình Web,100\r\nTrần Thị Bích,CS102 · Cấu trúc dữ liệu,85`,
    )
  })
})

describe('attendanceSummary', () => {
  it('counts occurrences per status', () => {
    const summary = attendanceSummary([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
      { status: 'present' },
    ])
    expect(summary).toEqual({ present: 3, late: 1, absent: 1 })
  })

  it('returns an empty object for no records', () => {
    expect(attendanceSummary([])).toEqual({})
  })
})

describe('attendanceRate', () => {
  it('counts present and late as attended', () => {
    expect(
      attendanceRate([
        { status: 'present' },
        { status: 'present' },
        { status: 'late' },
        { status: 'absent' },
      ]),
    ).toBe(75)
  })

  it('returns 0 for empty records', () => {
    expect(attendanceRate([])).toBe(0)
  })
})