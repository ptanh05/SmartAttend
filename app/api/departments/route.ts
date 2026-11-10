import { NextResponse } from 'next/server'
import {
  createDepartment,
  deleteDepartment,
  listDepartmentsWithDetails,
  updateDepartment,
} from '@/lib/attendance/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  validateRequestBody,
} from '@/lib/validation'

export async function GET() {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const departments = await listDepartmentsWithDetails(auth)
    return NextResponse.json({ ok: true, departments })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, message: 'Không thể tải danh sách khoa/bộ môn.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['admin'])
    const validation = await validateRequestBody(request, createDepartmentSchema, 'Tên khoa/bộ môn không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const result = await createDepartment(auth, validation.data.name)
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, message: 'Không thể tạo khoa/bộ môn mới.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(['admin'])
    const validation = await validateRequestBody(request, updateDepartmentSchema, 'Dữ liệu cập nhật không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const result = await updateDepartment(auth, validation.data.id, validation.data.name)
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, message: 'Không thể cập nhật khoa/bộ môn.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth(['admin'])
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id || !id.trim()) {
      return NextResponse.json({ ok: false, message: 'Thiếu mã khoa/bộ môn cần xóa.' }, { status: 400 })
    }

    const result = await deleteDepartment(auth, id.trim())
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    return NextResponse.json({ ok: false, message: 'Không thể xóa khoa/bộ môn.' }, { status: 500 })
  }
}

