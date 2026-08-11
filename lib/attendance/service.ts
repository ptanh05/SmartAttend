import { records, sessions } from '@/lib/demo/data'
import type { AttendanceRecord } from '@/lib/types/domain'
export type VerificationResult = { ok: boolean; confidence: number; message: string; record?: AttendanceRecord }
export function getLiveSession() { return sessions.find((session) => session.status === 'live') }
export function verifyChallenge(input: string, studentId = 'stu_maya'): VerificationResult {
  const live = getLiveSession()
  if (!live) return { ok: false, confidence: 0, message: 'There is no live session right now.' }
  if (input.trim().toUpperCase() !== live.challenge) return { ok: false, confidence: 22, message: 'That challenge is incorrect. Ask your teacher for the current code.' }
  const record: AttendanceRecord = { id: `att_${Date.now()}`, sessionId: live.id, studentId, status: 'present', confidence: 98, verifiedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), device: 'This browser' }
  records.unshift(record)
  return { ok: true, confidence: 98, message: 'Identity and session verified. Your attendance is recorded.', record }
}
export function rotateChallenge() { const live = getLiveSession(); if (live) live.challenge = 'C' + Math.random().toString(36).slice(2, 7).toUpperCase(); return live?.challenge }
