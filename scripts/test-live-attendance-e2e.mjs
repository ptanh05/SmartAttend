const PROD_URL = 'https://smart-attend-snowy.vercel.app'

async function testAttendanceFlow() {
  console.log('--- Testing Full Live Attendance E2E on Deployed Vercel ---')

  // 1. Teacher Login
  const teacherLogin = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'teacher@smartattend.edu.vn', password: '12345678', portal: 'staff' }),
  })
  const teacherCookie = (teacherLogin.headers.get('set-cookie') || '').split(';')[0]
  console.log('Teacher Login:', teacherLogin.status, 'Cookie set:', Boolean(teacherCookie))

  // 2. Student Login
  const studentLogin = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '20260001', password: 'student123', portal: 'student' }),
  })
  const studentCookie = (studentLogin.headers.get('set-cookie') || '').split(';')[0]
  console.log('Student Login:', studentLogin.status, 'Cookie set:', Boolean(studentCookie))

  // 3. Teacher creates/fetches session for Section 1
  const secRes = await fetch(`${PROD_URL}/api/courses/sections`, { headers: { Cookie: teacherCookie } })
  const secData = await secRes.json()
  console.log('secData:', JSON.stringify(secData, null, 2))
  const secId = secData.sections?.[0]?.section?.id || secData.sections?.[0]?.id
  console.log('Section ID:', secId)

  const putSess = await fetch(`${PROD_URL}/api/attendance/sessions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ sectionId: secId }),
  })
  const putData = await putSess.json()
  const sessionId = putData.sessionId
  console.log('Live Session ID:', sessionId)

  // 4. Teacher starts session (sets to active)
  const startSess = await fetch(`${PROD_URL}/api/attendance/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ action: 'start' }),
  })
  const startData = await startSess.json()
  console.log('Start Session (active):', startData)

  // 5. Teacher rotates challenge
  const rotRes = await fetch(`${PROD_URL}/api/attendance/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ action: 'rotate' }),
  })
  const rotData = await rotRes.json()
  console.log('Challenge Rotated:', rotData)
  const challenge = rotData.challenge

  // 6. Student verifies attendance
  if (challenge) {
    const verifyRes = await fetch(`${PROD_URL}/api/attendance/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({ code: challenge, device: 'Chrome on MacOS' }),
    })
    const verifyData = await verifyRes.json()
    console.log('Student Attendance Verification:', verifyData)

    // 7. Teacher checks live roster
    const liveDetails = await fetch(`${PROD_URL}/api/attendance/sessions`, {
      headers: { Cookie: teacherCookie },
    })
    const liveJson = await liveDetails.json()
    console.log('Live Session Roster Records:', liveJson.live?.records)

    // 8. Teacher closes session
    const closeRes = await fetch(`${PROD_URL}/api/attendance/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
      body: JSON.stringify({ action: 'close' }),
    })
    const closeData = await closeRes.json()
    console.log('Session Closed:', closeData)
  }
}

testAttendanceFlow().catch(console.error)
