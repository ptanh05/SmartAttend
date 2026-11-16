import { describe, expect, it } from 'vitest'
import { parseStudentCsv } from '@/lib/auth/users'

describe('student CSV parser', () => {
  it('ignores parenthetical descriptions in the header row', () => {
    const csv = [
      'studentId (Mã SV),name (Họ và tên),department (Khoa/Bộ môn)',
      '20210001,Nguyễn Văn An,Công nghệ thông tin',
      '20210002,Trần Thị Bình,Hệ thống thông tin',
    ].join('\n')

    const rows = parseStudentCsv(csv)

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.studentCode)).toEqual(['20210001', '20210002'])
  })
})
