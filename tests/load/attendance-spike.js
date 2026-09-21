import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

// Custom metrics theo dõi chuẩn SLA EdTech
const attendanceSuccessRate = new Rate('attendance_success_rate')
const attendanceDuration = new Trend('attendance_duration_ms')
const rateLimitedErrors = new Counter('rate_limited_errors')

export const options = {
  scenarios: {
    classroom_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3s', target: 50 },   // Giảng viên vừa bấm chiếu mã QR
        { duration: '7s', target: 200 },  // 200 sinh viên đồng loạt quét mã
        { duration: '10s', target: 200 }, // Duy trì đỉnh tải 200 VUs
        { duration: '5s', target: 0 },    // Kết thúc phiên điểm danh
      ],
      gracefulRampDown: '2s',
    },
  },
  thresholds: {
    // 95% số request phải hoàn tất dưới 500ms
    http_req_duration: ['p(95)<500'],
    // Tỷ lệ request lỗi không vượt quá 1%
    http_req_failed: ['rate<0.01'],
    // Tỷ lệ điểm danh thành công phải >= 99%
    attendance_success_rate: ['rate>=0.99'],
  },
}

const BASE_URL = __ENV.TARGET_URL || 'https://smart-attend-snowy.vercel.app'
const SESSION_COOKIE = __ENV.TEST_SESSION_COOKIE || 'sa_session=mock_valid_token'
const TEST_CHALLENGE_CODE = __ENV.TEST_OTP || '123456'

export default function attendanceSpikeTest() {
  const url = `${BASE_URL}/api/attendance/verify`

  const payload = JSON.stringify({
    code: TEST_CHALLENGE_CODE,
    device: `LoadTest-Worker-${__VU}`,
    method: 'qr_scan',
    ultrasonicVerified: true,
    biometricVerified: false,
  })

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': SESSION_COOKIE,
      'User-Agent': 'k6-Classroom-Simulator/1.0',
    },
    timeout: '5s',
  }

  const startTime = Date.now()
  const res = http.post(url, payload, params)
  const duration = Date.now() - startTime

  attendanceDuration.add(duration)

  if (res.status === 429) {
    rateLimitedErrors.add(1)
  }

  const isSuccess = check(res, {
    'Status is 200 OK': (r) => r.status === 200,
    'Response ok is true': (r) => {
      try {
        return JSON.parse(r.body).ok === true
      } catch {
        return false
      }
    },
    'Response time under 500ms': () => duration < 500,
  })

  attendanceSuccessRate.add(isSuccess)

  // Giãn cách ngẫu nhiên 0.5 - 1.5s mô phỏng thao tác bấm tay của sinh viên
  sleep(Math.random() * 1.0 + 0.5)
}
