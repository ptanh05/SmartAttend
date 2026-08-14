import { describe, expect, it } from 'vitest'
import { attendanceRate, attendanceSummary, escapeCsvCell, toCsv } from './csv'

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
  it('writes a header and rows separated by CRLF', () => {
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
    expect(csv).toBe('Student,Status\r\nAnna,present\r\n"Bob ""B""","late, "')
  })

  it('produces just a header for no rows', () => {
    expect(toCsv([{ header: 'A', key: 'a' }], [])).toBe('A')
  })

  it('correctly formats detailed record rows for export', () => {
    const columns = [
      { header: 'Student', key: 'student' },
      { header: 'Course', key: 'course' },
      { header: 'Score', key: 'score' },
    ]
    const rows = [
      { student: 'Nguyen Van A', course: 'CS101 · Web Dev', score: 100 },
      { student: 'Tran Thi B', course: 'CS102 · Data Struct', score: 85 },
    ]
    const csv = toCsv(columns, rows)
    expect(csv).toBe('Student,Course,Score\r\nNguyen Van A,CS101 · Web Dev,100\r\nTran Thi B,CS102 · Data Struct,85')
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