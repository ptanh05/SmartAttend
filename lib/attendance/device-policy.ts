/**
 * Trusted-device policy for attendance verification.
 *
 * Decides, from the organization policy (`attendance_policies.require_trusted_device`)
 * and the student's known devices, how verified a verification attempt is and
 * whether it should be surfaced for review.
 *
 * Scores are a bounded 0..100 heuristic called `verificationScore` (not a
 * probability). They are combined with the challenge check in
 * `lib/attendance/server.ts`.
 */
export type DevicePolicyInput = {
  hasTrustedDevice: boolean
  hasSeenDevice: boolean
  requireTrustedDevice: boolean
}

export type DevicePolicyDecision = {
  /** Whether attendance may be recorded from this device. Always true today. */
  allowed: boolean
  /** Bounded 0..100 verification score contributed by the device. */
  score: number
  /** Whether this verification should be surfaced as a suspicious attempt. */
  suspicious: boolean
  enforceTrustedDevice: boolean
  reason: 'trusted' | 'seen_untrusted' | 'unseen' | 'untrusted_under_policy' | 'unseen_under_policy'
}

const TRUSTED_SCORE = 98
const SEEN_UNTRUSTED_SCORE = 85
const UNSEEN_SCORE = 78
const POLICY_UNTRUSTED_SCORE = 60
const POLICY_UNSEEN_SCORE = 55

export function evaluateDevicePolicy({
  hasTrustedDevice,
  hasSeenDevice,
  requireTrustedDevice,
}: DevicePolicyInput): DevicePolicyDecision {
  // No trusted-device requirement: the score reflects how established the
  // device is, and nothing is flagged.
  if (!requireTrustedDevice) {
    if (hasTrustedDevice) {
      return { allowed: true, score: TRUSTED_SCORE, suspicious: false, enforceTrustedDevice: false, reason: 'trusted' }
    }
    if (hasSeenDevice) {
      return { allowed: true, score: SEEN_UNTRUSTED_SCORE, suspicious: false, enforceTrustedDevice: false, reason: 'seen_untrusted' }
    }
    return { allowed: true, score: UNSEEN_SCORE, suspicious: false, enforceTrustedDevice: false, reason: 'unseen' }
  }

  // Policy requires a trusted device.
  if (hasTrustedDevice) {
    return { allowed: true, score: TRUSTED_SCORE, suspicious: false, enforceTrustedDevice: true, reason: 'trusted' }
  }
  // No trusted device while the policy is enforced. Attendance is still
  // recorded (so the flow is not hard-broken for first-time students), but the
  // attempt is scored low and flagged for admin review. The device becomes
  // trusted on the next successful verification.
  if (hasSeenDevice) {
    return { allowed: true, score: POLICY_UNTRUSTED_SCORE, suspicious: true, enforceTrustedDevice: true, reason: 'untrusted_under_policy' }
  }
  return { allowed: true, score: POLICY_UNSEEN_SCORE, suspicious: true, enforceTrustedDevice: true, reason: 'unseen_under_policy' }
}

/** Clamp any score into the 0..100 verification range. */
export function normalizeScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}
