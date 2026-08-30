import { writeFileSync } from 'fs'

const PROD_URL = 'https://smart-attend-snowy.vercel.app'

async function fullProductionAudit() {
  console.log('Starting Complete Production HTTP & Security Audit on:', PROD_URL)
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: PROD_URL,
    routes: [],
    auth: [],
    attendance: [],
    security: [],
    reports: [],
    leave: [],
  }

  // 1. Static & Page Routes Audit
  const pages = [
    '/',
    '/student/login',
    '/staff/login',
    '/staff/register',
    '/unauthorized',
    '/session-expired',
    '/account-disabled',
    '/non-existent-page-404',
  ]

  for (const path of pages) {
    try {
      const res = await fetch(`${PROD_URL}${path}`)
      const html = await res.text()
      const hasTitle = html.includes('<title>')
      const hasViewport = html.includes('name="viewport"')
      report.routes.push({
        path,
        status: res.status,
        hasTitle,
        hasViewport,
        length: html.length,
        ok: path === '/non-existent-page-404' ? res.status === 404 : res.status === 200,
      })
    } catch (err) {
      report.routes.push({ path, error: err.message, ok: false })
    }
  }

  // 2. Auth Tests
  // 2a. Student Login
  let studentCookie = ''
  let teacherCookie = ''
  let adminCookie = ''

  const studentLoginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '20260001', password: 'student123', portal: 'student' }),
  })
  const studentLoginData = await studentLoginRes.json()
  const studentSetCookie = studentLoginRes.headers.get('set-cookie') || ''
  studentCookie = studentSetCookie.split(';')[0]
  report.auth.push({
    test: 'Student Login (20260001)',
    status: studentLoginRes.status,
    role: studentLoginData.role,
    cookieSecure: studentSetCookie.toLowerCase().includes('secure'),
    cookieHttpOnly: studentSetCookie.toLowerCase().includes('httponly'),
    cookieSameSite: studentSetCookie.toLowerCase().includes('samesite=lax'),
    ok: studentLoginRes.status === 200 && studentLoginData.ok && studentLoginData.role === 'student',
  })

  // 2b. Teacher Login
  const teacherLoginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'teacher@smartattend.edu.vn', password: '12345678', portal: 'staff' }),
  })
  const teacherLoginData = await teacherLoginRes.json()
  const teacherSetCookie = teacherLoginRes.headers.get('set-cookie') || ''
  teacherCookie = teacherSetCookie.split(';')[0]
  report.auth.push({
    test: 'Teacher Login (teacher@smartattend.edu.vn)',
    status: teacherLoginRes.status,
    role: teacherLoginData.role,
    ok: teacherLoginRes.status === 200 && teacherLoginData.ok && teacherLoginData.role === 'teacher',
  })

  // 2c. Admin Login
  const adminLoginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@smartattend.edu.vn', password: '12345678', portal: 'staff' }),
  })
  const adminLoginData = await adminLoginRes.json()
  const adminSetCookie = adminLoginRes.headers.get('set-cookie') || ''
  adminCookie = adminSetCookie.split(';')[0]
  report.auth.push({
    test: 'Admin Login (admin@smartattend.edu.vn)',
    status: adminLoginRes.status,
    role: adminLoginData.role,
    ok: adminLoginRes.status === 200 && adminLoginData.ok && adminLoginData.role === 'admin',
  })

  // 2d. Wrong Password
  const wrongPassRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '20260001', password: 'incorrectPassword!', portal: 'student' }),
  })
  const wrongPassData = await wrongPassRes.json()
  report.auth.push({
    test: 'Wrong Password Rejection',
    status: wrongPassRes.status,
    ok: wrongPassRes.status === 401 && !wrongPassData.ok,
    message: wrongPassData.message,
  })

  // 3. Attendance E2E on Deployed System
  if (teacherCookie) {
    const listSecRes = await fetch(`${PROD_URL}/api/courses/sections`, {
      headers: { Cookie: teacherCookie },
    })
    const listSecData = await listSecRes.json()
    const sec = listSecData.sections?.[0]
    const sectionId = sec?.section?.id || sec?.id || (typeof sec === 'object' ? Object.values(sec)[0]?.id : null)

    report.attendance.push({
      test: 'Teacher List Sections',
      status: listSecRes.status,
      count: listSecData.sections?.length || 0,
      ok: listSecRes.status === 200 && listSecData.ok,
    })

    if (sectionId) {
      // Start/Get session
      const createSessRes = await fetch(`${PROD_URL}/api/attendance/sessions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
        body: JSON.stringify({ sectionId }),
      })
      const createSessData = await createSessRes.json()
      const sessionId = createSessData.sessionId

      report.attendance.push({
        test: 'Create/Get Live Session',
        status: createSessRes.status,
        sessionId,
        ok: createSessRes.status === 200 && Boolean(sessionId),
      })

      if (sessionId) {
        // Rotate challenge
        const rotRes = await fetch(`${PROD_URL}/api/attendance/sessions/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ action: 'rotate' }),
        })
        const rotData = await rotRes.json()
        const challenge = rotData.challenge

        report.attendance.push({
          test: 'Rotate Challenge OTP',
          status: rotRes.status,
          challenge,
          ok: rotRes.status === 200 && Boolean(challenge),
        })

        // Student Verifies
        if (studentCookie && challenge) {
          const verifyRes = await fetch(`${PROD_URL}/api/attendance/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
            body: JSON.stringify({ code: challenge, device: 'QA-Device' }),
          })
          const verifyData = await verifyRes.json()
          report.attendance.push({
            test: 'Student Submit Valid Challenge',
            status: verifyRes.status,
            recordStatus: verifyData.record?.status,
            confidence: verifyData.record?.confidence,
            ok: verifyRes.status === 200 && verifyData.ok,
          })

          // Student Submit Invalid Challenge
          const invalidRes = await fetch(`${PROD_URL}/api/attendance/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
            body: JSON.stringify({ code: 'INVALID', device: 'QA-Device' }),
          })
          const invalidData = await invalidRes.json()
          report.security.push({
            test: 'Reject Invalid Challenge Code',
            status: invalidRes.status,
            ok: !invalidData.ok,
            message: invalidData.message,
          })
        }

        // Close session
        const closeRes = await fetch(`${PROD_URL}/api/attendance/sessions/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ action: 'close' }),
        })
        const closeData = await closeRes.json()
        report.attendance.push({
          test: 'Teacher Close Session',
          status: closeRes.status,
          ok: closeRes.status === 200 && closeData.ok,
        })
      }
    }
  }

  // 4. Reports CSV Export
  if (teacherCookie) {
    const csvRes = await fetch(`${PROD_URL}/api/reports/attendance?scope=summary`, {
      headers: { Cookie: teacherCookie },
    })
    const csvText = await csvRes.text()
    report.reports.push({
      test: 'Attendance Summary CSV Export',
      status: csvRes.status,
      contentType: csvRes.headers.get('content-type'),
      disposition: csvRes.headers.get('content-disposition'),
      length: csvText.length,
      firstLine: csvText.split('\n')[0],
      ok: csvRes.status === 200,
    })
  }

  if (adminCookie) {
    const auditRes = await fetch(`${PROD_URL}/api/reports/audit`, {
      headers: { Cookie: adminCookie },
    })
    const auditText = await auditRes.text()
    report.reports.push({
      test: 'Audit Log CSV Export',
      status: auditRes.status,
      disposition: auditRes.headers.get('content-disposition'),
      length: auditText.length,
      ok: auditRes.status === 200,
    })
  }

  // 5. Leave Request Workflow
  if (studentCookie) {
    const createLeave = await fetch(`${PROD_URL}/api/attendance/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({
        courseId: 'crs_it301',
        date: '30/08/2026',
        reason: 'Sốt xuất huyết điều trị tại nhà',
        evidenceNote: 'Đơn thuốc BV GTVT',
      }),
    })
    const leaveData = await createLeave.json()
    report.leave.push({
      test: 'Student Submit Leave Request',
      status: createLeave.status,
      requestId: leaveData.request?.id,
      ok: createLeave.status === 200 && leaveData.ok,
    })

    const listLeave = await fetch(`${PROD_URL}/api/attendance/leave`, {
      headers: { Cookie: studentCookie },
    })
    const listLeaveData = await listLeave.json()
    report.leave.push({
      test: 'Student List Leave Requests',
      status: listLeave.status,
      count: listLeaveData.requests?.length || 0,
      ok: listLeave.status === 200 && listLeaveData.ok,
    })
  }

  console.log('=== FULL AUDIT RESULTS ===')
  console.log(JSON.stringify(report, null, 2))
  writeFileSync('scripts/prod-audit-result.json', JSON.stringify(report, null, 2))
}

fullProductionAudit().catch(console.error)
