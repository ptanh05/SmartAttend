import { performance } from 'perf_hooks'

const TARGET_URL = process.env.TARGET_URL || 'https://smart-attend-snowy.vercel.app'
const ENDPOINT = `${TARGET_URL}/api/attendance/verify`
const TOTAL_VUS = parseInt(process.env.VUS || '200', 10)

console.log(`================================================================`)
console.log(`🚀 BẮT ĐẦU SPIKE LOAD TEST (Node.js High-Concurrency Runner)`)
console.log(`🎯 Target Endpoint: ${ENDPOINT}`)
console.log(`👥 Virtual Users (VUs): ${TOTAL_VUS} requests đồng thời`)
console.log(`================================================================\n`)

async function runWorker(vuId) {
  const startTime = performance.now()
  const payload = {
    code: '123456',
    device: `SpikeTest-VU-${vuId}`,
    method: 'qr_scan',
    ultrasonicVerified: true,
    biometricVerified: false,
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SmartAttend-LoadSimulator/1.0',
      },
      body: JSON.stringify(payload),
    })

    const duration = performance.now() - startTime
    return {
      vuId,
      status: res.status,
      duration,
      ok: res.status === 200 || res.status === 400 || res.status === 401, // 400/401 is expected if code invalid/unauthenticated, not server crash 500
      is5xx: res.status >= 500,
      is429: res.status === 429,
    }
  } catch (err) {
    const duration = performance.now() - startTime
    return {
      vuId,
      status: 0,
      duration,
      ok: false,
      is5xx: true,
      error: err.message,
    }
  }
}

async function main() {
  const overallStart = performance.now()

  // Bắn đồng loạt TOTAL_VUS requests
  const promises = Array.from({ length: TOTAL_VUS }, (_, i) => runWorker(i + 1))
  const results = await Promise.all(promises)

  const overallDuration = performance.now() - overallStart
  const durations = results.map((r) => r.duration).sort((a, b) => a - b)

  const p50 = durations[Math.floor(durations.length * 0.5)].toFixed(1)
  const p90 = durations[Math.floor(durations.length * 0.9)].toFixed(1)
  const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(1)
  const p99 = durations[Math.floor(durations.length * 0.99)].toFixed(1)
  const avg = (durations.reduce((acc, d) => acc + d, 0) / durations.length).toFixed(1)

  const count2xx = results.filter((r) => r.status >= 200 && r.status < 300).length
  const count4xx = results.filter((r) => r.status >= 400 && r.status < 500 && r.status !== 429).length
  const count429 = results.filter((r) => r.status === 429).length
  const count5xx = results.filter((r) => r.is5xx).length

  console.log(`📊 KẾT QUẢ ĐO ĐẠC ĐỘ TRỄ & TẢI TRỌNG (LATENCY & ERROR METRICS):`)
  console.log(`----------------------------------------------------------------`)
  console.log(`⏱️  Tổng thời gian hoàn tất đợt spike: ${(overallDuration / 1000).toFixed(2)}s`)
  console.log(`📈 Throughput: ${(TOTAL_VUS / (overallDuration / 1000)).toFixed(1)} req/s`)
  console.log(`⚡ p50 Latency : ${p50} ms`)
  console.log(`⚡ p90 Latency : ${p90} ms`)
  console.log(`⚡ p95 Latency : ${p95} ms`)
  console.log(`⚡ p99 Latency : ${p99} ms`)
  console.log(`⚡ Avg Latency : ${avg} ms`)
  console.log(`----------------------------------------------------------------`)
  console.log(`✅ HTTP 2xx (Success)          : ${count2xx}`)
  console.log(`ℹ️  HTTP 4xx (Client/Auth/Code)  : ${count4xx}`)
  console.log(`🛡️  HTTP 429 (Rate-limited)      : ${count429}`)
  console.log(`❌ HTTP 5xx / Server Crash      : ${count5xx}`)
  console.log(`================================================================`)

  if (count5xx === 0) {
    console.log(`🎉 KẾT LUẬN: Neon DB & Vercel Serverless CHỊU TẢI THÀNH CÔNG (0 server errors)!`)
  } else {
    console.log(`⚠️ KẾT LUẬN: Phát hiện ${count5xx} lỗi 5xx server crash cần điều tra.`)
  }
}

main()
