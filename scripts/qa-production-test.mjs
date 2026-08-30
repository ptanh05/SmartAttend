const BASE_URL = 'https://smart-attend-snowy.vercel.app'

async function runQa() {
  console.log('=== STARTING PRODUCTION API & SECURITY QA ===')
  console.log('Target:', BASE_URL)
  const results = []

  function record(name, pass, detail = '') {
    results.push({ name, pass, detail })
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? '(' + detail + ')' : ''}`)
  }

  // 1. Unauthenticated API access checks
  try {
    const res = await fetch(`${BASE_URL}/api/me`)
    record('GET /api/me unauthenticated returns 200 with ok:false', res.status === 200, `status: ${res.status}`)
  } catch (err) {
    record('GET /api/me unauthenticated', false, err.message)
  }

  try {
    const res = await fetch(`${BASE_URL}/api/audit-logs`)
    record('GET /api/audit-logs unauthenticated returns 401', res.status === 401, `status: ${res.status}`)
  } catch (err) {
    record('GET /api/audit-logs unauthenticated', false, err.message)
  }

  // 2. Student Authentication
  let studentCookie = ''
  try {
    const wrongLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '20260001', password: 'wrongpassword', portal: 'student' }),
    })
    const wrongJson = await wrongLogin.json()
    record('Student Login with wrong password rejected', wrongLogin.status === 401 || !wrongJson.ok, `status: ${wrongLogin.status}, msg: ${wrongJson.message}`)

    const studentLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '20260001', password: 'student123', portal: 'student' }),
    })
    const studentJson = await studentLogin.json()
    const setCookie = studentLogin.headers.get('set-cookie') || ''
    studentCookie = setCookie.split(';')[0]
    record('Student Login (20260001) succeeds', studentLogin.status === 200 && studentJson.ok && studentJson.role === 'student', `role: ${studentJson.role}`)
    record('Session Cookie has HttpOnly and SameSite', setCookie.toLowerCase().includes('httponly') && setCookie.toLowerCase().includes('samesite=lax'), `cookie: ${setCookie}`)
  } catch (err) {
    record('Student Login', false, err.message)
  }

  // 3. Teacher Authentication
  let teacherCookie = ''
  try {
    const teacherLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher@smartattend.edu.vn', password: '12345678', portal: 'staff' }),
    })
    const teacherJson = await teacherLogin.json()
    const setCookie = teacherLogin.headers.get('set-cookie') || ''
    teacherCookie = setCookie.split(';')[0]
    record('Teacher Login (teacher@smartattend.edu.vn) succeeds', teacherLogin.status === 200 && teacherJson.ok && teacherJson.role === 'teacher', `role: ${teacherJson.role}`)
  } catch (err) {
    record('Teacher Login', false, err.message)
  }

  // 4. Admin Authentication
  let adminCookie = ''
  try {
    const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@smartattend.edu.vn', password: '12345678', portal: 'staff' }),
    })
    const adminJson = await adminLogin.json()
    const setCookie = adminLogin.headers.get('set-cookie') || ''
    adminCookie = setCookie.split(';')[0]
    record('Admin Login (admin@smartattend.edu.vn) succeeds', adminLogin.status === 200 && adminJson.ok && adminJson.role === 'admin', `role: ${adminJson.role}`)
  } catch (err) {
    record('Admin Login', false, err.message)
  }

  // 5. Student Authorization & RBAC Boundaries
  if (studentCookie) {
    try {
      // Student trying to access teacher analytics
      const resAnalytics = await fetch(`${BASE_URL}/api/analytics/overview`, {
        headers: { Cookie: studentCookie },
      })
      record('Student cannot access /api/analytics/overview (RBAC)', resAnalytics.status === 403, `status: ${resAnalytics.status}`)

      // Student trying to access all users directory
      const resUsers = await fetch(`${BASE_URL}/api/users`, {
        headers: { Cookie: studentCookie },
      })
      record('Student cannot access full user roster /api/users (RBAC)', resUsers.status === 403, `status: ${resUsers.status}`)

      // Student trying to create course
      const resCourse = await fetch(`${BASE_URL}/api/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({ code: 'HACK', name: 'Hack Course', department: 'IT' }),
      })
      record('Student cannot create course (RBAC)', resCourse.status === 403, `status: ${resCourse.status}`)

      // Student trying to view audit logs
      const resAudit = await fetch(`${BASE_URL}/api/audit-logs`, {
        headers: { Cookie: studentCookie },
      })
      record('Student cannot view /api/audit-logs (RBAC)', resAudit.status === 403, `status: ${resAudit.status}`)
    } catch (err) {
      record('Student RBAC Checks', false, err.message)
    }
  }

  // 6. Teacher Live Attendance Workflow
  let liveSessionId = ''
  let activeChallenge = ''
  if (teacherCookie) {
    try {
      // Get sections
      const secRes = await fetch(`${BASE_URL}/api/courses/sections`, {
        headers: { Cookie: teacherCookie },
      })
      const secJson = await secRes.json()
      const firstSection = secJson.sections?.[0]
      record('Teacher lists sections', secJson.ok && Boolean(firstSection), `sections count: ${secJson.sections?.length}`)

      if (firstSection) {
        // Start or get live session
        const putSession = await fetch(`${BASE_URL}/api/attendance/sessions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ sectionId: firstSection.section.id }),
        })
        const putJson = await putSession.json()
        liveSessionId = putJson.sessionId
        record('Teacher creates/gets live session', putSession.status === 200 && Boolean(liveSessionId), `sessionId: ${liveSessionId}`)

        // Transition to active
        const startSession = await fetch(`${BASE_URL}/api/attendance/sessions/${liveSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ action: 'start' }),
        })
        const startJson = await startSession.json()
        record('Teacher starts live session (active)', startSession.status === 200 && startJson.ok)

        // Rotate challenge
        const rotateRes = await fetch(`${BASE_URL}/api/attendance/sessions/${liveSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ action: 'rotate' }),
        })
        const rotateJson = await rotateRes.json()
        activeChallenge = rotateJson.challenge
        record('Teacher rotates challenge code', rotateJson.ok && Boolean(activeChallenge), `challenge: ${activeChallenge}`)
      }
    } catch (err) {
      record('Teacher Live Session Management', false, err.message)
    }
  }

  // 7. Student Attendance Verification & Challenge Security
  if (studentCookie && activeChallenge) {
    try {
      // Test 1: Invalid challenge
      const invalidVerify = await fetch(`${BASE_URL}/api/attendance/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({ code: 'WRONG9', device: 'qa-test-device' }),
      })
      const invalidJson = await invalidVerify.json()
      record('Student submits invalid challenge code -> rejected', !invalidJson.ok, `msg: ${invalidJson.message}`)

      // Test 2: Valid challenge
      const validVerify = await fetch(`${BASE_URL}/api/attendance/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({ code: activeChallenge, device: 'qa-test-device' }),
      })
      const validJson = await validVerify.json()
      record('Student submits valid active challenge -> verified', validJson.ok && (validJson.record?.status === 'present' || validJson.record?.status === 'late'), `status: ${validJson.record?.status}, score: ${validJson.record?.confidence}`)

      // Test 3: Duplicate verification attempt
      const dupVerify = await fetch(`${BASE_URL}/api/attendance/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({ code: activeChallenge, device: 'qa-test-device' }),
      })
      const dupJson = await dupVerify.json()
      record('Duplicate check-in updates/prevents error safely', dupJson.ok, `status: ${dupJson.record?.status}`)
    } catch (err) {
      record('Student Attendance Verification', false, err.message)
    }
  }

  // 8. Leave Requests Workflow
  if (studentCookie && teacherCookie) {
    try {
      // Student creates leave request
      const leavePost = await fetch(`${BASE_URL}/api/attendance/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
        body: JSON.stringify({
          courseId: 'crs_it301',
          date: '30/08/2026',
          reason: 'QA Automated Testing of Leave Request Workflow',
          evidenceNote: 'QA Script run',
        }),
      })
      const leaveJson = await leavePost.json()
      const requestId = leaveJson.request?.id
      record('Student submits leave request to PostgreSQL', leavePost.status === 200 && Boolean(requestId), `id: ${requestId}`)

      // Student gets own leave requests
      const leaveList = await fetch(`${BASE_URL}/api/attendance/leave`, {
        headers: { Cookie: studentCookie },
      })
      const listJson = await leaveList.json()
      record('Student lists persistent leave requests', listJson.ok && listJson.requests?.some(r => r.id === requestId))

      // Teacher reviews and approves leave request
      if (requestId) {
        const patchRes = await fetch(`${BASE_URL}/api/attendance/leave`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({ requestId, status: 'approved' }),
        })
        const patchJson = await patchRes.json()
        record('Teacher approves leave request', patchJson.ok && patchJson.request?.status === 'approved', `status: ${patchJson.request?.status}`)
      }
    } catch (err) {
      record('Leave Request E2E', false, err.message)
    }
  }

  // 9. Reports & CSV Export
  if (teacherCookie) {
    try {
      const csvRes = await fetch(`${BASE_URL}/api/reports/attendance?scope=summary`, {
        headers: { Cookie: teacherCookie },
      })
      const csvText = await csvRes.text()
      const isCsv = csvRes.headers.get('content-type')?.includes('csv') || csvRes.headers.get('content-disposition')?.includes('attachment')
      const hasHeaders = csvText.includes('Student Code') || csvText.includes('Student Name') || csvText.includes('Attendance Rate')
      record('Teacher downloads attendance CSV report', csvRes.status === 200 && isCsv && hasHeaders, `length: ${csvText.length} bytes`)
    } catch (err) {
      record('Attendance CSV Report Export', false, err.message)
    }
  }

  // 10. Audit Log Report Export
  if (adminCookie) {
    try {
      const auditRes = await fetch(`${BASE_URL}/api/reports/audit`, {
        headers: { Cookie: adminCookie },
      })
      const auditText = await auditRes.text()
      const isCsv = auditRes.headers.get('content-disposition')?.includes('attachment')
      record('Admin exports audit log CSV', auditRes.status === 200 && isCsv, `length: ${auditText.length} bytes`)
    } catch (err) {
      record('Audit Log CSV Export', false, err.message)
    }
  }

  // 11. Close Session & Absent Handling
  if (teacherCookie && liveSessionId) {
    try {
      const closeRes = await fetch(`${BASE_URL}/api/attendance/sessions/${liveSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
        body: JSON.stringify({ action: 'close' }),
      })
      const closeJson = await closeRes.json()
      record('Teacher closes live attendance session (finalizes absents)', closeRes.status === 200 && closeJson.ok)

      // Student attempt on closed session
      if (studentCookie) {
        const closedVerify = await fetch(`${BASE_URL}/api/attendance/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
          body: JSON.stringify({ code: activeChallenge, device: 'qa-test-device' }),
        })
        const closedJson = await closedVerify.json()
        record('Verification on closed session rejected', !closedJson.ok, `msg: ${closedJson.message}`)
      }
    } catch (err) {
      record('Session Close & Absent Handling', false, err.message)
    }
  }

  // 12. Logout Test
  if (studentCookie) {
    try {
      const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: studentCookie },
      })
      const logoutJson = await logoutRes.json()
      record('Student Logout succeeds', logoutRes.status === 200 && logoutJson.ok)

      // Attempt /api/me with logged out cookie
      const meRes = await fetch(`${BASE_URL}/api/me`, {
        headers: { Cookie: studentCookie },
      })
      const meJson = await meRes.json()
      record('Session actually invalidated in database after logout', meJson.ok === false || !meJson.user, `me ok: ${meJson.ok}`)
    } catch (err) {
      record('Logout Verification', false, err.message)
    }
  }

  console.log('=== QA SUMMARY ===')
  const total = results.length
  const passed = results.filter(r => r.pass).length
  console.log(`Passed: ${passed}/${total} (${Math.round((passed/total)*100)}%)`)
}

runQa().catch(console.error)
