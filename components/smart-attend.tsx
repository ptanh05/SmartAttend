'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, ArrowLeft, BarChart3, Bell, BookOpen, Building2, Calendar, CalendarClock, CalendarDays, Camera, CameraOff, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert,
  ClipboardCheck, Clock, Cookie, Copy, Download, Edit3, Eye, FileCheck, FileCheck2, FileSpreadsheet, FileText, Fingerprint, FlaskConical, Globe, Image as ImageIcon, Info, KeyRound, Layers, Lock, LockKeyhole, LogOut, Maximize2, Menu, Minimize2, Moon,
  PanelLeftClose, PanelLeftOpen, Play, Plus, Printer, RotateCcw, RotateCw, ScanLine, Search, Send, ShieldCheck, Smartphone, Sparkles, Trash2, Upload, UserPlus, UserRound, Users, Volume2, Waves, Wifi, X, Zap
} from 'lucide-react'
import {
  AppUser, AuthScreen, AuthUser, Button, Card, calcAttendanceRate, CountdownTimer, DynamicQRCode,
  formatDayOfWeek, initialAuthScreen, Metric, nav, PageKey, pageFromPath, PasswordInput,
  SectionHeader, Status, statusText, UltrasonicWaveVisualizer, ViewProps,
} from './smart-attend-ui'
import { api, loadDashboard, type DashboardData } from '@/lib/api/client'
import { canAccessRole, portalForPath } from '@/lib/auth/routing'
import { PORTAL_HOME, PORTAL_LOGIN, portalForRole } from '@/lib/auth/portals'
import { useI18n } from '@/components/i18n-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { UtcLogo } from './utc-logo'
import { UtcLoginLanding } from './utc-login-landing'
import { UtcStudentDashboard } from './utc-student-dashboard'
import { RegisterScreen } from '@/components/auth/auth-screens'
import { openCookieSettings } from '@/components/cookie-consent-banner'
import type { AttendanceStatus, ClassSession, Course, DepartmentItem, Portal, Role } from '@/lib/types/domain'
import { startUltrasonicBeacon, detectUltrasonicBeacon, DEFAULT_ULTRASONIC_FREQ, type BeaconController } from '@/lib/attendance/ultrasonic'
import { authenticateWithBiometrics, registerDeviceBiometrics } from '@/lib/auth/webauthn-client'

function studentEmailForDisplay(name: string, studentCode: string) {
  const initial = name.trim().split(/\s+/).pop()
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .charAt(0)
    .toLowerCase() ?? ''
  return `${initial}${studentCode}@utc.edu.vn`
}





function ChangePasswordForm({
  forced = false,
  onSuccess,
  onCancel,
}: {
  forced?: boolean
  onSuccess: () => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.changePasswordFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {forced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t('auth.mustChangePasswordDetail')}
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.currentPassword')}
        <PasswordInput
          value={currentPassword}
          onChange={setCurrentPassword}
          inputClassName="h-11"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.newPassword')}
        <PasswordInput
          value={newPassword}
          onChange={setNewPassword}
          inputClassName="h-11"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.confirmPassword')}
        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          inputClassName="h-11"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">{loading ? t('auth.savingPassword') : t('auth.savePassword')}</Button>
        {!forced && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>{t('common.back')}</Button>
        )}
      </div>
    </form>
  )
}

function StudentView({ page, go, data, user, refresh, onPasswordChanged }: ViewProps) {
  const { t } = useI18n()
  const { courses: rawCourses = [], records, sessions, notifications, devices, leaveRequests = [] } = data
  const courses: Course[] = rawCourses.length > 0
    ? rawCourses
    : Array.from(
        new Map(
          sessions
            .filter((s) => s.courseId && (s.courseName || s.courseCode))
            .map((s) => [
              s.courseId,
              {
                id: s.courseId,
                organizationId: '',
                code: s.courseCode ?? s.courseId,
                name: s.courseName ?? s.courseCode ?? 'Course',
                department: '',
                teacherId: '',
                enrolled: s.enrolledCount ?? 0,
                color: 'blue',
                status: 'active',
              } as Course,
            ])
        ).values()
      )
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; confidence: number; message: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const [read, setRead] = useState<string[]>(notifications.filter((n) => n.read).map((n) => n.id))
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ultrasonicStatus, setUltrasonicStatus] = useState<'idle' | 'listening' | 'detected' | 'not_found'>('idle')
  const [ultrasonicProgress, setUltrasonicProgress] = useState(0)
  const [stepNotice, setStepNotice] = useState('')
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [stage2SubMethod, setStage2SubMethod] = useState<'instant' | 'qr' | 'manual'>('instant')
  const [selectedWeekStart, setSelectedWeekStart] = useState('')

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  // Leave Request State
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [leaveCourseId, setLeaveCourseId] = useState('')
  const [leaveDate, setLeaveDate] = useState(() => new Date().toISOString().split('T')[0])
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveEvidence, setLeaveEvidence] = useState('')
  const [leaveAttachmentUrl, setLeaveAttachmentUrl] = useState<string | undefined>(undefined)
  const [studentPreviewProofUrl, setStudentPreviewProofUrl] = useState<string | null>(null)
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [leaveNotice, setLeaveNotice] = useState('')

  const handleProofFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('File quá lớn (>5MB). Vui lòng chọn ảnh nhỏ hơn.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLeaveAttachmentUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetCourseId = leaveCourseId || courses[0]?.id || ''
    if (!targetCourseId || !leaveReason.trim()) return
    setSubmittingLeave(true)
    try {
      const selectedCourse = courses.find((c) => c.id === targetCourseId)
      await api.submitLeaveRequest({
        courseId: targetCourseId,
        courseName: selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : undefined,
        date: leaveDate,
        reason: leaveReason.trim(),
        evidenceNote: leaveEvidence.trim(),
        attachmentUrl: leaveAttachmentUrl,
      })
      setLeaveNotice(t('student.leaveSubmitted'))
      setLeaveReason('')
      setLeaveEvidence('')
      setLeaveAttachmentUrl(undefined)
      setLeaveModalOpen(false)
      await refresh()
    } catch {
      setLeaveNotice(t('student.leaveSubmitError'))
    } finally {
      setSubmittingLeave(false)
    }
  }

  const exportStudentHistoryCsv = () => {
    if (records.length === 0) {
      alert(t('common.noData') || 'Chưa có dữ liệu điểm danh để xuất.')
      return
    }
    const headers = ['Mã buổi học', 'Môn học', 'Phòng', 'Thời gian', 'Trạng thái', 'Độ tin cậy', 'Thiết bị']
    const rows = records.map((r) => {
      const sess = sessions.find((s) => s.id === r.sessionId)
      const crs = courses.find((c) => c.id === sess?.courseId)
      return [
        r.sessionId,
        crs ? `"${crs.code} - ${crs.name}"` : `"${sess?.courseName || 'Học phần'}"`,
        `"${sess?.room || '—'}"`,
        r.verifiedAt ? new Date(r.verifiedAt).toLocaleString('vi-VN') : '—',
        t(`status.${r.status}`) || r.status,
        `${r.confidence}%`,
        `"${(r.device || 'Thiết bị').replace(/"/g, '""')}"`,
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Lich_su_diem_danh_${user.studentCode || user.name || 'sinh_vien'}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const liveSession = sessions.find((session) => session.status === 'live')
  const liveCourse = liveSession ? courses.find((course) => course.id === liveSession.courseId) : null
  const myRecord = liveSession ? records.find((r) => r.sessionId === liveSession.id && (r.status === 'present' || r.status === 'late' || r.status === 'excused')) : null
  const rate = calcAttendanceRate(records)
  const presentCount = records.filter((row) => row.status === 'present' || row.status === 'late').length
  const verify = async (overrideCode?: string, method = 'manual_code') => {
    const codeToVerify = overrideCode || code
    if (!codeToVerify.trim()) return
    try {
      if (ultrasonicStatus !== 'detected') {
        setStepNotice(t('student.inRoomRequired'))
        return
      }
      const response = await api.verify(codeToVerify.trim(), {
        sessionId: liveSession?.id,
        method,
        ultrasonicVerified: true,
      })
      setResult(response)
      if (response.ok) {
        stopCamera()
        await refresh()
      }
    } catch (err) {
      setResult({ ok: false, confidence: 0, message: err instanceof Error ? err.message : t('common.verificationFailed') })
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)

      // BarcodeDetector API detection loop if supported
      const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
      if (win && 'BarcodeDetector' in win) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (win.BarcodeDetector as any)({ formats: ['qr_code'] })
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue.trim().toUpperCase()
              setCode(raw)
              await verify(raw, 'qr_scan')
              return
            }
          } catch {
            /* keep scanning */
          }
          if (streamRef.current) {
            requestAnimationFrame(scan)
          }
        }
        requestAnimationFrame(scan)
      }
    } catch {
      setCameraError(t('common.cameraError'))
      setCameraActive(false)
    }
  }

  const detectSoundwave = async () => {
    if (!liveSession) {
      setStepNotice(t('student.noLiveClass'))
      return
    }
    setStepNotice('')
    setUltrasonicStatus('listening')
    setUltrasonicProgress(0)
    setResult(null)

    try {
      const detection = await detectUltrasonicBeacon({
        targetFrequency: DEFAULT_ULTRASONIC_FREQ,
        durationMs: 2800,
        onProgress: (p) => setUltrasonicProgress(p),
      })

      if (!detection.detected) {
        setUltrasonicStatus('not_found')
        setStepNotice(t('student.presenceBlockedDesc'))
      } else {
        setUltrasonicStatus('detected')
        setStepNotice(t('student.presenceVerifiedDesc'))
      }
    } catch (err) {
      setUltrasonicStatus('not_found')
      setStepNotice(err instanceof Error ? err.message : t('student.ultrasonicNotFound'))
    }
  }

  const runDualVerification = async () => {
    if (!liveSession) {
      setStepNotice(t('student.noLiveClass'))
      return
    }
    if (ultrasonicStatus !== 'detected') {
      setStepNotice(t('student.inRoomRequired'))
      return
    }
    setStepNotice('')
    setBiometricStatus('verifying')
    setResult(null)

    try {
      // Step 1: WebAuthn Challenge & Face ID verification (if supported)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let bioAssertion: any = undefined
      try {
        const challengeRes = await api.webauthnChallenge()
        if (challengeRes.ok) {
          let bioAuth = await authenticateWithBiometrics(
            user.id || '',
            user.email,
            challengeRes.challenge,
          )

          if (!bioAuth.ok && !challengeRes.hasEnrolledPasskey) {
            setStepNotice(t('student.registeringBiometric'))
            const regRes = await registerDeviceBiometrics(
              user.id || '',
              user.name,
              user.email,
              challengeRes.challenge,
            )
            if (regRes.ok) {
              bioAuth = await authenticateWithBiometrics(
                user.id || '',
                user.email,
                challengeRes.challenge,
              )
            }
          }

          if (bioAuth.ok && bioAuth.assertion) {
            bioAssertion = bioAuth.assertion
            setBiometricStatus('success')
          }
        }
      } catch {
        /* Biometric assertion optional fallback */
      }

      // Step 2: Complete in-room verification with acoustic proof
      const targetChallenge = liveSession.challenge && liveSession.challenge !== '------' ? liveSession.challenge : (code || '').trim()
      if (!targetChallenge) {
        setStepNotice('Vui lòng quét mã QR trên màn hình giảng viên hoặc nhập mã 6 ký tự trước khi xác thực khuôn mặt / Face ID.')
        setBiometricStatus('idle')
        return
      }
      const response = await api.verify(targetChallenge, {
        sessionId: liveSession.id,
        method: 'ultrasonic_faceid',
        ultrasonicVerified: true,
        biometricVerified: Boolean(bioAssertion),
        webauthnAssertion: bioAssertion,
        device: navigator.userAgent.includes('iPhone')
          ? 'Apple iPhone (Face ID + Ultrasonic)'
          : navigator.userAgent.includes('Android')
            ? 'Android (Biometric + Ultrasonic)'
            : 'PC / Browser (Passkey + Ultrasonic)',
      })

      setResult(response)
      if (response.ok) {
        await refresh()
      }
    } catch (err) {
      setStepNotice(err instanceof Error ? err.message : t('common.verificationFailed'))
      setBiometricStatus('error')
    }
  }

  if (page === 'join') {
    const liveSessions = sessions.filter((session) => session.status === 'live')
    const scheduledSessions = sessions.filter((session) => session.status !== 'live')
    const courseForSession = (session: ClassSession) => courses.find((course) => course.id === session.courseId)
    return (
      <div className="mx-auto max-w-2xl">
        <SectionHeader
          eyebrow={t('student.verification')}
          title={t('student.joinTitle')}
          detail={t('student.joinDetail')}
        />
        <Card title="Các ca đang live" description="Chọn ca học đang mở để thực hiện điểm danh.">
          {liveSessions.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <Clock className="size-5" />
              <span>Hiện chưa có ca học nào đang live.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {liveSessions.map((session) => {
                const course = courseForSession(session)
                return <button key={session.id} type="button" onClick={() => { if (session.id !== liveSession?.id) go('join') }} className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50">
                  <div><p className="font-semibold text-emerald-900">{course?.code ?? session.courseCode} · {course?.name ?? session.courseName}</p><p className="mt-1 text-xs text-emerald-700">{session.room} · {session.startsAt} – {session.endsAt}</p><p className="mt-1 text-[11px] text-emerald-700/80">Học kỳ: {session.startDate ?? '2026-01-01'} → {session.endDate ?? '2026-12-31'}</p></div>
                  <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">LIVE</span>
                </button>
              })}
            </div>
          )}
        </Card>
        <Card
          title={myRecord ? (liveCourse?.name ?? 'Đã hoàn tất điểm danh') : (liveCourse?.name ?? t('student.noLiveClass'))}
          description={liveSession ? `${liveCourse?.code ?? ''} · ${liveSession.room} · ${t('common.liveNow')}` : t('student.waitingSession')}
        >
          <div className="flex flex-col gap-5">
            {!liveSession ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-3">
                  <Clock className="size-7" />
                </div>
                <h3 className="font-semibold text-base">{t('student.noLiveClass')}</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-5">
                  {t('student.waitingSession')}
                </p>
              </div>
            ) : myRecord ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="size-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                  <CheckCircle2 className="size-8" />
                </div>
                <h3 className="font-bold text-lg text-emerald-800 dark:text-emerald-200">
                  Bạn đã hoàn tất điểm danh ca học này!
                </h3>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  {liveCourse?.name} ({liveCourse?.code}) · Phòng {liveSession.room}
                </p>
                <div className="w-full max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs space-y-2.5 text-left mb-5">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Trạng thái ghi nhận:</span>
                    <span className="font-semibold uppercase text-emerald-700 dark:text-emerald-300 rounded-md bg-emerald-500/10 px-2 py-0.5">
                      {myRecord.status === 'present' ? 'Có mặt' : myRecord.status === 'late' ? 'Đi muộn' : 'Có phép'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Điểm tin cậy:</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {myRecord.confidence}% {myRecord.confidence === 100 && ' — Sóng âm & Sinh trắc học'}
                    </span>
                  </div>
                  {myRecord.verifiedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Thời gian ghi nhận:</span>
                      <span className="font-medium text-foreground">{myRecord.verifiedAt}</span>
                    </div>
                  )}
                </div>
                <Button onClick={() => go('overview')}>
                  <Check /> Quay về trang tổng quan
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('common.todayClass')}</p>
                  <h3 className="mt-1 text-lg font-semibold">{liveCourse?.name} ({liveCourse?.code})</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{liveSession.room} · {liveSession.startsAt} – {liveSession.endsAt}</p>
                </div>
{/* QUY TRÌNH ĐIỂM DANH 2 LỚP: SÓNG SIÊU ÂM (GATEKEEPER) -> HOÀN TẤT */}

            {/* BƯỚC 1: XÁC THỰC HIỆN DIỆN VẬT LÝ QUA SÓNG SIÊU ÂM (BẮT BUỘC) */}
            <div className={`rounded-2xl border p-5 transition-all ${
              ultrasonicStatus === 'detected'
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : ultrasonicStatus === 'not_found'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-indigo-500/20 bg-indigo-500/5'
            }`}>
              <div className="flex items-start gap-3.5">
                <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                  ultrasonicStatus === 'detected'
                    ? 'bg-emerald-500 text-white'
                    : ultrasonicStatus === 'not_found'
                      ? 'bg-rose-500 text-white'
                      : 'bg-indigo-600 text-white'
                }`}>
                  {ultrasonicStatus === 'detected' ? (
                    <CheckCircle2 className="size-5" />
                  ) : ultrasonicStatus === 'not_found' ? (
                    <CircleAlert className="size-5" />
                  ) : ultrasonicStatus === 'listening' ? (
                    <Waves className="size-5 animate-pulse" />
                  ) : (
                    <Volume2 className="size-5" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                      ultrasonicStatus === 'detected'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : ultrasonicStatus === 'not_found'
                          ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                          : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    }`}>
                      BƯỚC 1 (BẮT BUỘC)
                    </span>
                    <h4 className="font-bold text-sm text-foreground">
                      {t('student.step1Title')}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {t('student.step1Desc')}
                  </p>

                  {/* Visualizer during listening */}
                  {ultrasonicStatus === 'listening' && (
                    <div className="mt-3 space-y-2">
                      <UltrasonicWaveVisualizer active={true} />
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                          <span>{t('student.analyzingAudio')}</span>
                          <span>{ultrasonicProgress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
                          <div
                            className="h-full bg-indigo-500 transition-all duration-200"
                            style={{ width: `${ultrasonicProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status Banner when verified */}
                  {ultrasonicStatus === 'detected' && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{t('student.presenceVerifiedDesc')}</span>
                    </div>
                  )}

                  {/* Status Banner when failed */}
                  {ultrasonicStatus === 'not_found' && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-300">
                      <CircleAlert className="size-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                      <div className="space-y-1">
                        <strong className="block font-semibold">{t('student.presenceBlockedBadge')}</strong>
                        <span>{t('student.presenceBlockedDesc')}</span>
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  <div className="mt-3.5 flex items-center gap-2">
                    {ultrasonicStatus !== 'detected' ? (
                      <Button
                        onClick={detectSoundwave}
                        disabled={ultrasonicStatus === 'listening'}
                        className={`w-full font-semibold h-11 ${
                          ultrasonicStatus === 'not_found'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                        }`}
                      >
                        {ultrasonicStatus === 'listening' ? (
                          <>
                            <Waves className="size-4 animate-pulse" />
                            {t('student.capturingUltrasonic')}
                          </>
                        ) : ultrasonicStatus === 'not_found' ? (
                          <>
                            <RotateCcw className="size-4" />
                            {t('student.redetectBeaconBtn')}
                          </>
                        ) : (
                          <>
                            <Waves className="size-4" />
                            {t('student.detectBeaconBtn')}
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={detectSoundwave}
                        className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                      >
                        <RotateCcw className="size-3" />
                        {t('student.redetectBeaconBtn')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* BƯỚC 2: HOÀN TẤT ĐIỂM DANH (CHỈ MỞ KHÓA KHI BƯỚC 1 ĐÃ THÀNH CÔNG) */}
            <div className={`rounded-2xl border p-5 transition-all ${
              ultrasonicStatus === 'detected'
                ? 'border-border bg-card shadow-sm'
                : 'border-dashed border-border/80 bg-muted/30 opacity-70'
            }`}>
              <div className="flex items-start gap-3.5">
                <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                  ultrasonicStatus === 'detected'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-muted-foreground/30 text-muted-foreground'
                }`}>
                  {ultrasonicStatus === 'detected' ? (
                    <Sparkles className="size-5" />
                  ) : (
                    <Lock className="size-5" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                      BƯỚC 2
                    </span>
                    <h4 className="font-bold text-sm text-foreground">
                      {t('student.step2Title')}
                    </h4>
                    {ultrasonicStatus !== 'detected' && (
                      <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                        <Lock className="size-3" />
                        ĐANG KHÓA
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {ultrasonicStatus === 'detected'
                      ? t('student.step2Desc')
                      : t('student.step2LockedDesc')}
                  </p>

                  {/* Khi Bước 1 đã thành công: Hiển thị các tùy chọn điểm danh */}
                  {ultrasonicStatus === 'detected' ? (
                    <div className="mt-4 space-y-4">
                      {/* Sub-tabs for completion method */}
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => { stopCamera(); setStage2SubMethod('instant') }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                            stage2SubMethod === 'instant'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Sparkles className="size-3.5 text-emerald-500" />
                          <span className="truncate">{t('student.unlockMethodBiometric')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setStage2SubMethod('qr'); startCamera() }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                            stage2SubMethod === 'qr'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <ScanLine className="size-3.5" />
                          <span>{t('student.qrMode')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { stopCamera(); setStage2SubMethod('manual') }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                            stage2SubMethod === 'manual'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Edit3 className="size-3.5" />
                          <span>{t('student.manualMode')}</span>
                        </button>
                      </div>

                      {/* Option A: Instant 1-Click / Face ID */}
                      {stage2SubMethod === 'instant' && (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-3">
                            Vị trí phòng học đã được ký chứng thực. Bấm nút bên dưới để hoàn tất ghi nhận điểm danh.
                          </p>
                          <Button
                            onClick={runDualVerification}
                            disabled={biometricStatus === 'verifying'}
                            className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md"
                          >
                            <Sparkles className="size-4" />
                            {biometricStatus === 'verifying' ? t('student.activatingFaceId') : t('student.instantCheckInBtn')}
                          </Button>
                        </div>
                      )}

                      {/* Option B: Scan in-room QR */}
                      {stage2SubMethod === 'qr' && (
                        <div className="flex flex-col items-center gap-3">
                          {cameraActive ? (
                            <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl border-2 border-primary bg-black">
                              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="size-48 rounded-xl border-2 border-dashed border-white/80" />
                              </div>
                            </div>
                          ) : (
                            <Button variant="outline" onClick={startCamera}>
                              <Camera />{t('common.cameraScan')}
                            </Button>
                          )}
                          {cameraActive && (
                            <Button variant="outline" onClick={stopCamera}>
                              <CameraOff />{t('common.cameraStop')}
                            </Button>
                          )}
                          {cameraError && (
                            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                              {cameraError}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Option C: Manual 6-char Code (still carries acousticProof) */}
                      {stage2SubMethod === 'manual' && (
                        <div className="space-y-3">
                          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="challenge">
                            {t('student.sessionChallenge')}
                            <input
                              id="challenge"
                              value={code}
                              onChange={(e) => setCode(e.target.value.toUpperCase())}
                              placeholder={t('student.challengePlaceholder')}
                              className="h-12 rounded-lg border bg-background px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary"
                            />
                          </label>
                          <Button onClick={() => verify(undefined, 'manual_code')} className="w-full h-11">
                            <ShieldCheck />{t('student.verifyRecord')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-muted bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
                      <Lock className="size-4 shrink-0 text-amber-500" />
                      <span>{t('student.step2LockedDesc')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            
              </>
            )}

            {result && (
              <div
                className={`rounded-xl border p-4 ${
                  result.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 shadow-sm'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {result.ok ? <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" /> : <CircleAlert className="size-5" />}
                  {result.ok ? t('student.attendanceConfirmed') : t('student.verificationAttention')}
                </div>
                <p className="mt-1.5 text-sm">{result.message}</p>
                {result.ok && (
                  <div className="mt-3 grid gap-2 border-t border-emerald-200/60 dark:border-emerald-800/60 pt-3 text-xs sm:grid-cols-2">
                    <span>{t('common.course')}: <strong>{liveCourse?.name ?? '—'}</strong></span>
                    <span>{t('common.room')}: <strong>{liveSession?.room ?? '—'}</strong></span>
                    <span className="sm:col-span-2 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-amber-500" />
                      {t('common.confidence')}: <strong>{result.confidence}%</strong>
                      {result.confidence === 100 && ' — ' + t('student.dualVerifiedBadge')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {result?.ok && (
              <Button variant="outline" onClick={() => go('overview')}>
                <Check />{t('common.done')}
              </Button>
            )}
          </div>
        </Card>
        <Card title="Tất cả các ca học" description="Các ca học thuộc những môn bạn đã ghi danh.">
          {scheduledSessions.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có ca học nào khác.</p> : <div className="divide-y">{scheduledSessions.map((session) => { const course = courseForSession(session); return <div key={session.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{course?.code ?? session.courseCode} · {course?.name ?? session.courseName}</p><p className="mt-1 text-xs text-muted-foreground">{session.startsAt} – {session.endsAt} · {session.room}</p><p className="mt-1 text-[11px] text-muted-foreground">Học kỳ: {session.startDate ?? '2026-01-01'} → {session.endDate ?? '2026-12-31'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{session.status === 'scheduled' ? 'Sắp tới' : session.status}</span></div> })}</div>}
        </Card>
      </div>
    )
  }

  if (page === 'history') {
    const shown = records.filter((r) => filter === 'all' || r.status === filter)
    const myLeaveList = leaveRequests.filter((r) => (user.studentCode && r.studentCode === user.studentCode) || (user.id && r.studentId === user.id) || !r.studentCode)
    return (
      <div className="flex flex-col gap-6">
        {leaveNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
            <span>{leaveNotice}</span>
            <button onClick={() => setLeaveNotice('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer"><X className="size-4" /></button>
          </div>
        )}
        <SectionHeader
          eyebrow={t('student.workspace')}
          title={t('student.historyTitle')}
          detail={t('student.historyDetail')}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (courses.length > 0 && !leaveCourseId) {
                    setLeaveCourseId(courses[0].id)
                  }
                  setLeaveModalOpen(true)
                }}
              >
                <FileCheck />{t('student.submitLeave')}
              </Button>
              <Button variant="outline" onClick={exportStudentHistoryCsv}>
                <Download />{t('common.exportCsv')}
              </Button>
            </div>
          }
        />
        <Card title={t('student.yourAttendance')} description={t('student.totalRecords', { count: records.length })}>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Metric label={t('student.attendanceRate')} value={`${rate}%`} detail={t('student.fromRecords')} icon={ClipboardCheck} />
            <Metric label={t('common.present')} value={String(presentCount)} detail={t('student.sessionsAttended')} icon={CheckCircle2} tone="success" />
            <Metric label={t('common.needsReview')} value={String(records.filter((r) => r.status === 'flagged' || r.status === 'pending' || r.status === 'absent').length)} detail={t('student.teacherFollowUp')} icon={CircleAlert} tone="warning" />
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {['all', 'present', 'late', 'absent', 'excused'].map((item) => (
              <Button key={item} variant={filter === item ? 'primary' : 'outline'} onClick={() => setFilter(item)}>
                {item === 'excused' ? t('student.excused') : t(`common.${item}`)}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3">{t('common.class')}</th>
                  <th className="pb-3">{t('common.status')}</th>
                  <th className="pb-3">{t('common.confidence')}</th>
                  <th className="pb-3">{t('common.device')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 font-medium">{courses.find((c) => c.id === sessions.find((s) => s.id === r.sessionId)?.courseId)?.name ?? r.sessionId}</td>
                    <td className="py-3">
                      <Status tone={r.status === 'late' ? 'warning' : r.status === 'absent' ? 'danger' : r.status === 'excused' ? 'neutral' : 'success'}>
                        {statusText(t, r.status)}
                      </Status>
                    </td>
                    <td className="py-3 text-muted-foreground">{r.confidence ? `${r.confidence}%` : '—'}</td>
                    <td className="py-3 text-muted-foreground">{r.device || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* My Leave Requests Section */}
        <Card title={t('student.myLeaveRequests')} description={t('student.leaveModalDetail')}>
          {myLeaveList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t('student.noLeaveRequests')}</p>
          ) : (
            <div className="divide-y">
              {myLeaveList.map((req) => (
                <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{req.courseName}</span>
                      <span className="text-muted-foreground">({req.date})</span>
                    </div>
                    <p className="text-muted-foreground"><strong>{t('student.reasonLabel')}</strong> {req.reason}</p>
                    {req.evidenceNote && <p className="text-muted-foreground text-[11px]"><strong>{t('student.evidenceLabel')}</strong> {req.evidenceNote}</p>}
                    {req.attachmentUrl && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setStudentPreviewProofUrl(req.attachmentUrl!)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          <ImageIcon className="size-3.5" />
                          {t('teacher.viewProof')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Status tone={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'danger' : 'warning'}>
                      {req.status === 'approved' ? t('teacher.approved') : req.status === 'rejected' ? t('teacher.rejected') : t('common.pending')}
                    </Status>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Leave Request Submission Modal */}
        {leaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl text-slate-800 border border-slate-200">
              <button
                onClick={() => setLeaveModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
                  <FileCheck className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('student.leaveModalTitle')}</h3>
                  <p className="text-xs text-slate-500">{t('student.leaveModalDetail')}</p>
                </div>
              </div>

              <form onSubmit={handleLeaveSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.selectCourse')} *</label>
                  <select
                    value={leaveCourseId}
                    onChange={(e) => setLeaveCourseId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                  >
                    <option value="">-- {t('student.selectCourse')} --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.selectSession')} *</label>
                  <input
                    type="date"
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.absenceReason')} *</label>
                  <textarea
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder={t('student.leaveReasonPlaceholder')}
                    required
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.evidenceNote')}</label>
                  <input
                    type="text"
                    value={leaveEvidence}
                    onChange={(e) => setLeaveEvidence(e.target.value)}
                    placeholder={t('student.evidencePlaceholder')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('student.uploadProof')}
                  </label>
                  <div className="mt-1 flex flex-col gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:border-blue-400 transition-colors cursor-pointer">
                      <Upload className="size-4 text-blue-600 shrink-0" />
                      <span className="truncate">
                        {leaveAttachmentUrl ? t('student.proofAttached') : t('student.uploadProof')}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProofFileUpload}
                        className="hidden"
                      />
                    </label>
                    {leaveAttachmentUrl && (
                      <div className="relative inline-flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={leaveAttachmentUrl}
                          alt="Minh chứng"
                          className="h-16 w-24 object-cover rounded-lg border border-blue-200"
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-semibold text-blue-900">{t('student.proofAttached')}</p>
                          <button
                            type="button"
                            onClick={() => setLeaveAttachmentUrl(undefined)}
                            className="mt-1 text-[11px] font-medium text-rose-600 hover:underline cursor-pointer"
                          >
                            {t('student.removeProof')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setLeaveModalOpen(false)}>
                    {t('common.back')}
                  </Button>
                  <Button type="submit" disabled={submittingLeave}>
                    <Send className="size-4" />
                    {submittingLeave ? t('student.sendingLeave') : t('student.sendLeaveRequest')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Student Proof Preview Modal */}
        {studentPreviewProofUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white p-4 shadow-2xl text-slate-800">
              <div className="flex items-center justify-between border-b pb-3 mb-3">
                <h4 className="text-sm font-bold text-slate-900">{t('teacher.proofModalTitle')}</h4>
                <button
                  onClick={() => setStudentPreviewProofUrl(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={studentPreviewProofUrl}
                  alt="Minh chứng chi tiết"
                  className="max-h-[65vh] w-auto rounded-lg object-contain shadow-md"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (page === 'courses') {
    const semesterStart = sessions.map((s) => s.startDate).filter(Boolean).sort()[0] ?? '2026-01-01'
    const semesterEnd = sessions.map((s) => s.endDate).filter(Boolean).sort().at(-1) ?? '2026-12-31'
    const semesterStartDate = new Date(`${semesterStart}T00:00:00`)
    const semesterEndDate = new Date(`${semesterEnd}T00:00:00`)
    const firstMonday = new Date(semesterStartDate)
    const firstDay = firstMonday.getDay() || 7
    firstMonday.setDate(firstMonday.getDate() - firstDay + 1)
    const weekOptions: { value: string; label: string }[] = []
    for (let cursor = new Date(firstMonday); cursor <= semesterEndDate; cursor.setDate(cursor.getDate() + 7)) {
      const end = new Date(cursor)
      end.setDate(end.getDate() + 6)
      weekOptions.push({ value: cursor.toISOString().slice(0, 10), label: `Tuần ${weekOptions.length + 1} · ${cursor.toLocaleDateString('vi-VN')} – ${end.toLocaleDateString('vi-VN')}` })
    }
    const activeWeekStart = selectedWeekStart || weekOptions[0]?.value || semesterStart
    const activeWeekDate = new Date(`${activeWeekStart}T00:00:00`)
    const weeklySessions = sessions.filter((session) => {
      const day = session.dayOfWeek || 1
      const occurrence = new Date(activeWeekDate)
      occurrence.setDate(activeWeekDate.getDate() + day - 1)
      const dateValue = occurrence.toISOString().slice(0, 10)
      return dateValue >= (session.startDate ?? semesterStart) && dateValue <= (session.endDate ?? semesterEnd)
    })
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.workspace')} title={t('student.myClasses')} detail={t('student.myClassesDetail')} />
        <Card title="Lịch học theo tuần" description={`Học kỳ: ${semesterStart} → ${semesterEnd}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-medium">Chọn tuần</label>
            <select value={activeWeekStart} onChange={(event) => setSelectedWeekStart(event.target.value)} className="h-10 min-w-[260px] rounded-lg border bg-background px-3 text-sm">
              {weekOptions.map((week) => <option key={week.value} value={week.value}>{week.label}</option>)}
            </select>
          </div>
          {weeklySessions.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Tuần này không có ca học.</p> : <div className="divide-y">{weeklySessions.map((session) => { const course = courses.find((item) => item.id === session.courseId); const date = new Date(activeWeekDate); date.setDate(activeWeekDate.getDate() + (session.dayOfWeek || 1) - 1); return <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{course?.code ?? session.courseCode} · {course?.name ?? session.courseName}</p><p className="mt-1 text-xs text-muted-foreground">{date.toLocaleDateString('vi-VN')} · {session.startsAt} – {session.endsAt} · {session.room}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{session.status === 'live' ? 'Đang live' : 'Theo lịch'}</span></div> })}</div>}
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const courseSectionsList = sessions.filter((s) => s.courseId === course.id)
            const courseSessionIds = new Set(courseSectionsList.map((s) => s.id))
            const courseRecords = records.filter((r) => courseSessionIds.has(r.sessionId))
            const unexcusedAbsences = courseRecords.filter((r) => r.status === 'absent').length
            const isDisqualified = unexcusedAbsences >= 3
            const isWarning = unexcusedAbsences === 2
            return (
              <Card key={course.id} title={`${course.code} · ${course.name}`} description={`${course.department}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('common.attendance')}</span>
                    <strong>{rate}%</strong>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${rate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t">
                    <span className="text-muted-foreground">{t('teacher.academicWarningCol')}:</span>
                    <span
                      className={`rounded-md px-2.5 py-1 font-bold ${
                        isDisqualified
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : isWarning
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {isDisqualified
                        ? `${t('teacher.disqualified')} (${unexcusedAbsences} buổi vắng)`
                        : isWarning
                        ? `${t('teacher.atRisk')} (${unexcusedAbsences} buổi vắng)`
                        : t('teacher.eligible')}
                    </span>
                  </div>
                  <div className="divide-y text-xs text-muted-foreground">
                    {courseSectionsList.map((sec) => (
                      <div key={sec.sectionId} className="flex items-center justify-between py-2">
                        <span><Calendar className="mr-1 inline size-3.5" />{formatDayOfWeek(t, sec.dayOfWeek)} · {sec.startsAt} – {sec.endsAt}</span>
                        <span className="font-medium text-foreground">{sec.room}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  if (page === 'devices') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.security')} title={t('student.devicesTitle')} detail={t('student.devicesDetail')} />
        <Card title={t('student.trustedDevices')} description={t('student.devicesBound', { count: devices.length })}>
          {devices.length ? (
            devices.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Smartphone />
                  </div>
                  <div>
                    <p className="font-medium">{device.label}</p>
                    <p className="text-sm text-muted-foreground">{t('student.lastSeen', { time: device.lastSeenAt })}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Status>{device.trusted ? t('common.trusted') : t('common.pending')}</Status>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('student.noDevices')}</p>
          )}
        </Card>
        <Card title={t('student.privacyTitle')}>
          <p className="text-sm leading-6 text-muted-foreground">{t('student.privacyDetail')}</p>
        </Card>
      </div>
    )
  }

  if (page === 'notifications') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          eyebrow={t('student.workspace')}
          title={t('student.notificationsTitle')}
          detail={t('student.notificationsDetail')}
          action={<Button variant="outline" onClick={async () => { await api.markNotificationsRead(); setRead(notifications.map((n) => n.id)); await refresh() }}>{t('student.markAllRead')}</Button>}
        />
        <Card title={t('student.inbox')} description={t('student.unreadCount', { count: notifications.filter((n) => !read.includes(n.id)).length })}>
          <div className="divide-y">
            {notifications.map((n) => (
              <button key={n.id} onClick={() => setRead([...read, n.id])} className={`flex w-full gap-3 py-4 text-left ${!read.includes(n.id) ? 'bg-primary/5' : ''}`}>
                <Bell className="mt-1 size-4 text-primary" />
                <span className="flex-1">
                  <strong className="text-sm">{n.title}</strong>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                  <small className="text-muted-foreground">{n.createdAt}</small>
                </span>
                {!read.includes(n.id) && <span className="mt-2 size-2 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (page === 'profile') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.account')} title={t('student.profileTitle')} detail={t('student.profileDetail')} />
        <Card title={t('student.studentIdentity')}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid size-16 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {user.initials}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.department ?? t('roles.student')} · SmartAttend</p>
              {user.studentCode && <p className="text-sm text-muted-foreground">{t('login.studentId')}: {user.studentCode}</p>}
            </div>
          </div>
        </Card>
        <Card title={t('student.accountSecurity')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowChangePassword(true)}><LockKeyhole />{t('student.changePassword')}</Button>
          </div>
          {showChangePassword && (
            <div className="mt-5 border-t pt-5">
              <ChangePasswordForm onSuccess={async () => { setShowChangePassword(false); await onPasswordChanged?.(); await refresh() }} onCancel={() => setShowChangePassword(false)} />
            </div>
          )}
        </Card>
      </div>
    )
  }

  return <UtcStudentDashboard user={user} go={go} data={data} />
}

function StudentImportPanel({
  csvText,
  setCsvText,
  importing,
  importResult,
  targetCourseId,
  setTargetCourseId,
  courses,
  onImport,
  onClose,
  t,
}: {
  csvText: string
  setCsvText: (value: string) => void
  importing: boolean
  importResult: {
    created: { studentCode: string; name: string; defaultPassword: string }[]
    skipped: { studentCode: string; reason: string }[]
  } | null
  targetCourseId: string
  setTargetCourseId: (value: string) => void
  courses?: Course[]
  onImport: () => void
  onClose: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadedFileName(file.name)
    setCsvText(await file.text())
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.name.endsWith('.csv') || file.type.includes('csv') || file.type.includes('text'))) {
      setUploadedFileName(file.name)
      setCsvText(await file.text())
    }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/download/students-template.csv'
    link.download = 'students-template.csv'
    link.rel = 'noopener'
    link.click()
  }

  const copyPassword = (code: string, pass: string) => {
    navigator.clipboard.writeText(pass)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const downloadCreatedCredentials = () => {
    if (!importResult?.created.length) return
    const csv =
      '\uFEFFMã sinh viên,Họ và tên,Mật khẩu mặc định\n' +
      importResult.created.map((r) => `"${r.studentCode}","${r.name}","${r.defaultPassword}"`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'danh-sach-tai-khoan-sinh-vien.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Parse first few rows for live preview
  const preview = useMemo(() => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { rows: [], totalCount: 0 }
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('studentid') || firstLine.includes('student_id') || firstLine.includes('code')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const rows = dataLines.slice(0, 5).map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      const studentId = parts[0] || ''
      const name = parts[1] || ''
      const department = parts[2] || ''
      return {
        studentId,
        name,
        department,
        valid: Boolean(studentId && name),
      }
    })
    return { rows, totalCount: dataLines.length }
  }, [csvText])

  return (
    <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xl shadow-slate-100 dark:shadow-none space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 ring-4 ring-blue-500/10">
            <UserPlus className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                {t('teacher.importStudents')}
              </h2>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                CSV Batch Import
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {t('teacher.importStudentsDetail')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button type="button" variant="outline" onClick={downloadTemplate} className="gap-1.5 cursor-pointer">
            <Download className="size-3.5 text-blue-600" />
            <span>{t('teacher.downloadTemplate')}</span>
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Target Section Selector */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          <Layers className="size-4 text-blue-600 dark:text-blue-400" />
          <span>{t('admin.selectSectionForImport')}</span>
        </label>
        <select
          value={targetCourseId}
          onChange={(e) => setTargetCourseId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all cursor-pointer"
        >
          <option value="">Toàn bộ trường</option>
          {courses?.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
        </select>
      </div>

      {/* 3 Guideline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <FileSpreadsheet className="size-4 text-blue-600 dark:text-blue-400" />
            <span>Cấu trúc 3 cột bắt buộc</span>
          </div>
          <p className="font-mono text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-lg inline-block font-semibold">
            studentId, name, department
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Có thể có hoặc không có dòng tiêu đề đầu tiên.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <KeyRound className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mật khẩu khởi tạo</span>
          </div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-lg inline-block">
            Trùng với Mã sinh viên
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Ví dụ: SV mã <span className="font-mono font-medium">20210001</span> sẽ có mật khẩu ban đầu là <span className="font-mono font-medium">20210001</span>.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <CheckCircle2 className="size-4 text-indigo-600 dark:text-indigo-400" />
            <span>Kích hoạt tự động</span>
          </div>
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg inline-block">
            Sẵn sàng điểm danh
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Tài khoản sinh viên được tạo và ghi danh ngay vào các lớp học phần.
          </p>
        </div>
      </div>

      {/* Clean Sample Table Preview */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
          <span className="flex items-center gap-1.5">
            <Info className="size-3.5 text-blue-600" />
            Mẫu dữ liệu CSV chuẩn:
          </span>
          <span className="text-[11px] font-normal text-slate-400">Tải file mẫu để điền nhanh</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3.5 py-2 font-mono font-semibold">studentId (Mã SV)</th>
              <th className="px-3.5 py-2 font-semibold">name (Họ và tên)</th>
              <th className="px-3.5 py-2 font-semibold">department (Khoa/Lớp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
            <tr>
              <td className="px-3.5 py-1.5 text-blue-600 dark:text-blue-400 font-semibold">20210001</td>
              <td className="px-3.5 py-1.5 font-sans">Nguyen Van A</td>
              <td className="px-3.5 py-1.5 font-sans">Công nghệ thông tin</td>
            </tr>
            <tr>
              <td className="px-3.5 py-1.5 text-blue-600 dark:text-blue-400 font-semibold">20210002</td>
              <td className="px-3.5 py-1.5 font-sans">Tran Thi B</td>
              <td className="px-3.5 py-1.5 font-sans">Kỹ thuật xây dựng</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Upload Dropzone & Textarea */}
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

        {/* Dropzone area */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 bg-slate-50/20'
          }`}
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
            <Upload className="size-5" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
              Kéo thả tệp CSV vào đây, hoặc <span className="text-blue-600 dark:text-blue-400 underline">duyệt từ máy tính</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Hỗ trợ định dạng .csv (UTF-8)
            </p>
          </div>
          {uploadedFileName && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <FileCheck className="size-3.5" />
              <span>Đã nạp file: {uploadedFileName}</span>
            </div>
          )}
        </div>

        {/* Textarea editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hoặc dán nội dung CSV trực tiếp:
            </label>
            {preview.totalCount > 0 && (
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Phát hiện {preview.totalCount} dòng dữ liệu
              </span>
            )}
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 font-mono text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-600/10 transition-all placeholder:text-slate-400"
            placeholder={t('teacher.importPlaceholder')}
          />
        </div>
      </div>

      {/* Live Preview of Input Data */}
      {preview.rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden space-y-0">
          <div className="bg-slate-50 dark:bg-slate-800/70 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Xem trước dữ liệu ({preview.totalCount} sinh viên)</span>
            </div>
            <span className="text-[11px] font-normal text-slate-400">
              Hiển thị tối đa 5 dòng đầu
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/60 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3.5 py-2 font-semibold">Mã sinh viên</th>
                  <th className="px-3.5 py-2 font-semibold">Họ và tên</th>
                  <th className="px-3.5 py-2 font-semibold">Khoa/Ngành</th>
                  <th className="px-3.5 py-2 font-semibold text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {preview.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-3.5 py-2 font-mono font-medium text-slate-900 dark:text-white">
                      {row.studentId}
                    </td>
                    <td className="px-3.5 py-2 text-slate-700 dark:text-slate-300">
                      {row.name}
                    </td>
                    <td className="px-3.5 py-2 text-slate-500 dark:text-slate-400">
                      {row.department || '—'}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      {row.valid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="size-3" /> Hợp lệ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="size-3" /> Thiếu mã hoặc tên
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onImport}
            disabled={!csvText.trim() || importing}
            className="rounded-xl px-5 h-11 text-xs font-semibold shadow-sm shadow-blue-500/20 cursor-pointer"
          >
            {importing ? (
              <>
                <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('teacher.importing')}</span>
              </>
            ) : (
              <>
                <UserPlus className="size-4" />
                <span>
                  {t('teacher.runImport')}{' '}
                  {preview.totalCount > 0 ? `(${preview.totalCount} sinh viên)` : ''}
                </span>
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-11 text-xs font-semibold cursor-pointer">
            {t('common.back')}
          </Button>
        </div>

        {csvText.trim() && (
          <button
            type="button"
            onClick={() => {
              setCsvText('')
              setUploadedFileName(null)
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>Xóa nội dung</span>
          </button>
        )}
      </div>

      {/* Result presentation */}
      {importResult && (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-5 text-sm">
          {/* Success Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                  {t('teacher.importCreated', { count: importResult.created.length })}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sinh viên có thể đăng nhập ngay bằng mã SV và đổi mật khẩu sau khi vào hệ thống.
                </p>
              </div>
            </div>
            {importResult.created.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={downloadCreatedCredentials}
                className="gap-1.5 rounded-xl cursor-pointer"
              >
                <Download className="size-3.5 text-blue-600" />
                <span>Tải danh sách tài khoản (CSV)</span>
              </Button>
            )}
          </div>

          {/* Created Table */}
          {importResult.created.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3.5 py-2 font-semibold">{t('login.studentId')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('auth.fullName')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('teacher.defaultPassword')}</th>
                    <th className="px-3.5 py-2 font-semibold text-right">Sao chép</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importResult.created.map((row) => (
                    <tr key={row.studentCode} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-2 font-mono font-bold text-blue-600 dark:text-blue-400">{row.studentCode}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="px-3.5 py-2 font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded">{row.defaultPassword}</td>
                      <td className="px-3.5 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => copyPassword(row.studentCode, row.defaultPassword)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedCode === row.studentCode ? (
                            <>
                              <Check className="size-3 text-emerald-600" />
                              <span className="text-emerald-600">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>Chép MK</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Skipped alert */}
          {importResult.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                <span>{t('teacher.importSkipped', { count: importResult.skipped.length })}</span>
              </div>
              <ul className="mt-2 space-y-1 pl-5 list-disc text-amber-700/90 dark:text-amber-400/90">
                {importResult.skipped.map((row) => (
                  <li key={`${row.studentCode}-${row.reason}`}>
                    <span className="font-mono font-semibold">{row.studentCode}</span>: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TeacherImportPanel({
  csvText,
  setCsvText,
  importing,
  importResult,
  emailDomain,
  onImport,
  onClose,
  t,
}: {
  csvText: string
  setCsvText: (value: string) => void
  importing: boolean
  importResult: {
    created: { email: string; name: string; defaultPassword: string }[]
    skipped: { email: string; reason: string }[]
  } | null
  emailDomain: string | null
  onImport: () => void
  onClose: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const expectedDomain = emailDomain ?? 'utc.edu.vn'

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadedFileName(file.name)
    setCsvText(await file.text())
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && (file.name.endsWith('.csv') || file.type.includes('csv') || file.type.includes('text'))) {
      setUploadedFileName(file.name)
      setCsvText(await file.text())
    }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/download/lecturers-template.csv'
    link.download = 'lecturers-template.csv'
    link.rel = 'noopener'
    link.click()
  }

  const copyPassword = (email: string, pass: string) => {
    navigator.clipboard.writeText(pass)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 2000)
  }

  const downloadCreatedCredentials = () => {
    if (!importResult?.created.length) return
    const csv =
      '\uFEFFEmail,Họ và tên,Mật khẩu mặc định\n' +
      importResult.created.map((r) => `"${r.email}","${r.name}","${r.defaultPassword}"`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'danh-sach-tai-khoan-giang-vien.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Parse preview rows
  const preview = useMemo(() => {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { rows: [], totalCount: 0 }
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('email') || firstLine.includes('name')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const rows = dataLines.slice(0, 5).map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      const email = parts[0] || ''
      const name = parts[1] || ''
      const department = parts[2] || ''
      const isValidDomain = email.toLowerCase().endsWith(`@${expectedDomain.toLowerCase()}`)
      return {
        email,
        name,
        department,
        isValidDomain,
      }
    })
    return { rows, totalCount: dataLines.length }
  }, [csvText, expectedDomain])

  return (
    <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xl shadow-slate-100 dark:shadow-none space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 ring-4 ring-indigo-500/10">
            <Users className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                {t('admin.importLecturers')}
              </h2>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                Faculty Roster
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {t('admin.importLecturersDetail')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button type="button" variant="outline" onClick={downloadTemplate} className="gap-1.5 cursor-pointer">
            <Download className="size-3.5 text-indigo-600" />
            <span>{t('teacher.downloadTemplate')}</span>
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* 3 Guideline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <FileSpreadsheet className="size-4 text-indigo-600 dark:text-indigo-400" />
            <span>Cấu trúc 3 cột bắt buộc</span>
          </div>
          <p className="font-mono text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg inline-block font-semibold">
            email, name, department
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Có thể có hoặc không có dòng tiêu đề đầu tiên.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <Globe className="size-4 text-blue-600 dark:text-blue-400" />
            <span>Ràng buộc tên miền trường</span>
          </div>
          <p className="font-mono text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-lg inline-block font-semibold">
            @{expectedDomain}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Chỉ chấp nhận email thuộc tên miền chính thức của trường.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 dark:text-slate-200 mb-1">
            <KeyRound className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mật khẩu mặc định</span>
          </div>
          <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-lg inline-block font-semibold">
            Gv@123456
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Giảng viên nên đổi mật khẩu sau lần đăng nhập đầu tiên.
          </p>
        </div>
      </div>

      {/* Clean Sample Table Preview */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
          <span className="flex items-center gap-1.5">
            <Info className="size-3.5 text-indigo-600" />
            Mẫu dữ liệu CSV chuẩn:
          </span>
          <span className="text-[11px] font-normal text-slate-400">Tải file mẫu để điền nhanh</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3.5 py-2 font-mono font-semibold">email (Email trường)</th>
              <th className="px-3.5 py-2 font-semibold">name (Họ và tên)</th>
              <th className="px-3.5 py-2 font-semibold">department (Khoa/Bộ môn)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
            <tr>
              <td className="px-3.5 py-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">gv001@{expectedDomain}</td>
              <td className="px-3.5 py-1.5 font-sans">Nguyen Van A</td>
              <td className="px-3.5 py-1.5 font-sans">Computer Science</td>
            </tr>
            <tr>
              <td className="px-3.5 py-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">gv002@{expectedDomain}</td>
              <td className="px-3.5 py-1.5 font-sans">Tran Thi B</td>
              <td className="px-3.5 py-1.5 font-sans">Civil Engineering</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Upload Dropzone & Textarea */}
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

        {/* Dropzone area */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 bg-slate-50/20'
          }`}
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            <Upload className="size-5" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
              Kéo thả tệp CSV vào đây, hoặc <span className="text-indigo-600 dark:text-indigo-400 underline">duyệt từ máy tính</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Hỗ trợ định dạng .csv (UTF-8)
            </p>
          </div>
          {uploadedFileName && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <FileCheck className="size-3.5" />
              <span>Đã nạp file: {uploadedFileName}</span>
            </div>
          )}
        </div>

        {/* Textarea editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hoặc dán nội dung CSV trực tiếp:
            </label>
            {preview.totalCount > 0 && (
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                Phát hiện {preview.totalCount} dòng dữ liệu
              </span>
            )}
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 font-mono text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-indigo-600/10 transition-all placeholder:text-slate-400"
            placeholder="email,name,department"
          />
        </div>
      </div>

      {/* Live Preview of Input Data */}
      {preview.rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden space-y-0">
          <div className="bg-slate-50 dark:bg-slate-800/70 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Xem trước dữ liệu ({preview.totalCount} giảng viên)</span>
            </div>
            <span className="text-[11px] font-normal text-slate-400">
              Hiển thị tối đa 5 dòng đầu
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/60 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3.5 py-2 font-semibold">Email</th>
                  <th className="px-3.5 py-2 font-semibold">Họ và tên</th>
                  <th className="px-3.5 py-2 font-semibold">Khoa/Bộ môn</th>
                  <th className="px-3.5 py-2 font-semibold text-right">Trạng thái tên miền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {preview.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-3.5 py-2 font-mono font-medium text-slate-900 dark:text-white">
                      {row.email}
                    </td>
                    <td className="px-3.5 py-2 text-slate-700 dark:text-slate-300">
                      {row.name}
                    </td>
                    <td className="px-3.5 py-2 text-slate-500 dark:text-slate-400">
                      {row.department || '—'}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      {row.isValidDomain ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="size-3" /> Hợp lệ (@{expectedDomain})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="size-3" /> Sai tên miền trường
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onImport}
            disabled={!csvText.trim() || importing}
            className="rounded-xl px-5 h-11 text-xs font-semibold shadow-sm shadow-indigo-500/20 cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {importing ? (
              <>
                <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('teacher.importing')}</span>
              </>
            ) : (
              <>
                <Users className="size-4" />
                <span>
                  {t('admin.importLecturersSubmit')}{' '}
                  {preview.totalCount > 0 ? `(${preview.totalCount} giảng viên)` : ''}
                </span>
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-11 text-xs font-semibold cursor-pointer">
            {t('common.back')}
          </Button>
        </div>

        {csvText.trim() && (
          <button
            type="button"
            onClick={() => {
              setCsvText('')
              setUploadedFileName(null)
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>Xóa nội dung</span>
          </button>
        )}
      </div>

      {/* Result presentation */}
      {importResult && (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-5 text-sm">
          {/* Success Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                  {t('teacher.importCreated', { count: importResult.created.length })}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Giảng viên có thể đăng nhập bằng email trường và đổi mật khẩu sau khi vào hệ thống.
                </p>
              </div>
            </div>
            {importResult.created.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={downloadCreatedCredentials}
                className="gap-1.5 rounded-xl cursor-pointer"
              >
                <Download className="size-3.5 text-indigo-600" />
                <span>Tải danh sách tài khoản (CSV)</span>
              </Button>
            )}
          </div>

          {/* Created Table */}
          {importResult.created.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3.5 py-2 font-semibold">{t('admin.emailColumn') || 'Email'}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('auth.fullName')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('teacher.defaultPassword')}</th>
                    <th className="px-3.5 py-2 font-semibold text-right">Sao chép</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importResult.created.map((row) => (
                    <tr key={row.email} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">{row.email}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="px-3.5 py-2 font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded">{row.defaultPassword}</td>
                      <td className="px-3.5 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => copyPassword(row.email, row.defaultPassword)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedEmail === row.email ? (
                            <>
                              <Check className="size-3 text-emerald-600" />
                              <span className="text-emerald-600">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>Chép MK</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Skipped alert */}
          {importResult.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                <span>{t('teacher.importSkipped', { count: importResult.skipped.length })}</span>
              </div>
              <ul className="mt-2 space-y-1 pl-5 list-disc text-amber-700/90 dark:text-amber-400/90">
                {importResult.skipped.map((row) => (
                  <li key={`${row.email}-${row.reason}`}>
                    <span className="font-mono font-semibold">{row.email}</span>: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClassRosterModal({
  section,
  students,
  loading,
  search,
  setSearch,
  onClose,
  onRefresh,
  t,
}: {
  section: ClassSession
  students: { id: string; name: string; email: string; studentCode: string; department: string; status: string }[]
  loading: boolean
  search: string
  setSearch: (v: string) => void
  onClose: () => void
  onRefresh: () => Promise<void>
  t: (k: string, p?: Record<string, string | number>) => string
}) {
  const [activeTab, setActiveTab] = useState<'roster' | 'add' | 'import'>('roster')

  // Add student state
  const [addQuery, setAddQuery] = useState('')
  const [searchingAvailable, setSearchingAvailable] = useState(false)
  const [availableStudents, setAvailableStudents] = useState<
    { id: string; name: string; email: string; studentCode: string; department: string }[]
  >([])
  const [addingId, setAddingId] = useState<string | null>(null)
  const [batchCodes, setBatchCodes] = useState('')
  const [batchEnrolling, setBatchEnrolling] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Section import CSV state
  const sectionFileRef = useRef<HTMLInputElement>(null)
  const [sectionCsvText, setSectionCsvText] = useState('')
  const [sectionImporting, setSectionImporting] = useState(false)
  const [sectionImportResult, setSectionImportResult] = useState<{
    created: { studentCode: string; name: string; defaultPassword: string }[]
    skipped: { studentCode: string; reason: string }[]
  } | null>(null)

  // Remove student state
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Handle remove student
  const handleRemove = async (st: { id: string; name: string; studentCode: string }) => {
    const confirmed = window.confirm(
      t('admin.confirmRemoveStudent', { name: st.name, code: st.studentCode || st.id }),
    )
    if (!confirmed) return

    setRemovingId(st.id)
    setActionMessage(null)
    try {
      const res = await api.removeStudentFromSection(section.sectionId, st.id)
      if (res.ok) {
        setActionMessage({ type: 'success', text: t('admin.removeStudentSuccess') })
        await onRefresh()
      } else {
        setActionMessage({ type: 'error', text: res.message || 'Lỗi khi xóa sinh viên khỏi lớp.' })
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.' })
    } finally {
      setRemovingId(null)
    }
  }

  // Handle searching available students
  useEffect(() => {
    if (activeTab !== 'add') return
    const q = addQuery.trim()
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvailableStudents([])
      return
    }

    const timer = setTimeout(async () => {
      setSearchingAvailable(true)
      try {
        const res = await api.searchAvailableStudents(section.sectionId, q)
        if (res.ok) {
          setAvailableStudents(res.availableStudents)
        }
      } catch {
        setAvailableStudents([])
      } finally {
        setSearchingAvailable(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [addQuery, activeTab, section.sectionId])

  // Handle enroll single student
  const handleEnrollSingle = async (st: { id: string; studentCode: string; name: string }) => {
    setAddingId(st.id)
    setActionMessage(null)
    try {
      const res = await api.enrollStudentsToSection(section.sectionId, [st.id])
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: t('admin.importStudentsSuccess', { count: res.enrolledCount ?? 1 }),
        })
        setAvailableStudents((prev) => prev.filter((item) => item.id !== st.id))
        await onRefresh()
      } else {
        setActionMessage({ type: 'error', text: res.message || 'Lỗi khi ghi danh sinh viên.' })
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.' })
    } finally {
      setAddingId(null)
    }
  }

  // Handle batch enroll
  const handleBatchEnroll = async () => {
    const codes = batchCodes
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean)
    if (codes.length === 0) return

    setBatchEnrolling(true)
    setActionMessage(null)
    try {
      const res = await api.enrollStudentsToSection(section.sectionId, codes)
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: t('admin.importStudentsSuccess', { count: res.enrolledCount ?? codes.length }),
        })
        setBatchCodes('')
        await onRefresh()
      } else {
        setActionMessage({ type: 'error', text: res.message || 'Lỗi khi ghi danh sinh viên hàng loạt.' })
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.' })
    } finally {
      setBatchEnrolling(false)
    }
  }

  // Handle section-scoped CSV import
  const handleSectionFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSectionCsvText(await file.text())
  }

  const handleSectionImport = async () => {
    if (!sectionCsvText.trim()) return
    setSectionImporting(true)
    setSectionImportResult(null)
    setActionMessage(null)
    try {
      // A roster belongs to the course; synchronize it to every scheduled section.
      const res = await api.importStudents(sectionCsvText, section.courseId)
      if (res.ok) {
        setSectionImportResult({ created: res.created, skipped: res.skipped })
        setActionMessage({
          type: 'success',
          text: t('admin.importStudentsSuccess', { count: res.created.length }),
        })
        await onRefresh()
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi import CSV vào lớp.' })
    } finally {
      setSectionImporting(false)
    }
  }

  const downloadSectionTemplate = () => {
    const template =
      '\uFEFFstudentId,name,department\n20210001,Nguyen Van A,Computer Science\n20210002,Tran Thi B,Computer Science'
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `roster-${section.courseCode}-${section.room}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filtered = students.filter(
    (s) => `${s.name} ${s.studentCode} ${s.email} ${s.department}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl border bg-card p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Users className="size-5 text-primary" />
              {t('admin.classRoster')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {section.courseCode} · {section.courseName} · {section.room} · {section.startsAt} – {section.endsAt}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mt-3 flex gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => { setActiveTab('roster'); setActionMessage(null) }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'roster'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Users className="size-3.5" />
            {t('admin.tabCurrentRoster')} ({students.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('add'); setActionMessage(null) }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'add'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <UserPlus className="size-3.5" />
            {t('admin.tabAddStudent')}
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('import'); setActionMessage(null) }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'import'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Upload className="size-3.5" />
            {t('admin.tabImportSectionCsv')}
          </button>
        </div>

        {actionMessage && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/20 bg-destructive/10 text-destructive'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-xs hover:underline cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Current Roster */}
        {activeTab === 'roster' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-muted-foreground">
                {t('admin.enrolledStudentsCount', { count: students.length })}
              </div>
              <div className="flex flex-1 max-w-xs items-center gap-2 rounded-lg border px-2.5 py-1">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {students.length === 0 ? 'Lớp học phần này hiện chưa có sinh viên nào.' : t('admin.noUsersFound')}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 sticky top-0 border-b">
                    <tr>
                      <th className="p-3 font-semibold">{t('login.studentId')}</th>
                      <th className="p-3 font-semibold">{t('auth.fullName')}</th>
                      <th className="p-3 font-semibold">{t('login.email')}</th>
                      <th className="p-3 font-semibold">{t('common.department')}</th>
                      <th className="p-3 font-semibold text-center">{t('common.status')}</th>
                      <th className="p-3 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((st) => (
                      <tr key={st.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-medium text-primary">{st.studentCode || '—'}</td>
                        <td className="p-3 font-medium text-foreground">{st.name}</td>
                        <td className="p-3 text-muted-foreground">{st.email}</td>
                        <td className="p-3 text-muted-foreground">{st.department || '—'}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {t('common.active')}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={removingId === st.id}
                            onClick={() => handleRemove(st)}
                            className="h-7 px-2 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                            <span className="hidden sm:inline">{t('admin.removeStudentFromClass')}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Add Student */}
        {activeTab === 'add' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-4 pt-3">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tìm kiếm và thêm từng sinh viên
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder={t('admin.searchStudentPlaceholder')}
                  className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {searchingAvailable ? (
                <div className="py-4 text-center text-xs text-muted-foreground">{t('common.loading')}</div>
              ) : addQuery.trim() && availableStudents.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">{t('admin.noAvailableStudents')}</div>
              ) : availableStudents.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {availableStudents.map((st) => (
                    <div key={st.id} className="flex items-center justify-between p-2.5 hover:bg-muted/40 text-xs">
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <span className="font-mono text-primary">{st.studentCode || '—'}</span>
                          <span>{st.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {st.email} {st.department ? `· ${st.department}` : ''}
                        </div>
                      </div>
                      <Button
                        type="button"
                        disabled={addingId === st.id}
                        onClick={() => handleEnrollSingle(st)}
                        className="h-7 text-xs"
                      >
                        <UserPlus className="size-3.5" />
                        {t('admin.addSelectedStudent')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Thêm danh sách mã sinh viên hàng loạt
              </h3>
              <p className="text-xs text-muted-foreground">{t('admin.pasteCodesNotice')}</p>
              <textarea
                value={batchCodes}
                onChange={(e) => setBatchCodes(e.target.value)}
                rows={3}
                placeholder="20210001, 20210002, 20210003..."
                className="w-full rounded-lg border bg-background p-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                type="button"
                disabled={!batchCodes.trim() || batchEnrolling}
                onClick={handleBatchEnroll}
                className="text-xs"
              >
                <UserPlus className="size-3.5" />
                {batchEnrolling ? t('common.loading') : t('admin.addBatchStudents')}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 3: Section CSV Import */}
        {activeTab === 'import' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-3 pt-3">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Import danh sách sinh viên riêng cho lớp</h3>
                  <p className="text-xs text-muted-foreground">
                    Các sinh viên trong file CSV sẽ được tạo tài khoản (nếu chưa có) và ghi danh trực tiếp vào lớp này.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={sectionFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleSectionFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sectionFileRef.current?.click()}
                    className="text-xs"
                  >
                    <Upload className="size-3.5" />
                    {t('teacher.uploadCsv')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadSectionTemplate}
                    className="text-xs"
                  >
                    <Download className="size-3.5" />
                    {t('teacher.downloadTemplate')}
                  </Button>
                </div>
              </div>

              <textarea
                value={sectionCsvText}
                onChange={(e) => setSectionCsvText(e.target.value)}
                rows={5}
                className="w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
                placeholder="studentId,name,department&#10;20210001,Nguyen Van A,Computer Science&#10;20210002,Tran Thi B,Computer Science"
              />

              <Button
                type="button"
                disabled={!sectionCsvText.trim() || sectionImporting}
                onClick={handleSectionImport}
                className="text-xs"
              >
                {sectionImporting ? t('teacher.importing') : 'Nạp sinh viên vào lớp này'}
              </Button>

              {sectionImportResult && (
                <div className="mt-3 space-y-3 border-t pt-3 text-xs">
                  <p className="font-medium text-emerald-700 dark:text-emerald-300">
                    {t('teacher.importCreated', { count: sectionImportResult.created.length })}
                  </p>
                  {sectionImportResult.skipped.length > 0 && (
                    <div>
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {t('teacher.importSkipped', { count: sectionImportResult.skipped.length })}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-muted-foreground space-y-0.5">
                        {sectionImportResult.skipped.map((r, i) => (
                          <li key={i}>{r.studentCode}: {r.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end border-t pt-3">
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DepartmentModal({
  initialDept,
  onClose,
  onSaved,
}: {
  initialDept?: DepartmentItem | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [name, setName] = useState(initialDept?.name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const suggestions = [
    'Khoa Công nghệ thông tin',
    'Khoa Điện - Điện tử',
    'Khoa Công trình',
    'Khoa Cơ khí',
    'Khoa Vận tải - Kinh tế',
    'Khoa Quản trị kinh doanh',
    'Khoa Khoa học cơ bản',
    'Bộ môn Giáo dục thể chất & QP',
  ]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length < 2) {
      setError('Tên khoa/bộ môn phải từ 2 ký tự trở lên.')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (initialDept) {
        const res = await api.updateDepartment({ id: initialDept.id, name: trimmed })
        if (!res.ok) throw new Error(res.message || 'Không thể đổi tên khoa/bộ môn')
        onSaved(`Đã đổi tên khoa/bộ môn thành "${trimmed}" thành công.`)
      } else {
        const res = await api.createDepartment({ name: trimmed })
        if (!res.ok) throw new Error(res.message || 'Không thể tạo khoa/bộ môn')
        onSaved(`Đã thêm khoa/bộ môn "${trimmed}" thành công.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu khoa/bộ môn')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-6 shadow-2xl text-slate-800 dark:text-slate-100 my-auto">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-2xs">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {initialDept ? 'Đổi tên Khoa / Bộ môn' : 'Thêm Khoa / Bộ môn mới'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {initialDept ? `Cập nhật tên định danh cho ${initialDept.name}` : 'Thiết lập đơn vị đào tạo trực thuộc trường'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            <span>Tên Khoa / Bộ môn <span className="text-rose-500">*</span></span>
            <input
              type="text"
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="Ví dụ: Khoa Công nghệ thông tin"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          {/* Quick presets for new department */}
          {!initialDept && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Gợi ý đơn vị đào tạo phổ biến tại UTC:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setName(item)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      name === item
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {initialDept && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300">
              <p className="font-semibold flex items-center gap-1.5">
                <Info className="size-3.5" /> Đồng bộ dữ liệu tự động:
              </p>
              <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-400">
                Khi đổi tên khoa, tất cả các môn học và tài khoản giảng viên hiện thuộc &ldquo;{initialDept.name}&rdquo; sẽ được tự động đồng bộ sang tên mới.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 flex items-center gap-2">
              <CircleAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RotateCw className="size-4 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Check className="size-4 stroke-[2.5]" />
                  <span>{initialDept ? 'Lưu thay đổi' : 'Tạo khoa/bộ môn'}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteDepartmentModal({
  dept,
  coursesCount,
  onClose,
  onDeleted,
}: {
  dept: DepartmentItem
  coursesCount: number
  onClose: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const hasCourses = coursesCount > 0

  const confirmDelete = async () => {
    if (hasCourses) return
    setLoading(true)
    setError('')
    try {
      const res = await api.deleteDepartment(dept.id)
      if (!res.ok) throw new Error(res.message || 'Không thể xóa khoa/bộ môn')
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi hệ thống khi xóa khoa/bộ môn')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-6 shadow-2xl text-slate-800 dark:text-slate-100 my-auto">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className={`grid size-10 place-items-center rounded-xl ${hasCourses ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'}`}>
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {hasCourses ? 'Không thể xóa khoa/bộ môn' : 'Xác nhận xóa khoa/bộ môn'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{dept.name}</p>
          </div>
        </div>

        <div className="mt-4 text-xs space-y-3">
          {hasCourses ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-bold">Đang có {coursesCount} môn học trực thuộc khoa này!</p>
              <p className="mt-1 text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Để đảm bảo tính toàn vẹn dữ liệu học phần và điểm danh của sinh viên, bạn phải chuyển các môn học hiện tại sang khoa khác trước khi có thể xóa khoa này.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <p className="font-bold">Bạn có chắc chắn muốn xóa khoa &ldquo;{dept.name}&rdquo;?</p>
              <p className="mt-1 text-[11px] text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                Khoa này hiện chưa có môn học nào trực thuộc. Thao tác xóa sẽ được lưu vào nhật ký kiểm toán hệ thống.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            {hasCourses ? 'Đã hiểu & Quay lại' : 'Hủy'}
          </Button>
          {!hasCourses && (
            <Button
              type="button"
              disabled={loading}
              onClick={confirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RotateCw className="size-4 animate-spin" />
                  <span>Đang xóa...</span>
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  <span>Xóa vĩnh viễn</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CourseModal({
  departments,
  teachers,
  isAdmin,
  onClose,
  onCreated,
  t,
}: {
  departments: string[]
  teachers: { id: string; name: string; email: string }[]
  isAdmin: boolean
  onClose: () => void
  onCreated: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState(departments[0] || 'Khoa Công nghệ thông tin')
  const [color] = useState('indigo')
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.createCourse({ code, name, department, color, teacherId: isAdmin ? teacherId : undefined })
      if (!res.ok) throw new Error(res.message || 'Failed to create course')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-semibold">{t('common.createNewCourse')}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.courseCode')}
            <input className="h-11 rounded-lg border bg-background px-3 uppercase font-mono outline-none focus:ring-2 focus:ring-primary" placeholder="IT301" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.courseName')}
            <input className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" placeholder="Lập trình Web nâng cao" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.department')}
            {departments.length > 0 ? (
              <select
                className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
              >
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
              />
            )}
          </label>
          {isAdmin && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Giảng viên phụ trách
              <select className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                <option value="" disabled>Chọn giảng viên</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.email}</option>)}
              </select>
            </label>
          )}
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.back')}</Button>
            <Button type="submit" disabled={loading}>{loading ? '...' : t('common.createNew')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export type SessionTypeKey = 'theory' | 'practice' | 'makeup' | 'exam' | 'tutoring'

export function parseSessionType(roomStr: string): {
  type: SessionTypeKey
  cleanRoom: string
  label: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
} {
  const room = (roomStr || '').trim()
  if (/\[\s*thực hành\s*\]|\(\s*thực hành\s*\)|thực hành|lab|thí nghiệm|pm\.|pm /i.test(room)) {
    return {
      type: 'practice',
      cleanRoom: room.replace(/\[\s*thực hành\s*\]|\(\s*thực hành\s*\)/gi, '').trim(),
      label: 'Thực hành',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      badgeText: 'text-emerald-700 dark:text-emerald-300',
      badgeBorder: 'border-emerald-200 dark:border-emerald-800',
    }
  }
  if (/\[\s*học bù[^\]]*\]|\(\s*học bù[^\)]*\)|học bù|dạy bù/i.test(room)) {
    return {
      type: 'makeup',
      cleanRoom: room.replace(/\[\s*học bù[^\]]*\]|\(\s*học bù[^\)]*\)/gi, '').trim(),
      label: 'Học bù',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
      badgeText: 'text-amber-700 dark:text-amber-300',
      badgeBorder: 'border-amber-200 dark:border-amber-800',
    }
  }
  if (/\[\s*kiểm tra\s*\]|\(\s*kiểm tra\s*\)|\[\s*thi\s*\]|\(\s*thi\s*\)|kiểm tra|thi|đồ án|bảo vệ/i.test(room)) {
    return {
      type: 'exam',
      cleanRoom: room.replace(/\[\s*kiểm tra\s*\]|\(\s*kiểm tra\s*\)|\[\s*thi\s*\]|\(\s*thi\s*\)/gi, '').trim(),
      label: 'Kiểm tra',
      badgeBg: 'bg-purple-50 dark:bg-purple-950/40',
      badgeText: 'text-purple-700 dark:text-purple-300',
      badgeBorder: 'border-purple-200 dark:border-purple-800',
    }
  }
  if (/\[\s*phụ đạo\s*\]|\(\s*phụ đạo\s*\)|phụ đạo|bổ trợ/i.test(room)) {
    return {
      type: 'tutoring',
      cleanRoom: room.replace(/\[\s*phụ đạo\s*\]|\(\s*phụ đạo\s*\)/gi, '').trim(),
      label: 'Phụ đạo',
      badgeBg: 'bg-sky-50 dark:bg-sky-950/40',
      badgeText: 'text-sky-700 dark:text-sky-300',
      badgeBorder: 'border-sky-200 dark:border-sky-800',
    }
  }
  return {
    type: 'theory',
    cleanRoom: room.replace(/\[\s*lý thuyết\s*\]|\(\s*lý thuyết\s*\)|\[\s*chính khóa\s*\]/gi, '').trim(),
    label: 'Chính khóa',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-200 dark:border-blue-800',
  }
}

function ScheduleModal({
  courses,
  initialCourseId,
  initialSection,
  isAdmin = false,
  onClose,
  onSaved,
  t,
}: {
  courses: Course[]
  initialCourseId?: string
  initialSection?: ClassSession
  isAdmin?: boolean
  onClose: () => void
  onSaved: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const initialRoom = initialSection?.room ?? ''
  const initialMeta = useMemo(() => parseSessionType(initialRoom), [initialRoom])
  const [courseId, setCourseId] = useState(initialSection?.courseId || initialCourseId || courses[0]?.id || '')
  const [sessionType, setSessionType] = useState<SessionTypeKey>(initialMeta.type || 'theory')
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialSection?.dayOfWeek ?? 1)
  const [startsAt, setStartsAt] = useState(initialSection?.startsAt || '07:00')
  const [endsAt, setEndsAt] = useState(initialSection?.endsAt || '09:25')
  const [startDate, setStartDate] = useState(initialSection?.startDate || '2026-01-01')
  const [endDate, setEndDate] = useState(initialSection?.endDate || '2026-12-31')
  const [room, setRoom] = useState(initialMeta.cleanRoom || initialRoom || 'P.302 - Nhà A1')

  const [makeupNote, setMakeupNote] = useState(() => {
    if (!initialRoom) return ''
    const match = initialRoom.match(/\[\s*Học bù\s*-\s*([^\]]+)\]/i)
    return match ? match[1].trim() : ''
  })

  const [autoStart, setAutoStart] = useState(initialSection?.autoStart ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sessionTypes: {
    key: SessionTypeKey
    title: string
    subtitle: string
    icon: typeof BookOpen
    activeColor: string
    activeBorder: string
    activeBg: string
  }[] = [
    {
      key: 'theory',
      title: t('teacher.sessionTypeTheory') || 'Chính khóa / Lý thuyết',
      subtitle: t('teacher.sessionTypeTheoryDesc') || 'Ca giảng dạy lý thuyết theo tiến trình học phần',
      icon: BookOpen,
      activeColor: 'text-blue-600 dark:text-blue-400',
      activeBorder: 'border-blue-500 dark:border-blue-400',
      activeBg: 'bg-blue-50/80 dark:bg-blue-950/40',
    },
    {
      key: 'practice',
      title: t('teacher.sessionTypePractice') || 'Thực hành / Thí nghiệm',
      subtitle: t('teacher.sessionTypePracticeDesc') || 'Thực hành máy tính, phòng lab hoặc thí nghiệm',
      icon: FlaskConical,
      activeColor: 'text-emerald-600 dark:text-emerald-400',
      activeBorder: 'border-emerald-500 dark:border-emerald-400',
      activeBg: 'bg-emerald-50/80 dark:bg-emerald-950/40',
    },
    {
      key: 'makeup',
      title: t('teacher.sessionTypeMakeup') || 'Học bù',
      subtitle: t('teacher.sessionTypeMakeupDesc') || 'Dạy bù ngày nghỉ lễ, bận công tác hoặc đột xuất',
      icon: CalendarClock,
      activeColor: 'text-amber-600 dark:text-amber-400',
      activeBorder: 'border-amber-500 dark:border-amber-400',
      activeBg: 'bg-amber-50/80 dark:bg-amber-950/40',
    },
    {
      key: 'exam',
      title: t('teacher.sessionTypeExam') || 'Kiểm tra / Thi / Đồ án',
      subtitle: t('teacher.sessionTypeExamDesc') || 'Buổi thi giữa kỳ, kiểm tra hoặc bảo vệ đồ án',
      icon: FileCheck2,
      activeColor: 'text-purple-600 dark:text-purple-400',
      activeBorder: 'border-purple-500 dark:border-purple-400',
      activeBg: 'bg-purple-50/80 dark:bg-purple-950/40',
    },
    {
      key: 'tutoring',
      title: t('teacher.sessionTypeTutoring') || 'Bổ trợ / Phụ đạo',
      subtitle: t('teacher.sessionTypeTutoringDesc') || 'Buổi ôn tập, giải đáp thắc mắc chuyên đề',
      icon: Sparkles,
      activeColor: 'text-sky-600 dark:text-sky-400',
      activeBorder: 'border-sky-500 dark:border-sky-400',
      activeBg: 'bg-sky-50/80 dark:bg-sky-950/40',
    },
  ]

  // Standard UTC period quick chips
  const utcPeriodChips = [
    { label: 'Tiết 1 – 3 (Sáng)', start: '07:00', end: '09:25' },
    { label: 'Tiết 4 – 6 (Sáng)', start: '09:35', end: '12:00' },
    { label: 'Tiết 7 – 9 (Chiều)', start: '12:45', end: '15:10' },
    { label: 'Tiết 10 – 12 (Chiều)', start: '15:20', end: '17:45' },
    { label: 'Tiết 13 – 15 (Tối)', start: '18:00', end: '20:25' },
  ]

  // Room suggestions based on session type
  const roomSuggestions = useMemo(() => {
    switch (sessionType) {
      case 'practice':
        return ['PM.201 - Nhà A1', 'PM.305 - Nhà B3', 'Lab IoT - P.402', 'Xưởng Cơ khí - C5']
      case 'makeup':
        return ['P.201 - Nhà A1', 'P.302 - Nhà A1', 'P.405 - Nhà A2', 'Online (Google Meet)']
      case 'exam':
        return ['Hội trường G3', 'P.302 - Nhà A1', 'PM.201 - Nhà A1', 'P.405 - Nhà A2']
      case 'tutoring':
        return ['P.201 - Nhà A1', 'Phòng Hội thảo A1', 'Online (Zoom)']
      default:
        return ['P.201 - Nhà A1', 'P.302 - Nhà A1', 'P.405 - Nhà A2', 'Hội trường G3']
    }
  }, [sessionType])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const clean = room.replace(/\[[^\]]+\]|\([^\)]+\)/g, '').trim() || 'P.302'
      let composedRoom = clean
      if (sessionType === 'practice') {
        composedRoom = `${clean} [Thực hành]`
      } else if (sessionType === 'makeup') {
        const note = makeupNote.trim()
        composedRoom = note ? `${clean} [Học bù - ${note}]` : `${clean} [Học bù]`
      } else if (sessionType === 'exam') {
        composedRoom = `${clean} [Kiểm tra]`
      } else if (sessionType === 'tutoring') {
        composedRoom = `${clean} [Phụ đạo]`
      } else if (sessionType === 'theory') {
        composedRoom = `${clean} [Lý thuyết]`
      }

      // Ensure room string length does not exceed 50 characters (Zod schema limit)
      if (composedRoom.length > 50) {
        const tag = composedRoom.slice(clean.length)
        const allowedCleanLen = Math.max(10, 50 - tag.length)
        composedRoom = `${clean.slice(0, allowedCleanLen)}${tag}`
      }

      if (initialSection) {
        const res = await api.updateSection(initialSection.sectionId, {
          room: composedRoom,
          startsAt,
          endsAt,
          startDate,
          endDate,
          dayOfWeek,
          autoStart,
        })
        if (!res.ok) throw new Error(res.message || 'Không thể cập nhật ca học')
      } else {
        const res = await api.createSection({
          courseId,
          room: composedRoom,
          startsAt,
          endsAt,
          startDate,
          endDate,
          dayOfWeek,
          autoStart,
        })
        if (!res.ok) throw new Error(res.message || 'Không thể đăng ký ca học')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi hệ thống khi lưu ca học')
    } finally {
      setLoading(false)
    }
  }

  const days = [
    { value: 1, label: t('common.day1') },
    { value: 2, label: t('common.day2') },
    { value: 3, label: t('common.day3') },
    { value: 4, label: t('common.day4') },
    { value: 5, label: t('common.day5') },
    { value: 6, label: t('common.day6') },
    { value: 7, label: t('common.day7') },
  ]

  const modalTitle = initialSection
    ? (t('common.editSchedule') || 'Chỉnh sửa ca học')
    : isAdmin
      ? (t('common.addSchedule') || 'Thêm ca học cố định')
      : (t('teacher.registerSession') || 'Đăng ký ca học mới')

  const modalSubtitle = isAdmin
    ? t('common.scheduleDetail')
    : (t('teacher.registerSessionDesc') || 'Đăng ký ca học chính khóa, ca thực hành, học bù hoặc thi cho các học phần được phân công')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-6 shadow-2xl my-auto text-slate-800 dark:text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-2xs">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {modalTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{modalSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
          {/* Kiểu ca học (Session Type Selector) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('teacher.sessionType') || 'Kiểu ca học'} <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Chọn hình thức tổ chức ca học
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {sessionTypes.map((item) => {
                const Icon = item.icon
                const isSelected = sessionType === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSessionType(item.key)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? `${item.activeBorder} ${item.activeBg} ring-2 ring-blue-500/20 shadow-xs`
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white dark:bg-slate-900 shadow-2xs' : 'bg-slate-200/60 dark:bg-slate-800'}`}>
                        <Icon className={`size-4 ${isSelected ? item.activeColor : 'text-slate-500 dark:text-slate-400'}`} />
                      </div>
                      {isSelected && (
                        <Check className="size-3.5 text-blue-600 dark:text-blue-400 stroke-[3]" />
                      )}
                    </div>
                    <span className={`text-xs font-bold mt-1 ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {item.title}
                    </span>
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400 line-clamp-1 leading-tight">
                      {item.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ghi chú khi chọn ca Học bù */}
          {sessionType === 'makeup' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 flex flex-col gap-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-bold">
                <CalendarClock className="size-4 shrink-0" />
                <span>{t('teacher.makeupNoteLabel') || 'Ghi chú ca học bù'} (tùy chọn)</span>
              </div>
              <input
                type="text"
                value={makeupNote}
                onChange={(e) => setMakeupNote(e.target.value)}
                placeholder={t('teacher.makeupNotePlaceholder') || 'Ví dụ: Dạy bù buổi nghỉ lễ 10/11 hoặc Bù bài 4: SQL'}
                className="h-10 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 italic">
                * Ghi chú này sẽ được đính kèm vào tên ca học để sinh viên dễ dàng theo dõi thời khóa biểu học bù.
              </p>
            </div>
          )}

          {/* Chọn môn học (Khi tạo mới) */}
          {!initialSection && (
            <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span>{t('common.course')} <span className="text-rose-500">*</span></span>
              {courses.length === 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-normal text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                  Bạn chưa được phân công môn học nào. Vui lòng liên hệ Quản trị viên để được phân công học phần phụ trách.
                </div>
              ) : (
                <select
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name} {c.department ? `(${c.department})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Thứ trong tuần */}
          <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            <span>{t('common.dayOfWeek')} <span className="text-rose-500">*</span></span>
            <select
              className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {days.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              Ngày bắt đầu học kỳ
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-lg border bg-background px-2 text-xs" required />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              Ngày kết thúc học kỳ
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 rounded-lg border bg-background px-2 text-xs" required />
            </label>
          </div>

          {/* Khung giờ học UTC */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('teacher.timeSlotQuickPick') || 'Khung tiết học UTC'}
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Chọn nhanh hoặc tự nhập</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {utcPeriodChips.map((slot) => {
                const isActive = startsAt === slot.start && endsAt === slot.end
                return (
                  <button
                    key={slot.label}
                    type="button"
                    onClick={() => {
                      setStartsAt(slot.start)
                      setEndsAt(slot.end)
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-2xs font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-blue-600" />
                  {t('common.startTime')}
                </span>
                <input
                  type="time"
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-slate-500" />
                  {t('common.endTime')}
                </span>
                <input
                  type="time"
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </label>
            </div>
          </div>

          {/* Phòng học / Phòng máy */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('common.room')} <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('teacher.roomQuickPick') || 'Gợi ý phòng'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {roomSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setRoom(sug)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    room === sug
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-3 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ví dụ: P.302 - Nhà A1 hoặc PM.204"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Tự động mở điểm danh */}
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3 text-xs cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900/80 transition-colors">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="mt-0.5 size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="flex-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">{t('common.autoOpen')}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('common.autoStartTooltip')}</p>
            </div>
          </label>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 flex items-center gap-2">
              <CircleAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">
              {t('common.back')}
            </Button>
            <Button
              type="submit"
              disabled={loading || (!initialSection && courses.length === 0)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RotateCw className="size-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Check className="size-4 stroke-[2.5]" />
                  <span>{initialSection ? t('common.saveChanges') : (isAdmin ? t('common.saveChanges') : (t('teacher.registerSession') || 'Đăng ký ca học'))}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProofPreviewModal({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white p-5 shadow-2xl text-slate-800 border border-slate-200">
        <div className="flex items-center justify-between border-b pb-3 mb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">{t('teacher.proofModalTitle')}</h4>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Minh chứng chi tiết"
            className="max-h-[65vh] w-auto rounded-lg object-contain shadow-sm border border-slate-200"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
        </div>
      </div>
    </div>
  )
}

function PrintableAttendanceSheetModal({
  course,
  summary,
  loading,
  user,
  filter,
  onFilterChange,
  onClose,
}: {
  course: Course
  summary: Awaited<ReturnType<typeof api.courseAttendanceSummary>> | null
  loading: boolean
  user: AppUser
  filter: 'all' | 'warning' | 'disqualified'
  onFilterChange: (f: 'all' | 'warning' | 'disqualified') => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const students = summary?.students || []
  const filteredStudents = students.filter((s) => {
    if (filter === 'all') return true
    return s.warningStatus === filter
  })

  const totalSessions = summary?.totalSessions || 15
  const eligibleCount = students.filter((s) => s.warningStatus === 'good').length
  const warningCount = students.filter((s) => s.warningStatus === 'warning').length
  const disqualifiedCount = students.filter((s) => s.warningStatus === 'disqualified').length

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-6 backdrop-blur-xs flex flex-col items-center">
      {/* Top action toolbar (Hidden when printing) */}
      <div className="no-print w-full max-w-5xl mb-4 flex items-center justify-between gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="bg-white/20 text-white border-white/30 hover:bg-white/30" onClick={onClose}>
            <ArrowLeft className="size-4" /> {t('common.back')}
          </Button>
          <div className="hidden sm:block">
            <h3 className="text-sm font-bold">{t('teacher.printAttendanceSheet')}</h3>
            <p className="text-[11px] text-white/80">{course.code} · {course.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as 'all' | 'warning' | 'disqualified')}
            className="rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-xs font-semibold text-white outline-none cursor-pointer backdrop-blur-md"
          >
            <option value="all" className="text-slate-900">{t('teacher.filterAllEligibility')} ({students.length})</option>
            <option value="warning" className="text-slate-900">{t('teacher.filterWarning')} ({warningCount})</option>
            <option value="disqualified" className="text-slate-900">{t('teacher.filterDisqualified')} ({disqualifiedCount})</option>
          </select>
          <Button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <Printer className="size-4" /> {t('teacher.printAttendanceSheet')}
          </Button>
        </div>
      </div>

      {/* A4 Landscape Printable Paper */}
      <div className="printable-attendance-sheet w-full max-w-5xl bg-white text-slate-900 p-8 sm:p-10 rounded-2xl shadow-2xl border border-slate-200">
        {/* Ministry & University Official Header */}
        <div className="grid grid-cols-2 gap-4 border-b pb-4 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-700">TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI</p>
            <p className="text-xs font-bold uppercase text-slate-900">PHÒNG ĐÀO TẠO ĐẠI HỌC</p>
            <p className="text-[11px] text-slate-500 italic mt-0.5">Khoa/Bộ môn: {course.department || 'Công nghệ Thông tin'}</p>
          </div>
          <div>
            <p className="text-xs uppercase font-bold text-slate-900">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="text-xs font-bold text-slate-900">Độc lập - Tự do - Hạnh phúc</p>
            <p className="text-[10px] text-slate-400">───────────────────</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center my-5">
          <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
            {t('teacher.printSubtitle')}
          </h1>
          <p className="text-xs italic text-slate-600 mt-1">
            Học kỳ I · Năm học 2026 - 2027 · Ngày in: {new Date().toLocaleDateString('vi-VN')}
          </p>
        </div>

        {/* Course metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
          <p><strong>Học phần:</strong> {course.name} ({course.code})</p>
          <p><strong>Giảng viên phụ trách:</strong> {user.name}</p>
          <p><strong>Tổng số buổi giảng dạy:</strong> {totalSessions} buổi</p>
          <p><strong>Quy chế cấm thi:</strong> Nghỉ quá 20% tổng số buổi (≥ 3 buổi) sẽ bị cấm thi kết thúc HP.</p>
          <p className="sm:col-span-2 text-[11px] text-slate-500 italic border-t border-slate-200 pt-1.5 mt-1">
            Tổng số SV: <strong>{students.length}</strong> · Đủ điều kiện: <strong className="text-emerald-700">{eligibleCount}</strong> · Nguy cơ cấm thi: <strong className="text-amber-700">{warningCount}</strong> · Bị cấm thi: <strong className="text-rose-700">{disqualifiedCount}</strong>
          </p>
        </div>

        {/* Students Table */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">Đang tải dữ liệu điểm danh...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 text-[11px] font-bold text-center">
                  <th className="border border-slate-300 py-2 px-1 w-8">STT</th>
                  <th className="border border-slate-300 py-2 px-2 w-20">Mã SV</th>
                  <th className="border border-slate-300 py-2 px-3 text-left">Họ và tên</th>
                  <th className="border border-slate-300 py-2 px-2 w-20">Lớp/Khoa</th>
                  <th className="border border-slate-300 py-2 px-1 w-12" title="Tổng buổi">Tổng</th>
                  <th className="border border-slate-300 py-2 px-1 w-12 text-emerald-700" title="Có mặt">Có mặt</th>
                  <th className="border border-slate-300 py-2 px-1 w-12 text-amber-700" title="Muộn">Muộn</th>
                  <th className="border border-slate-300 py-2 px-1 w-12 text-blue-700" title="Vắng có phép">Vắng CP</th>
                  <th className="border border-slate-300 py-2 px-1 w-12 text-rose-700 font-extrabold" title="Vắng không phép">Vắng KP</th>
                  <th className="border border-slate-300 py-2 px-1 w-14">Tỷ lệ vắng</th>
                  <th className="border border-slate-300 py-2 px-3 w-28">Kết luận</th>
                  <th className="border border-slate-300 py-2 px-2 w-20">Ký tên</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => (
                  <tr key={st.studentId} className={`text-center ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                    <td className="border border-slate-300 py-1.5 px-1 text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 py-1.5 px-2 font-mono font-medium">{st.studentCode || '—'}</td>
                    <td className="border border-slate-300 py-1.5 px-3 text-left font-semibold text-slate-900">{st.studentName}</td>
                    <td className="border border-slate-300 py-1.5 px-2 text-slate-600">{st.department || '—'}</td>
                    <td className="border border-slate-300 py-1.5 px-1">{st.totalConducted || totalSessions}</td>
                    <td className="border border-slate-300 py-1.5 px-1 font-semibold text-emerald-700">{st.presentCount}</td>
                    <td className="border border-slate-300 py-1.5 px-1 text-amber-700">{st.lateCount}</td>
                    <td className="border border-slate-300 py-1.5 px-1 text-blue-700">{st.excusedCount}</td>
                    <td className={`border border-slate-300 py-1.5 px-1 font-bold ${st.unexcusedCount > 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-600'}`}>
                      {st.unexcusedCount}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-1 font-medium">{st.attendanceRate}%</td>
                    <td className="border border-slate-300 py-1.5 px-2 font-bold text-[10px]">
                      {st.warningStatus === 'disqualified' ? (
                        <span className="text-rose-700 uppercase">CẤM THI</span>
                      ) : st.warningStatus === 'warning' ? (
                        <span className="text-amber-700 uppercase">NGUY CƠ</span>
                      ) : (
                        <span className="text-emerald-700 uppercase">ĐỦ ĐK</span>
                      )}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-1 text-slate-400 text-[10px]"></td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={12} className="border border-slate-300 py-6 text-center text-xs text-slate-500">
                      Không có sinh viên nào trong danh mục này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Official Signatures */}
        <div className="mt-8 pt-4 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <p className="font-semibold italic text-slate-600">Hà Nội, ngày ... tháng ... năm 2026</p>
            <p className="font-bold uppercase mt-1 text-slate-800">TRƯỞNG BỘ MÔN / TRƯỞNG KHOA</p>
            <p className="text-[11px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-semibold italic text-slate-600">Hà Nội, ngày ... tháng ... năm 2026</p>
            <p className="font-bold uppercase mt-1 text-slate-800">GIẢNG VIÊN PHỤ TRÁCH HỌC PHẦN</p>
            <p className="text-[11px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</p>
            <div className="h-16" />
            <p className="font-bold text-slate-900">{user.name}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StaffView({ role, page, go, data, user, organization, refresh }: ViewProps & { role: 'teacher' | 'admin' }) {
  const { t } = useI18n()
  const { courses, sessions, live, metrics, suspicious, auditEvents, users, departments, leaveRequests = [] } = data
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: { studentCode: string; name: string; defaultPassword: string }[]
    skipped: { studentCode: string; reason: string }[]
  } | null>(null)

  const [teacherImportOpen, setTeacherImportOpen] = useState(false)
  const [teacherCsvText, setTeacherCsvText] = useState('')
  const [teacherImporting, setTeacherImporting] = useState(false)
  const [teacherImportResult, setTeacherImportResult] = useState<{
    created: { email: string; name: string; defaultPassword: string }[]
    skipped: { email: string; reason: string }[]
  } | null>(null)

  const [emailDomain, setEmailDomain] = useState<string>(organization.emailDomain ?? '')

  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [showStaffChangePassword, setShowStaffChangePassword] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>()
  const [selectedSection, setSelectedSection] = useState<ClassSession | undefined>()
  const [departmentsList, setDepartmentsList] = useState<DepartmentItem[]>([])
  const [deptLoading, setDeptLoading] = useState(false)
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null)
  const [deletingDept, setDeletingDept] = useState<DepartmentItem | null>(null)
  const [deptSearch, setDeptSearch] = useState('')

  const refreshDepartments = async () => {
    setDeptLoading(true)
    try {
      const res = await api.listDepartments()
      if (res.ok && res.departments) {
        setDepartmentsList(res.departments)
      }
    } catch {
      /* ignore */
    } finally {
      setDeptLoading(false)
    }
  }

  useEffect(() => {
    if (page !== 'departments') return
    let active = true
    api.listDepartments().then((res) => {
      if (active && res.ok && res.departments) {
        setDepartmentsList(res.departments)
      }
    }).catch(() => {
      /* ignore */
    })
    return () => {
      active = false
    }
  }, [page])

  const filteredDepartments = useMemo(() => {
    if (!deptSearch.trim()) return departmentsList
    const q = deptSearch.trim().toLowerCase()
    return departmentsList.filter((d) => d.name.toLowerCase().includes(q))
  }, [departmentsList, deptSearch])
  const [projectorMode, setProjectorMode] = useState(false)
  const [ultrasonicActive, setUltrasonicActive] = useState(false)
  const beaconRef = useRef<BeaconController | null>(null)
  const liveActive = Boolean(live)

  const [sessionRemaining, setSessionRemaining] = useState<number>(() => {
    if (live?.remainingSeconds !== undefined) return live.remainingSeconds
    if (live?.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 1000)
      return Math.max(0, 180 - elapsed)
    }
    return 180
  })

  useEffect(() => {
    if (!liveActive || !live) {
      queueMicrotask(() => setSessionRemaining(180))
      return
    }
    const initialRemaining = live.remainingSeconds ?? (
      live.startedAt ? Math.max(0, 180 - Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 1000)) : 180
    )
    queueMicrotask(() => setSessionRemaining(initialRemaining))

    const timer = setInterval(() => {
      setSessionRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          void refresh()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [liveActive, live?.sessionId, live?.startedAt, live?.remainingSeconds, refresh])

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'student' | 'teacher' | 'admin'>('all')
  const [rosterSection, setRosterSection] = useState<ClassSession | null>(null)
  const [rosterStudents, setRosterStudents] = useState<{ id: string; name: string; email: string; studentCode: string; department: string; status: string }[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterSearch, setRosterSearch] = useState('')
  const [importTargetSectionId, setImportTargetSectionId] = useState<string>('')
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null)
  const [printableCourse, setPrintableCourse] = useState<Course | null>(null)
  const [printableSummary, setPrintableSummary] = useState<Awaited<ReturnType<typeof api.courseAttendanceSummary>> | null>(null)
  const [loadingPrintable, setLoadingPrintable] = useState(false)
  const [eligibilityFilter, setEligibilityFilter] = useState<'all' | 'warning' | 'disqualified'>('all')

  const openPrintableSheet = async (course: Course) => {
    setPrintableCourse(course)
    setLoadingPrintable(true)
    try {
      const summary = await api.courseAttendanceSummary(course.id)
      setPrintableSummary(summary)
    } catch {
      setPrintableSummary(null)
    } finally {
      setLoadingPrintable(false)
    }
  }

  const openRoster = async (sec: ClassSession) => {
    setRosterSection(sec)
    setRosterLoading(true)
    setRosterSearch('')
    try {
      const res = await api.sectionStudents(sec.sectionId)
      if (res.ok) {
        setRosterStudents(res.students)
      } else {
        setRosterStudents([])
      }
    } catch {
      setRosterStudents([])
    } finally {
      setRosterLoading(false)
    }
  }

  const reloadRoster = async (sectionId?: string) => {
    const sId = sectionId || rosterSection?.sectionId
    if (!sId) return
    try {
      const res = await api.sectionStudents(sId)
      if (res.ok) {
        setRosterStudents(res.students)
        await refresh()
      }
    } catch {
      /* ignore */
    }
  }

  const manuallyStoppedRef = useRef(false)

  const startBeacon = useCallback(() => {
    if (beaconRef.current) {
      if (beaconRef.current.state?.() === 'suspended') {
        beaconRef.current.resume?.().catch(() => {})
      }
      setUltrasonicActive(true)
      return
    }
    try {
      const beacon = startUltrasonicBeacon(DEFAULT_ULTRASONIC_FREQ)
      beaconRef.current = beacon
      beacon.resume?.().catch(() => {})
      setUltrasonicActive(true)
    } catch {
      /* ignore autoplay suspension until user interaction */
    }
  }, [])

  const stopBeacon = useCallback(() => {
    if (beaconRef.current) {
      beaconRef.current.stop()
      beaconRef.current = null
    }
    setUltrasonicActive(false)
  }, [])

  const toggleUltrasonic = () => {
    if (ultrasonicActive) {
      manuallyStoppedRef.current = true
      stopBeacon()
    } else {
      manuallyStoppedRef.current = false
      startBeacon()
    }
  }

  // Auto-start ultrasonic acoustic beacon when live attendance session is active and viewing sessions page
  useEffect(() => {
    if (liveActive && page === 'sessions') {
      if (!manuallyStoppedRef.current) {
        startBeacon()
      }

      const handleUserGesture = () => {
        if (liveActive && page === 'sessions' && !manuallyStoppedRef.current) {
          if (beaconRef.current?.state?.() === 'suspended') {
            beaconRef.current.resume?.().catch(() => {})
          } else {
            startBeacon()
          }
        }
      }
      window.addEventListener('click', handleUserGesture, { once: true })
      window.addEventListener('touchstart', handleUserGesture, { once: true })
      return () => {
        window.removeEventListener('click', handleUserGesture)
        window.removeEventListener('touchstart', handleUserGesture)
      }
    } else {
      queueMicrotask(() => {
        stopBeacon()
      })
      manuallyStoppedRef.current = false
    }
  }, [liveActive, page, startBeacon, stopBeacon])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectorMode(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleReviewLeave = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await api.reviewLeaveRequest(requestId, status)
      setNotice(status === 'approved' ? t('teacher.leaveApproved') : t('teacher.leaveRejected'))
      await refresh()
    } catch {
      setNotice(t('teacher.leaveReviewError'))
    }
  }

  const handleResetStudent = async (studentId: string, studentName: string, studentCode: string) => {
    if (!window.confirm(t('teacher.resetPasswordConfirm', { name: studentName, code: studentCode }))) {
      return
    }
    try {
      const res = await api.resetStudentPassword(studentId)
      if (res.ok) {
        setNotice(res.message || t('teacher.resetPasswordSuccess', { name: studentName, password: studentCode }))
      } else {
        setNotice(res.message || t('teacher.resetPasswordError'))
      }
    } catch {
      setNotice(t('teacher.resetPasswordError'))
    }
  }

  const [policyTtl, setPolicyTtl] = useState(data.policy?.challengeTtlSeconds ?? 30)
  const [policyLateAfter, setPolicyLateAfter] = useState(data.policy?.lateAfterMinutes ?? 10)
  const [policyRequireTrusted, setPolicyRequireTrusted] = useState(data.policy?.requireTrustedDevice ?? false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [policyDirty, setPolicyDirty] = useState(false)

  useEffect(() => {
    if (data.policy && !policyDirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPolicyTtl(data.policy.challengeTtlSeconds)
      setPolicyLateAfter(data.policy.lateAfterMinutes)
      setPolicyRequireTrusted(data.policy.requireTrustedDevice)
    }
  }, [data.policy, policyDirty])

  const handleSavePolicy = async () => {
    setSavingPolicy(true)
    try {
      const res = await api.updatePolicy({
        challengeTtlSeconds: Number(policyTtl),
        lateAfterMinutes: Number(policyLateAfter),
        requireTrustedDevice: policyRequireTrusted,
      })
      if (res.ok) {
        setSaved(true)
        setPolicyDirty(false)
        setNotice(t('teacher.settingsSaved'))
        if (live?.sessionId) {
          await api.sessionAction(live.sessionId, 'rotate').catch(() => {})
        }
        await refresh()
      } else {
        setNotice(res.message || t('teacher.savePolicyError'))
      }
    } catch {
      setNotice(t('teacher.savePolicyError'))
    } finally {
      setSavingPolicy(false)
    }
  }

  const handleResolveSuspicious = async (attemptId: string, action: 'approved' | 'dismissed') => {
    try {
      const res = await api.resolveSuspicious(attemptId, action)
      if (res.ok) {
        setNotice(action === 'approved' ? t('teacher.approvedSuccess') : t('teacher.rejectedSuccess'))
        await refresh()
      } else {
        setNotice(res.message || t('common.verificationFailed'))
      }
    } catch {
      setNotice(t('common.verificationFailed'))
    }
  }

  const isAdmin = role === 'admin'
  const students = users.filter((item) => item.role === 'student')

  const todayDay = new Date().getDay()
  const todayDayOfWeek = todayDay === 0 ? 7 : todayDay
  const todaySections = sessions.filter((s) => s.dayOfWeek === todayDayOfWeek)

  const startSpecificSession = async (sectionId: string) => {
    try {
      const created = await api.createSession(sectionId)
      if (!created.ok || !created.sessionId) {
        setNotice(created.message ?? t('teacher.updateSessionFailed'))
        return
      }
      const result = await api.sessionAction(created.sessionId, 'start')
      if (!result.ok) { setNotice(result.message ?? t('teacher.updateSessionFailed')); return }
      setNotice(t('teacher.sessionUpdated'))
      manuallyStoppedRef.current = false
      startBeacon()
      await refresh()
      go('sessions')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.updateSessionFailed'))
    }
  }

  const toggleSession = async () => {
    try {
      let sessionId = live?.sessionId
      if (!sessionId && todaySections[0]) {
        const created = await api.createSession(todaySections[0].sectionId)
        sessionId = created.sessionId
      } else if (!sessionId && sessions[0]) {
        const created = await api.createSession(sessions[0].sectionId)
        sessionId = created.sessionId
      }
      if (!sessionId) { setNotice(t('teacher.noSection')); return }
      const isStarting = !liveActive
      const result = await api.sessionAction(sessionId, liveActive ? 'close' : 'start')
      if (!result.ok) { setNotice(result.message ?? t('teacher.updateSessionFailed')); return }
      setNotice(result.message ?? t('teacher.sessionUpdated'))
      if (isStarting) {
        manuallyStoppedRef.current = false
        startBeacon()
      } else {
        stopBeacon()
      }
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.updateSessionFailed'))
    }
  }

  const isRotatingRef = useRef(false)
  const rotateChallenge = useCallback(async () => {
    if (!live?.sessionId || isRotatingRef.current) return
    isRotatingRef.current = true
    try {
      const result = await api.sessionAction(live.sessionId, 'rotate')
      if (!result.ok) { setNotice(result.message ?? t('teacher.rotateFailed')); return }
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.rotateFailed'))
    } finally {
      setTimeout(() => {
        isRotatingRef.current = false
      }, 1500)
    }
  }, [live, refresh, t])

  const deleteSection = async (sectionId: string) => {
    if (!confirm(t('common.confirmDeleteSchedule'))) return
    try {
      const res = await api.deleteSection(sectionId)
      if (res.ok) {
        setNotice(t('common.scheduleDeleted'))
        await refresh()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error deleting schedule')
    }
  }

  const presentCount = live?.records.filter((row) => row.status === 'present').length ?? 0
  const lateCount = live?.records.filter((row) => row.status === 'late').length ?? 0

  const runImport = async () => {
    setImporting(true)
    setNotice('')
    try {
      const result = await api.importStudents(csvText, importTargetSectionId || undefined)
      setImportResult(result)
      setNotice(t('teacher.importDone', { count: result.created.length }))
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const runTeacherImport = async () => {
    setTeacherImporting(true)
    setNotice('')
    try {
      const result = await api.importTeachers(teacherCsvText)
      setTeacherImportResult(result)
      setNotice(t('admin.importLecturersDone', { count: result.created.length }))
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('admin.importLecturersFailed'))
    } finally {
      setTeacherImporting(false)
    }
  }

  const adminEyebrow = t('admin.administration')
  const staffEyebrow = isAdmin ? adminEyebrow : t('teacher.workspace')

  const renderContent = () => {
    if (page === 'sessions') {
      return (
      <div className="flex flex-col gap-6">
        {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
        <SectionHeader
          eyebrow={t('teacher.workspace')}
          title={t('teacher.liveTitle')}
          detail={t('teacher.liveDetail')}
          action={
            <div className="flex flex-wrap gap-2">
              {liveActive && (
                <Button variant="outline" onClick={() => setProjectorMode(true)}>
                  <Maximize2 />{t('teacher.projectorMode')}
                </Button>
              )}
              <Button variant={liveActive ? 'danger' : 'primary'} onClick={toggleSession}>
                {liveActive ? <><X />{t('teacher.endSessionEarly')}</> : <><Zap />{t('teacher.startManualSession')}</>}
              </Button>
            </div>
          }
        />
        {liveActive && live ? (
          <>
            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr_0.9fr]">
              <Card title={t('teacher.sessionDetails')}>
                <div className="flex flex-col gap-3 text-sm">
                  <p><strong>{t('common.course')}</strong><span className="block text-muted-foreground">{live.courseCode} · {live.courseName}</span></p>
                  <p><strong>{t('common.class')}</strong><span className="block text-muted-foreground">{live.room}</span></p>
                  <p><strong>{t('common.time')}</strong><span className="block text-muted-foreground">{formatDayOfWeek(t, live.dayOfWeek)} · {live.startsAt} – {live.endsAt}</span></p>
                  <Status tone="success">{t('common.liveNow')}</Status>

                  {/* 3-minute Attendance Window Countdown */}
                  <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-primary mb-1">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5 animate-spin text-primary" />
                        {t('teacher.sessionWindowRemaining')}
                      </span>
                      <span className="font-mono text-sm font-bold text-primary">{formatTimer(sessionRemaining)} / 03:00</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
                      <div
                        className="h-full bg-primary transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, (sessionRemaining / 180) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {t('teacher.sessionWindowDesc')}
                    </p>
                  </div>
                </div>
              </Card>
              <Card title={t('teacher.sessionChallenge')} description={t('teacher.rotatingCode')}>
                <div className="flex flex-col items-center justify-center gap-4 py-3">
                  <DynamicQRCode value={live.challenge} size={200} />
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-primary/10 px-6 py-2.5 font-mono text-3xl font-bold tracking-[0.25em] text-primary">
                      {live.challenge}
                    </span>
                    <CountdownTimer expiresAt={live.challengeExpiresAt} totalSeconds={data.policy?.challengeTtlSeconds ?? 30} onExpire={!projectorMode ? rotateChallenge : undefined} />
                  </div>

                  <div className="w-full max-w-xs">
                    <UltrasonicWaveVisualizer active={ultrasonicActive} />
                  </div>

                  <p className="text-xs text-muted-foreground">{t('teacher.shareCode')}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant={ultrasonicActive ? 'primary' : 'outline'}
                      onClick={toggleUltrasonic}
                      className={ultrasonicActive ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}
                    >
                      {ultrasonicActive ? <Volume2 className="size-4 animate-pulse text-indigo-200" /> : <Waves className="size-4 text-indigo-500" />}
                      {ultrasonicActive ? t('teacher.ultrasonicBeaconActive') : t('teacher.toggleUltrasonic')}
                    </Button>
                    <Button variant="outline" onClick={rotateChallenge}>
                      <RotateCw />{t('teacher.rotateChallenge')}
                    </Button>
                    <Button variant="outline" onClick={() => setProjectorMode(true)}>
                      <Maximize2 />{t('teacher.projectorMode')}
                    </Button>
                  </div>
                </div>
              </Card>
              <Card title={t('teacher.liveStatistics')}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <Metric label={t('common.present')} value={String(presentCount)} detail={t('teacher.verifiedStudents')} icon={CheckCircle2} tone="success" />
                  <Metric label={t('common.late')} value={String(lateCount)} detail={t('common.needsReview')} icon={CalendarDays} tone="warning" />
                  <Metric label={t('teacher.suspiciousAttempts')} value={String(metrics.flagged)} detail={t('common.reviewRequired')} icon={CircleAlert} tone="warning" />
                </div>
              </Card>
            </div>
            <Card title={t('teacher.liveTable')} description={t('teacher.liveTableDetail')}>
              <div className="mb-4 flex items-center gap-2 rounded-lg border px-3">
                <Search className="size-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder={t('teacher.searchStudents')} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-3">{t('roles.student')}</th>
                      <th className="pb-3">{t('teacher.checkIn')}</th>
                      <th className="pb-3">{t('common.status')}</th>
                      <th className="pb-3">{t('teacher.manualAttendance')}</th>
                      <th className="pb-3">{t('teacher.verification')}</th>
                      <th className="pb-3">{t('common.device')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {live.records.filter((row) => row.studentName.toLowerCase().includes(search.toLowerCase())).map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 font-medium">
                          <div>
                            <p className="font-semibold text-foreground">{row.studentName}</p>
                            {row.studentId && <p className="text-[11px] text-muted-foreground font-mono">{row.studentId}</p>}
                          </div>
                        </td>
                        <td className="py-3">{row.status === 'unmarked' ? '—' : (row.verifiedAt || '—')}</td>
                        <td className="py-3">
                          <Status tone={row.status === 'late' ? 'warning' : row.status === 'absent' ? 'danger' : row.status === 'excused' ? 'neutral' : row.status === 'unmarked' ? 'neutral' : 'success'}>
                            {statusText(t, row.status)}
                          </Status>
                        </td>
                        <td className="py-3">
                          {row.status === 'unmarked' ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                title={t('status.present')}
                                onClick={async () => {
                                  await api.overrideAttendance(row.id, 'present', { sessionId: live.sessionId, studentId: row.studentId })
                                  setNotice(t('teacher.manualCheckInDone'))
                                  await refresh()
                                }}
                                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-xs"
                              >
                                ✓ {t('status.present')}
                              </button>
                              <button
                                type="button"
                                title={t('status.late')}
                                onClick={async () => {
                                  await api.overrideAttendance(row.id, 'late', { sessionId: live.sessionId, studentId: row.studentId })
                                  setNotice(t('teacher.manualCheckInDone'))
                                  await refresh()
                                }}
                                className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-600 transition-colors cursor-pointer shadow-xs"
                              >
                                {t('status.late')}
                              </button>
                              <button
                                type="button"
                                title={t('status.excused')}
                                onClick={async () => {
                                  await api.overrideAttendance(row.id, 'excused', { sessionId: live.sessionId, studentId: row.studentId })
                                  setNotice(t('teacher.manualCheckInDone'))
                                  await refresh()
                                }}
                                className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                              >
                                {t('status.excused')}
                              </button>
                            </div>
                          ) : (
                            <select
                              value={row.status}
                              onChange={async (e) => {
                                const newStatus = e.target.value as AttendanceStatus
                                await api.overrideAttendance(row.id, newStatus, { sessionId: live.sessionId, studentId: row.studentId })
                                setNotice(t('teacher.statusOverridden'))
                                await refresh()
                              }}
                              className="rounded-lg border border-slate-200 bg-background px-2.5 py-1 text-xs font-medium cursor-pointer"
                            >
                              <option value="present">{t('status.present')}</option>
                              <option value="late">{t('status.late')}</option>
                              <option value="absent">{t('status.absent')}</option>
                              <option value="excused">{t('status.excused')}</option>
                            </select>
                          )}
                        </td>
                        <td className="py-3">{row.status === 'unmarked' ? '—' : `${row.confidence}%`}</td>
                        <td className="py-3 text-muted-foreground">{row.status === 'unmarked' ? '—' : row.device}</td>
                      </tr>
                    ))}
                    {live.records.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          {t('teacher.waitingSession')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Projector Mode Fullscreen Overlay */}
            {projectorMode && (
              <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#06152d] text-white p-6 sm:p-10 select-none">
                {/* Top Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <UtcLogo compact={false} />
                    <div className="hidden sm:block border-l border-white/20 pl-3">
                      <h2 className="text-base font-bold tracking-tight text-white">{live.courseCode} · {live.courseName}</h2>
                      <p className="text-xs text-blue-300">Phòng {live.room} · {formatDayOfWeek(t, live.dayOfWeek)} ({live.startsAt} – {live.endsAt})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-500/20 px-3.5 py-1.5 text-xs font-semibold text-blue-300 border border-blue-400/30 flex items-center gap-2">
                      <Clock className="size-4 animate-spin text-blue-300" />
                      {t('teacher.sessionWindowRemaining')}: {formatTimer(sessionRemaining)}
                    </div>
                    <div className="rounded-xl bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-400/30 flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                      {t('common.liveNow')} · {live.records.length} đã điểm danh
                    </div>
                    <button
                      type="button"
                      onClick={() => setProjectorMode(false)}
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer border border-white/20"
                    >
                      <Minimize2 className="size-4" /> {t('teacher.exitProjector')} (Esc)
                    </button>
                  </div>
                </div>

                {/* Centered Large QR and Code */}
                <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                  <div className="rounded-3xl border-4 border-blue-400/30 bg-white p-6 shadow-2xl shadow-blue-500/20">
                    <DynamicQRCode value={live.challenge} size={320} />
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                    <span className="rounded-2xl border border-blue-400/40 bg-blue-900/60 px-8 py-3 font-mono text-5xl sm:text-6xl font-extrabold tracking-[0.35em] text-white shadow-lg">
                      {live.challenge}
                    </span>
                    <div className="scale-125">
                      <CountdownTimer expiresAt={live.challengeExpiresAt} totalSeconds={data.policy?.challengeTtlSeconds ?? 30} onExpire={rotateChallenge} />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <UltrasonicWaveVisualizer
                      active={ultrasonicActive}
                      className="bg-blue-950/80 border-blue-400/30 text-blue-200"
                    />
                    <button
                      type="button"
                      onClick={toggleUltrasonic}
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer border shadow-md ${
                        ultrasonicActive
                          ? 'bg-indigo-600 text-white border-indigo-400 hover:bg-indigo-700'
                          : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                      }`}
                    >
                      {ultrasonicActive ? <Volume2 className="size-4 animate-pulse text-indigo-200" /> : <Waves className="size-4 text-indigo-300" />}
                      {ultrasonicActive ? t('teacher.ultrasonicBeaconActive') : t('teacher.toggleUltrasonic')}
                    </button>
                  </div>

                  <p className="mt-4 text-sm font-medium text-blue-200 max-w-md">
                    {t('teacher.projectorHint')}
                  </p>
                </div>

                {/* Bottom Footer Info */}
                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                  <span>{t('teacher.systemFooterNote')}</span>
                  <button
                    type="button"
                    onClick={rotateChallenge}
                    className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors cursor-pointer font-medium"
                  >
                    <RotateCw className="size-4" /> {t('teacher.rotateChallenge')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-6">
            <Card title={t('common.todayClass')} description={t('common.scheduleDetail')}>
              {todaySections.length > 0 ? (
                <div className="divide-y">
                  {todaySections.map((sec) => {
                    const [startH, startM] = (sec.startsAt || '').split(':').map(Number)
                    const autoCloseMinutes = (!isNaN(startH) && !isNaN(startM)) ? (startH * 60 + startM + 3) : 0
                    const endWindowStr = autoCloseMinutes > 0 ? `${String(Math.floor(autoCloseMinutes / 60)).padStart(2, '0')}:${String(autoCloseMinutes % 60).padStart(2, '0')}` : ''
                    const meta = parseSessionType(sec.room)

                    return (
                      <div key={sec.sectionId} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                        <div className="flex-1 min-w-[280px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{sec.courseCode} · {sec.courseName}</span>
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                              {meta.label}
                            </span>
                            {sec.autoStart && (
                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {t('common.autoOpen')}
                              </span>
                            )}
                            {endWindowStr && (
                              <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                {t('teacher.scheduledAutoWindow', { start: sec.startsAt, end: endWindowStr })}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <Calendar className="mr-1 inline size-3.5" />{formatDayOfWeek(t, sec.dayOfWeek)} · <Clock className="mr-1 inline size-3.5" />{sec.startsAt} – {sec.endsAt} · <Building2 className="mr-1 inline size-3.5" />{meta.cleanRoom || sec.room} · {t('teacher.enrolledCount', { count: sec.enrolledCount ?? 0 })}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground/80 italic">
                            * {t('teacher.tenMinNoticeDesc')}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            variant="primary"
                            onClick={() => startSpecificSession(sec.sectionId)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm cursor-pointer"
                          >
                            <Zap className="size-4" />{t('teacher.startManualSession')}
                          </Button>
                          <span className="text-[10px] text-muted-foreground text-right max-w-xs">
                            {t('teacher.manualTriggerHint')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <p>{t('common.noClassToday')}</p>
                </div>
              )}
            </Card>

            <Card title={t('common.allClassSessions')} description={organization.name}>
              <div className="divide-y">
                {sessions.map((sec) => {
                  const meta = parseSessionType(sec.room)
                  return (
                    <div key={sec.sectionId} className="flex flex-wrap items-center justify-between gap-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{sec.courseCode} · {sec.courseName}</p>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDayOfWeek(t, sec.dayOfWeek)} · {sec.startsAt} – {sec.endsAt} · {meta.cleanRoom || sec.room}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => startSpecificSession(sec.sectionId)} className="cursor-pointer">
                        <Play className="size-3.5" />{t('teacher.startAttendance')}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    )
  }

  if (page === 'courses') {
    return (
      <div className="flex flex-col gap-6">
        {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
        <SectionHeader
          eyebrow={staffEyebrow}
          title={
            isAdmin
              ? (t('common.recurringSchedule') || 'Khóa học & Lịch học cố định')
              : (t('teacher.coursesTitle') || 'Khóa học & Ca giảng dạy')
          }
          detail={
            isAdmin
              ? (t('common.scheduleDetail') || 'Quản lý danh sách môn học, lịch học cố định, giảng viên phụ trách và sinh viên ghi danh.')
              : (t('teacher.registerSessionDesc') || 'Đăng ký ca học chính khóa, ca thực hành, học bù hoặc thi cho các học phần được phân công.')
          }
          action={
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <Button variant="outline" onClick={() => setCourseModalOpen(true)} className="cursor-pointer">
                  <Plus className="size-4" />{t('common.createNewCourse')}
                </Button>
              )}
              <Button
                onClick={() => { setSelectedSection(undefined); setSelectedCourseId(undefined); setScheduleModalOpen(true) }}
                className={!isAdmin ? "bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm gap-2 cursor-pointer" : "gap-2 cursor-pointer"}
              >
                <CalendarDays className="size-4" />
                {isAdmin ? t('common.addSchedule') : (t('teacher.registerSession') || 'Đăng ký ca học')}
              </Button>
            </div>
          }
        />

        {isAdmin && courseModalOpen && (
          <CourseModal
            departments={departments}
            teachers={users.filter((item) => item.role === 'teacher').map((item) => ({ id: item.id, name: item.name, email: item.email }))}
            isAdmin={isAdmin}
            onClose={() => setCourseModalOpen(false)}
            onCreated={async () => {
              setNotice(t('common.courseCreated'))
              await refresh()
            }}
            t={t}
          />
        )}

        {scheduleModalOpen && (
          <ScheduleModal
            courses={courses}
            initialCourseId={selectedCourseId}
            initialSection={selectedSection}
            isAdmin={isAdmin}
            onClose={() => setScheduleModalOpen(false)}
            onSaved={async () => {
              setNotice(isAdmin ? t('common.scheduleSaved') : 'Đã đăng ký ca học thành công.')
              await refresh()
            }}
            t={t}
          />
        )}

        <div className="flex flex-col gap-6">
          {courses.map((course) => {
            const courseSections = sessions.filter((s) => s.courseId === course.id)
            return (
              <Card
                key={course.id}
                title={`${course.code} — ${course.name}`}
                description={`${course.department} · ${t('teacher.enrolledCount', { count: course.enrolled })}`}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isAdmin && (
                      <select
                        className="h-9 max-w-[230px] rounded-lg border bg-background px-2 text-xs"
                        value={course.teacherId}
                        onChange={async (event) => {
                          const result = await api.updateCourseTeacher(course.id, event.target.value)
                          setNotice(result.ok ? 'Đã phân công giảng viên cho môn học.' : (result.message ?? 'Không thể phân công môn học.'))
                          if (result.ok) await refresh()
                        }}
                        aria-label="Giảng viên phụ trách"
                      >
                        <option value="" disabled>Chưa phân công giảng viên</option>
                        {users.filter((item) => item.role === 'teacher').map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                      </select>
                    )}
                    <Button
                      variant="outline"
                      className="text-xs gap-1.5 cursor-pointer"
                      onClick={() => {
                        setSelectedSection(undefined)
                        setSelectedCourseId(course.id)
                        setScheduleModalOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" />
                      {isAdmin ? t('common.addSchedule') : (t('teacher.registerSession') || 'Đăng ký ca học')}
                    </Button>
                  </div>
                }
              >
                {courseSections.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2.5">{t('common.dayOfWeek')}</th>
                          <th className="pb-2.5">{t('common.time')}</th>
                          <th className="pb-2.5">{t('common.room')}</th>
                          <th className="pb-2.5">{t('common.autoOpen')}</th>
                          <th className="pb-2.5">{t('common.students')}</th>
                          <th className="pb-2.5 text-right">{t('common.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {courseSections.map((sec) => {
                          const meta = parseSessionType(sec.room)
                          return (
                            <tr key={sec.sectionId} className="hover:bg-muted/40 transition-colors">
                              <td className="py-3 font-medium text-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <Calendar className="size-3.5 text-primary" />
                                  {formatDayOfWeek(t, sec.dayOfWeek)}
                                </span>
                              <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                                {sec.startDate ?? '2026-01-01'} → {sec.endDate ?? '2026-12-31'}
                              </span>
                              </td>
                              <td className="py-3 font-mono text-xs">
                                {sec.startsAt} – {sec.endsAt}
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">{meta.cleanRoom || sec.room}</span>
                                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}>
                                    {meta.label}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3">
                                {sec.autoStart ? (
                                  <Status tone="success">{t('common.active')}</Status>
                                ) : (
                                  <Status tone="neutral">{t('common.off')}</Status>
                                )}
                              </td>
                              <td className="py-3">
                                <button
                                  type="button"
                                  onClick={() => openRoster(sec)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium text-xs transition-colors cursor-pointer"
                                  title={t('admin.viewRoster')}
                                >
                                  <Users className="size-3.5" />
                                  <span>{sec.enrolledCount ?? 0}</span>
                                </button>
                              </td>
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    className="h-8 px-2.5 text-xs"
                                    onClick={() => openRoster(sec)}
                                  >
                                    <Users className="size-3" />
                                    <span className="hidden sm:inline">{t('admin.viewRoster')}</span>
                                  </Button>
                                  <Button
                                    variant="primary"
                                    className="h-8 px-2.5 text-xs"
                                    onClick={() => startSpecificSession(sec.sectionId)}
                                  >
                                    <Play className="size-3" />{t('teacher.startAttendance')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="h-8 px-2.5 text-xs"
                                    onClick={() => {
                                      setSelectedSection(sec)
                                      setSelectedCourseId(sec.courseId)
                                      setScheduleModalOpen(true)
                                    }}
                                  >
                                    <Edit3 className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                                    onClick={() => deleteSection(sec.sectionId)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <p>{t('common.noScheduleYet')}</p>
                    <Button
                      variant="outline"
                      className="mt-3 text-xs gap-1.5 cursor-pointer"
                      onClick={() => {
                        setSelectedSection(undefined)
                        setSelectedCourseId(course.id)
                        setScheduleModalOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" />
                      {isAdmin ? t('common.addSchedule') : (t('teacher.registerSession') || 'Đăng ký ca học')}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {rosterSection && (
          <ClassRosterModal
            section={rosterSection}
            students={rosterStudents}
            loading={rosterLoading}
            search={rosterSearch}
            setSearch={setRosterSearch}
            onClose={() => setRosterSection(null)}
            onRefresh={() => reloadRoster(rosterSection.sectionId)}
            t={t}
          />
        )}
      </div>
    )
  }

  if (page === 'departments') {
    return (
      <div className="flex flex-col gap-6">
        {notice && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary flex items-center justify-between" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="text-primary hover:opacity-70 cursor-pointer" aria-label="Đóng"><X className="size-4" /></button>
          </div>
        )}

        <SectionHeader
          eyebrow={staffEyebrow}
          title={t('teacher.departmentsTitle') || 'Khoa / Bộ môn'}
          detail="Quản lý cơ cấu học thuật, danh mục khoa/bộ môn và phân bổ các học phần trong toàn trường."
          action={
            isAdmin ? (
              <Button
                onClick={() => {
                  setEditingDept(null)
                  setDeptModalOpen(true)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 shadow-sm cursor-pointer"
              >
                <Plus className="size-4" />
                Thêm khoa/bộ môn mới
              </Button>
            ) : undefined
          }
        />

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Building2 className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Tổng số khoa/bộ môn</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{departmentsList.length}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <BookOpen className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Tổng môn học trực thuộc</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{courses.length}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Layers className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Trung bình môn / khoa</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">
                  {departmentsList.length > 0 ? (courses.length / departmentsList.length).toFixed(1) : '0'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Department List Card */}
        <Card
          title="Danh sách Khoa / Bộ môn"
          description={`${organization.name} · ${filteredDepartments.length} đơn vị đào tạo`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tìm kiếm khoa/bộ môn..."
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  className="h-9 w-48 sm:w-64 rounded-lg border bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          }
        >
          {deptLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <RotateCw className="size-4 animate-spin text-primary" />
              <span>Đang tải danh sách khoa/bộ môn...</span>
            </div>
          ) : filteredDepartments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-xs text-muted-foreground border-b pb-2">
                  <tr>
                    <th className="pb-3 font-semibold">Tên khoa / Bộ môn</th>
                    <th className="pb-3 font-semibold">Số môn học trực thuộc</th>
                    <th className="pb-3 font-semibold">Trạng thái</th>
                    <th className="pb-3 font-semibold">Ngày khởi tạo</th>
                    {isAdmin && <th className="pb-3 text-right font-semibold">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredDepartments.map((dept) => {
                    const deptCourses = courses.filter((c) => c.department.toLowerCase() === dept.name.toLowerCase())
                    const count = dept.courseCount || deptCourses.length

                    return (
                      <tr key={dept.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3.5 font-medium">
                          <div className="flex items-center gap-2.5">
                            <div className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                              <Building2 className="size-4" />
                            </div>
                            <div>
                              <span className="font-bold text-foreground text-sm">{dept.name}</span>
                              <p className="text-[11px] text-muted-foreground">ID: {dept.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            count > 0
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            <BookOpen className="size-3" />
                            {count} môn học
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Hoạt động
                          </span>
                        </td>
                        <td className="py-3.5 text-xs text-muted-foreground">
                          {dept.createdAt ? new Date(dept.createdAt).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        {isAdmin && (
                          <td className="py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                                onClick={() => {
                                  setEditingDept(dept)
                                  setDeptModalOpen(true)
                                }}
                                title="Đổi tên khoa/bộ môn"
                              >
                                <Edit3 className="size-3.5" />
                                <span>Đổi tên</span>
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                                onClick={() => setDeletingDept(dept)}
                                title={count > 0 ? "Không thể xóa khoa có môn học" : "Xóa khoa/bộ môn"}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
                <Building2 className="size-6" />
              </div>
              <p className="font-semibold text-foreground text-base">
                {deptSearch ? 'Không tìm thấy khoa/bộ môn phù hợp' : 'Chưa có khoa/bộ môn nào'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {deptSearch
                  ? `Không có kết quả nào khớp với "${deptSearch}". Vui lòng thử từ khóa khác.`
                  : 'Hệ thống chưa thiết lập danh mục khoa/bộ môn. Hãy thêm khoa đầu tiên để phân loại học phần và quản lý giáo viên.'}
              </p>
              {isAdmin && !deptSearch && (
                <Button
                  onClick={() => {
                    setEditingDept(null)
                    setDeptModalOpen(true)
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 text-xs cursor-pointer shadow-sm"
                >
                  <Plus className="size-3.5" />
                  Thêm khoa đầu tiên
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Modal Thêm / Sửa khoa/bộ môn */}
        {deptModalOpen && (
          <DepartmentModal
            initialDept={editingDept}
            onClose={() => {
              setDeptModalOpen(false)
              setEditingDept(null)
            }}
            onSaved={async (msg) => {
              setNotice(msg)
              setDeptModalOpen(false)
              setEditingDept(null)
              await refreshDepartments()
              await refresh()
            }}
          />
        )}

        {/* Modal Xác nhận Xóa khoa/bộ môn */}
        {deletingDept && (
          <DeleteDepartmentModal
            dept={deletingDept}
            coursesCount={courses.filter((c) => c.department.toLowerCase() === deletingDept.name.toLowerCase()).length || deletingDept.courseCount}
            onClose={() => setDeletingDept(null)}
            onDeleted={async () => {
              setNotice(`Đã xóa khoa/bộ môn "${deletingDept.name}" thành công.`)
              setDeletingDept(null)
              await refreshDepartments()
              await refresh()
            }}
          />
        )}
      </div>
    )
  }

  if (page === 'students') {
    const studentCount = users.filter((u) => u.role === 'student').length
    const teacherCount = users.filter((u) => u.role === 'teacher').length
    const adminCount = users.filter((u) => u.role === 'admin').length

    const filteredUsers = users.filter((u) => {
      const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter
      const matchSearch = `${u.name} ${u.studentCode ?? ''} ${u.email} ${u.department ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
      return matchRole && matchSearch
    })

    return (
      <div className="flex flex-col gap-6">
        {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
        <SectionHeader
          eyebrow={staffEyebrow}
          title={isAdmin ? t('admin.usersTitle') : t('teacher.studentsTitle')}
          detail={isAdmin ? t('admin.usersDetail') : t('teacher.rosterDetail')}
          action={
            isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setTeacherImportOpen(!teacherImportOpen)}>
                  <Users />{t('admin.importLecturers')}
                </Button>
                <Button onClick={() => setImportOpen(!importOpen)}>
                  <FileText />{t('teacher.importStudents')}
                </Button>
              </div>
            ) : (
              <Button onClick={() => setImportOpen(!importOpen)}>
                <FileText />{t('teacher.importStudents')}
              </Button>
            )
          }
        />
        {isAdmin && teacherImportOpen && (
          <TeacherImportPanel
            csvText={teacherCsvText}
            setCsvText={setTeacherCsvText}
            importing={teacherImporting}
            importResult={teacherImportResult}
            emailDomain={organization.emailDomain ?? null}
            onImport={runTeacherImport}
            onClose={() => setTeacherImportOpen(false)}
            t={t}
          />
        )}
        {importOpen && (
          <StudentImportPanel
            csvText={csvText}
            setCsvText={setCsvText}
            importing={importing}
            importResult={importResult}
            targetCourseId={importTargetSectionId}
            setTargetCourseId={setImportTargetSectionId}
            courses={courses}
            onImport={runImport}
            onClose={() => setImportOpen(false)}
            t={t}
          />
        )}
        <Card
          title={isAdmin ? t('admin.userDirectory') : t('teacher.studentDirectory')}
          description={`${organization.name} · ${filteredUsers.length} ${t('admin.allUsers')}`}
        >
          {/* Role Filter Tabs (All, Students, Teachers, Admins) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/60 rounded-xl">
              {([
                { key: 'all' as const, label: t('admin.filterAll'), count: users.length },
                { key: 'student' as const, label: t('admin.filterStudents'), count: studentCount },
                { key: 'teacher' as const, label: t('admin.filterTeachers'), count: teacherCount },
                { key: 'admin' as const, label: t('admin.filterAdmins'), count: adminCount },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setUserRoleFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    userRoleFilter === tab.key
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    userRoleFilter === tab.key ? 'bg-primary/10 text-primary font-bold' : 'bg-muted text-muted-foreground'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-1 min-w-[200px] max-w-sm items-center gap-2 rounded-lg border px-3">
              <Search className="size-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 flex-1 bg-transparent text-sm outline-none" placeholder={t('common.search')} />
            </div>
          </div>

          <div className="divide-y">
            {filteredUsers.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-4">
                <div className={`grid size-9 place-items-center rounded-full text-xs font-semibold ${
                  item.role === 'admin'
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                    : item.role === 'teacher'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {item.initials?.slice(0, 2) ?? item.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.role === 'admin'
                        ? 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-950/40 dark:text-purple-300'
                        : item.role === 'teacher'
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-700/10 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}>
                      {t(`roles.${item.role}`)}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {item.role === 'student' && organization.id && (
                      <p>Mã vào tổ chức: <span className="font-mono text-slate-700 dark:text-slate-300">{organization.id}</span></p>
                    )}
                    <p>
                      {item.studentCode ? `MSSV: ${item.studentCode} · ` : ''}
                      {item.role === 'student' && item.studentCode
                        ? studentEmailForDisplay(item.name, item.studentCode)
                        : item.email}
                      {item.department ? ` · ${item.department}` : ''}
                    </p>
                  </div>
                </div>
                {item.role === 'student' && (
                  <Button
                    variant="outline"
                    className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-200 hover:text-primary hover:border-primary cursor-pointer"
                    onClick={() => handleResetStudent(item.id, item.name, item.studentCode)}
                  >
                    <KeyRound className="size-3.5" />
                    {t('teacher.resetPassword')}
                  </Button>
                )}
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('admin.noUsersFound')}</p>
            )}
          </div>
        </Card>
      </div>
    )
  }

  if (page === 'analytics' || page === 'reports') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          eyebrow={staffEyebrow}
          title={page === 'reports' ? t('teacher.reportsTitle') : t('teacher.analyticsTitle')}
          detail={t('teacher.analyticsDetail')}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              {courses[0] && (
                <Button
                  variant="outline"
                  className="text-xs border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                  onClick={() => openPrintableSheet(courses[0])}
                >
                  <Printer className="size-4" />{t('teacher.printAttendanceSheet')}
                </Button>
              )}
              <Button variant="outline" onClick={() => api.downloadAttendanceReport()}>
                <Download className="size-4" />{page === 'reports' ? t('common.exportReport') : t('common.exportData')}
              </Button>
            </div>
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label={t('teacher.averageAttendance')} value={metrics.attendanceRate} detail={t('common.organizationAverage')} icon={BarChart3} />
          <Metric label={t('teacher.students')} value={String(metrics.students)} detail={t('common.enrolled')} icon={Users} />
          <Metric label={t('teacher.suspiciousAttempts')} value={String(metrics.flagged)} detail={t('common.needsReview')} icon={CircleAlert} tone="warning" />
        </div>
        <Card title={t('teacher.attendanceByCourse')}>
          <div className="flex flex-col gap-5">
            {courses.map((course) => (
              <div key={course.id}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium">{course.code} · {course.name}</span>
                  <span className="text-muted-foreground">{t('teacher.enrolledCount', { count: course.enrolled })}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 w-3/4 rounded-full bg-primary" />
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Button variant="outline" className="text-xs" onClick={() => api.downloadAttendanceReport({ courseId: course.id })}>
                    <Download className="size-3.5" />{t('common.export')}
                  </Button>
                  <Button variant="outline" className="text-xs" onClick={() => api.downloadAttendanceReport({ courseId: course.id, scope: 'detail' })}>
                    <Download className="size-3.5" />{t('teacher.detailedCsv')}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-xs border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                    onClick={() => openPrintableSheet(course)}
                  >
                    <Printer className="size-3.5" />{t('teacher.printAttendanceSheet')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }
  if (page === 'audit') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={adminEyebrow} title={t('teacher.activityLog')} detail={t('teacher.activityDetail')} action={<Button variant="outline" onClick={() => api.downloadAuditReport()}><Download />{t('common.exportLog')}</Button>} /><Card title={t('teacher.recentActivity')} description={organization.name}><div className="divide-y">{auditEvents.map((event) => <div key={event.id} className="flex gap-4 py-4"><div className={`mt-1 size-2 rounded-full ${event.severity === 'warning' ? 'bg-amber-500' : 'bg-primary'}`} /><div className="flex-1"><p className="text-sm"><span className="font-medium">{event.actor}</span> {event.action}</p><p className="mt-1 text-xs text-muted-foreground">{event.target} · {event.createdAt}</p></div><Status tone={event.severity === 'warning' ? 'warning' : 'neutral'}>{statusText(t, event.severity)}</Status></div>)}</div></Card></div>
  if (page === 'settings') {
    return (
      <div className="flex flex-col gap-6">
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
              <X className="size-4" />
            </button>
          </div>
        )}
        <SectionHeader eyebrow={staffEyebrow} title={t('teacher.settingsTitle')} detail={t('teacher.settingsDetail')} />

        <Card title={t('teacher.accountSecurity')} description={t('teacher.changePasswordDetail')}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email} · {role === 'admin' ? t('roles.admin') : t('roles.teacher')}</p>
              </div>
              {!showStaffChangePassword && (
                <Button variant="outline" onClick={() => setShowStaffChangePassword(true)}>
                  <LockKeyhole />{t('teacher.changePassword')}
                </Button>
              )}
            </div>

            {showStaffChangePassword && (
              <div className="mt-2 border-t pt-4">
                <ChangePasswordForm
                  onSuccess={async () => {
                    setShowStaffChangePassword(false)
                    setNotice(t('teacher.passwordChangedSuccess'))
                    await refresh()
                  }}
                  onCancel={() => setShowStaffChangePassword(false)}
                />
              </div>
            )}
          </div>
        </Card>

        <Card title={t('teacher.orgProfile')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('teacher.orgName')}
              <input className="h-11 rounded-lg border bg-muted/40 px-3 text-sm" defaultValue={organization.name} disabled />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Gói giải pháp
              <input className="h-11 rounded-lg border bg-muted/40 px-3 text-sm" defaultValue="SmartAttend Anti-Proxy Ultrasonic + Biometrics" disabled />
            </label>
            {isAdmin && (
              <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
                {t('auth.emailDomain')}
                <input
                  className="h-11 rounded-lg border bg-muted/40 px-3 text-sm"
                  defaultValue={organization.emailDomain ?? 'utc.edu.vn'}
                  disabled
                />
                <span className="text-xs font-normal text-muted-foreground">{t('auth.emailDomainHint')}</span>
              </label>
            )}
          </div>
        </Card>

        <Card title={t('teacher.attendancePolicy')} description={t('teacher.attendancePolicyDesc')}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">
                {t('teacher.policyTtlLabel')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('teacher.policyTtlDesc')}
              </p>
              <select
                value={policyTtl}
                onChange={(e) => {
                  setPolicyTtl(Number(e.target.value))
                  setPolicyDirty(true)
                  setSaved(false)
                }}
                className="h-11 rounded-lg border bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
              >
                <option value={15}>{t('teacher.ttl15')}</option>
                <option value={30}>{t('teacher.ttl30')}</option>
                <option value={45}>{t('teacher.ttl45')}</option>
                <option value={60}>{t('teacher.ttl60')}</option>
                <option value={120}>{t('teacher.ttl120')}</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">
                {t('teacher.policyGraceLabel')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('teacher.policyGraceDesc')}
              </p>
              <select
                value={policyLateAfter}
                onChange={(e) => {
                  setPolicyLateAfter(Number(e.target.value))
                  setPolicyDirty(true)
                  setSaved(false)
                }}
                className="h-11 rounded-lg border bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
              >
                <option value={5}>{t('teacher.grace5')}</option>
                <option value={10}>{t('teacher.grace10')}</option>
                <option value={15}>{t('teacher.grace15')}</option>
                <option value={20}>{t('teacher.grace20')}</option>
                <option value={30}>{t('teacher.grace30')}</option>
              </select>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex items-start gap-4">
            <div className="pt-0.5">
              <input
                id="requireTrustedDevice"
                type="checkbox"
                checked={policyRequireTrusted}
                onChange={(e) => {
                  setPolicyRequireTrusted(e.target.checked)
                  setPolicyDirty(true)
                  setSaved(false)
                }}
                className="size-5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
              />
            </div>
            <label htmlFor="requireTrustedDevice" className="flex-1 cursor-pointer">
              <span className="text-sm font-semibold text-foreground block">
                {t('teacher.requireTrustedTitle')}
              </span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {t('teacher.requireTrustedDesc')}
              </span>
            </label>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 pt-6 border-t">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Waves className="size-4" />
                <span>{t('teacher.ultrasonicFeatureTitle')}</span>
                <span className="ml-auto text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">{t('teacher.activeBadge')}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('teacher.ultrasonicFeatureDesc')}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <Fingerprint className="size-4" />
                <span>{t('teacher.biometricFeatureTitle')}</span>
                <span className="ml-auto text-[10px] bg-emerald-600/20 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{t('teacher.fido2Badge')}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('teacher.biometricFeatureDesc')}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={handleSavePolicy} disabled={savingPolicy}>
              {savingPolicy ? t('teacher.saving') : saved ? <><Check />{t('common.saved')}</> : t('common.saveChanges')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
      )}
      <SectionHeader
        eyebrow={staffEyebrow}
        title={t('teacher.goodMorning', { name: user.name })}
        detail={t('teacher.overviewDetail')}
        action={
          <Button onClick={() => go(isAdmin ? 'analytics' : 'sessions')}>
            <Wifi />{isAdmin ? t('teacher.viewAnalytics') : t('teacher.openLiveSession')}
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={isAdmin ? t('teacher.totalStudents') : t('teacher.todaysAttendance')} value={isAdmin ? metrics.students.toLocaleString() : metrics.attendanceRate} detail={isAdmin ? t('teacher.orgTotal') : t('teacher.acrossClasses')} icon={ClipboardCheck} />
        <Metric label={isAdmin ? t('teacher.totalTeachers') : t('teacher.activeStudents')} value={isAdmin ? String(metrics.teachers) : String(students.length)} detail={t('common.updatedToday')} icon={Users} />
        <Metric label={isAdmin ? t('teacher.activeSessions') : t('teacher.liveSessions')} value={String(metrics.activeSessions)} detail={t('common.runningNow')} icon={Wifi} />
        <Metric label={t('common.needsReview')} value={String(metrics.flagged)} detail={t('teacher.suspiciousAttempts')} icon={CircleAlert} tone="warning" />
      </div>

      {/* Leave Requests Review Panel */}
      <Card title={t('teacher.leaveClaims')} description={t('teacher.leaveClaimsDetail')}>
        {leaveRequests.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t('teacher.noLeaveClaims')}</p>
        ) : (
          <div className="divide-y">
            {leaveRequests.map((req) => (
              <div key={req.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{req.studentName}</span>
                    {req.studentCode && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{req.studentCode}</span>}
                    <span className="text-muted-foreground">· {req.courseName} ({req.date})</span>
                  </div>
                  <p className="text-muted-foreground"><strong>{t('student.absenceReason')}:</strong> {req.reason}</p>
                  {req.evidenceNote && <p className="text-muted-foreground text-[11px]"><strong>{t('student.evidenceLabel')}:</strong> {req.evidenceNote}</p>}
                  {req.attachmentUrl && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewProofUrl(req.attachmentUrl!)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <Eye className="size-3.5" />
                        {t('teacher.viewProof')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReviewLeave(req.id, 'approved')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        {t('teacher.approveLeave')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewLeave(req.id, 'rejected')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        {t('teacher.rejectLeave')}
                      </button>
                    </>
                  ) : (
                    <Status tone={req.status === 'approved' ? 'success' : 'danger'}>
                      {req.status === 'approved' ? t('status.excused') : t('teacher.rejected')}
                    </Status>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t('teacher.suspiciousAttendance')}
        description={t('teacher.suspiciousDetail')}
        action={<Button variant="ghost" onClick={() => go('students')}>{t('common.viewAll')} <ChevronRight /></Button>}
      >
        {suspicious.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="font-medium text-foreground">{t('teacher.noSuspicious')}</p>
            <p className="text-xs">{t('teacher.noSuspiciousDesc')}</p>
          </div>
        ) : (
          <div className="divide-y">
            {suspicious.map((item) => (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5" key={item.id}>
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 size-5 text-amber-500 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{item.studentName ?? t('roles.student')}</span>
                      {item.studentCode && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                          {item.studentCode}
                        </span>
                      )}
                      {item.createdAt && (
                        <span className="text-xs text-muted-foreground">· {item.createdAt}</span>
                      )}
                    </div>
                    <p className="text-xs text-amber-700 mt-0.5">{item.reason}</p>
                    {item.device && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Smartphone className="size-3 inline" /> {item.device}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleResolveSuspicious(item.id, 'approved')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    Chấp nhận
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveSuspicious(item.id, 'dismissed')}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    Hủy kết quả
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
    )
  }

  return (
    <>
      {renderContent()}
      {previewProofUrl && (
        <ProofPreviewModal url={previewProofUrl} onClose={() => setPreviewProofUrl(null)} />
      )}
      {printableCourse && (
        <PrintableAttendanceSheetModal
          course={printableCourse}
          summary={printableSummary}
          loading={loadingPrintable}
          user={user}
          filter={eligibilityFilter}
          onFilterChange={setEligibilityFilter}
          onClose={() => setPrintableCourse(null)}
        />
      )}
    </>
  )
}

const emptyDashboard: DashboardData = {
  courses: [], sessions: [], records: [], notifications: [], metrics: { students: 0, teachers: 0, activeSessions: 0, attendanceRate: '0%', flagged: 0 },
  suspicious: [], auditEvents: [], live: null, devices: [], departments: [], users: [], leaveRequests: [],
}

function NotificationBell({
  notifications,
  role,
  go,
  t,
}: {
  notifications: DashboardData['notifications']
  role: Role
  go: (page: PageKey) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((item) => !item.read).length

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const handleClick = () => {
    if (role === 'student') {
      go('notifications')
      return
    }
    setOpen((value) => !value)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={handleClick}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label={t('header.notifications')}
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />}
      </button>
      {open && role !== 'student' && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">{t('header.notifications')}</p>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">{t('student.unreadCount', { count: unreadCount })}</p>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('header.noNotifications')}</p>
            ) : (
              notifications.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className={`border-b px-4 py-3 last:border-b-0 ${!item.read ? 'bg-primary/5' : ''}`}
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function UserProfileDropdown({
  appUser,
  role,
  go,
  logout,
  t,
}: {
  appUser: AppUser
  role: Role
  go: (page: PageKey) => void
  logout: () => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const roleLabel =
    role === 'student'
      ? t('roles.student')
      : role === 'teacher'
        ? t('roles.teacher')
        : t('roles.admin')

  const profilePageKey: PageKey = role === 'student' ? 'profile' : 'settings'
  const profileLabel = role === 'student' ? t('nav.student.profile') : t('teacher.settingsTitle')

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 py-1 pl-1 pr-3 shadow-2xs dark:border-slate-700 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-expanded={open}
        aria-haspopup="menu"
        title={profileLabel}
      >
        <div className="grid size-7 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-2xs">
          {appUser.initials}
        </div>
        <span className="hidden text-xs font-bold text-slate-800 dark:text-slate-100 sm:inline-block">
          {appUser.name}
        </span>
        <ChevronDown
          className={`size-3.5 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-2 w-64 z-50 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 shadow-2xl p-1.5 text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* User brief header */}
          <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl mb-1 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {appUser.name}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {appUser.email}
            </p>
            <span className="inline-block mt-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              {roleLabel}
            </span>
          </div>

          {/* Action 1: Vào trang hồ sơ */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              go(profilePageKey)
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <UserRound className="size-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{role === 'student' ? 'Hồ sơ cá nhân' : 'Cài đặt tài khoản'}</p>
              <p className="text-[10px] text-slate-400 font-normal">
                {role === 'student' ? 'Thông tin & đổi mật khẩu' : 'Bảo mật & thông tin trường'}
              </p>
            </div>
          </button>

          {/* Action 2: Cài đặt Cookie */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              openCookieSettings()
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Cookie className="size-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Cài đặt Cookie</p>
              <p className="text-[10px] text-slate-400 font-normal">Quản lý quyền riêng tư</p>
            </div>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Action 3: Đăng xuất */}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await logout()
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <LogOut className="size-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{t('common.logout')}</p>
              <p className="text-[10px] text-rose-400/80 font-normal">Thoát khỏi phiên làm việc</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

export default function SmartAttendApp() {
  const router = useRouter()
  const { t } = useI18n()
  const [role, setRole] = useState<AuthUser>(null)
  const [authScreen, setAuthScreen] = useState<AuthScreen>('landing')
  const [page, setPage] = useState<PageKey>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [initialPortal, setInitialPortal] = useState<Portal>('student')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('smartattend_sidebar_collapsed')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === 'true') setSidebarCollapsed(true)
    } catch {
      // ignore
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('smartattend_sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }
  const [dark, setDark] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [data, setData] = useState<DashboardData>(emptyDashboard)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [organization, setOrganization] = useState<{ id?: string; name: string; plan: string; emailDomain?: string | null }>({ name: 'SmartAttend', plan: 'Campus Plus', emailDomain: null })
  const [mustChangePassword, setMustChangePassword] = useState(false)

  const hydrateUser = (user: NonNullable<Awaited<ReturnType<typeof api.me>>['user']>, nextRole: Role) => {
    setAppUser({
      name: user.name,
      email: user.email,
      initials: user.initials,
      department: user.department,
      role: nextRole,
      studentCode: user.studentCode,
      mustChangePassword: user.mustChangePassword,
    })
    setMustChangePassword(user.mustChangePassword)
  }

  const refresh = async () => {
    try {
      const next = await loadDashboard(role ?? undefined)
      setData(next)
    } catch {
      /* keep previous data */
    }
  }

  const openRegister = () => {
    setAuthScreen('register')
    router.push('/admin/register')
  }

  const goHome = async () => {
    setAuthScreen('landing')
    setMobileOpen(false)
    if (role) {
      await api.logout()
      setRole(null)
      setAppUser(null)
      setData(emptyDashboard)
      setMustChangePassword(false)
    }
    router.push('/')
  }

  useEffect(() => {
    const id = window.setTimeout(async () => {
      const path = window.location.pathname
      setAuthScreen(initialAuthScreen(path))

      // Preselect the portal matching the URL the user opened, e.g. opening
      // /admin/login shows the Admin tab instead of the default Student one.
      const pathPortal = portalForPath(path)
      if (pathPortal) setInitialPortal(pathPortal)

      try {
        const me = await api.me()
        if (me.ok && me.user && me.organization) {
          const nextRole = me.user.role
          if (canAccessRole(nextRole, path)) {
            setRole(nextRole)
            setPage(pageFromPath(path, nextRole))
            hydrateUser(me.user, nextRole)
            setOrganization({ id: me.organization.id, name: me.organization.name, plan: me.organization.plan, emailDomain: me.organization.emailDomain })
            const next = await loadDashboard(nextRole)
            setData(next)
          } else {
            window.history.replaceState({}, '', '/unauthorized')
          }
        }
      } catch {
        /* not signed in */
      }

      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  useEffect(() => {
    if (!role || !hydrated) return

    const poll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const next = await loadDashboard(role)
        setData(next)
      } catch {
        /* ignore polling errors */
      }
    }

    const intervalMs = data.live ? 5000 : 15000
    const interval = setInterval(poll, intervalMs)

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) void poll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [role, hydrated, data.live])

  const go = (next: PageKey) => {
    setPage(next)
    setMobileOpen(false)
    if (!role) return
    const slug = next === 'overview' ? 'dashboard' : next
    window.history.replaceState({}, '', `/${portalForRole(role)}/${slug}`)
  }

  const login = async (next: Role, forcePasswordChange = false) => {
    setRole(next)
    setPage('overview')
    const me = await api.me()
    if (me.ok && me.user && me.organization) {
      hydrateUser(me.user, next)
      setOrganization({ id: me.organization.id, name: me.organization.name, plan: me.organization.plan, emailDomain: me.organization.emailDomain })
      setMustChangePassword(forcePasswordChange || me.user.mustChangePassword)
    }
    await refresh()
    setAuthScreen('login')
    router.push(PORTAL_HOME[portalForRole(next)])
  }

  const logout = async () => {
    await api.logout()
    setRole(null)
    setAppUser(null)
    setMustChangePassword(false)
    setData(emptyDashboard)
    setAuthScreen('login')
    router.push(PORTAL_LOGIN.student)
  }

  if (!hydrated) return <div className="min-h-screen bg-[#071935]" aria-hidden="true" />
  if (!role || !appUser) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen
          onRegistered={(next) => login(next)}
          onBack={() => {
            setAuthScreen('login')
            router.push(PORTAL_LOGIN.admin)
          }}
          onHome={goHome}
        />
      )
    }
    return (
      <UtcLoginLanding
        onLogin={login}
        onRegister={openRegister}
        initialPortal={initialPortal}
        organizationName={organization.name}
      />
    )
  }

  const items = nav[role]
  const viewProps: ViewProps = {
    page,
    go,
    data,
    user: appUser,
    organization,
    refresh,
    onPasswordChanged: async () => {
      const me = await api.me()
      if (me.ok && me.user && role) {
        hydrateUser(me.user, role)
        setMustChangePassword(me.user.mustChangePassword)
      }
    },
  }

  return (
    <div className="min-h-screen utc-portal-bg flex selection:bg-blue-600 selection:text-white">
      {mustChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('auth.mustChangePasswordTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('auth.mustChangePasswordDetail')}</p>
            <div className="mt-5">
              <ChangePasswordForm
                forced
                onSuccess={async () => {
                  setMustChangePassword(false)
                  const me = await api.me()
                  if (me.ok && me.user) hydrateUser(me.user, role)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-out Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 flex-col utc-sidebar-bg text-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden flex ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 shrink-0">
          <UtcLogo
            compact={false}
            size={36}
            titleClassName="text-[12px] leading-tight"
            subtitleClassName="text-[9.5px] text-[#c8d3e2] max-w-[155px] truncate"
          />
          <button
            onClick={() => setMobileOpen(false)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label={t('common.cancel') || 'Close'}
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 scrollbar-thin">
          {items.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                go(key)
                setMobileOpen(false)
              }}
              className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                page === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{t(labelKey)}</span>
              </div>
              {key !== 'overview' && key !== 'profile' && key !== 'settings' && (
                <ChevronRight className="size-3.5 opacity-50" />
              )}
            </button>
          ))}
          <div className="my-3 border-t border-white/10" />
          <button
            onClick={() => {
              setMobileOpen(false)
              logout()
            }}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <LogOut className="size-4 shrink-0" />
            <span>{t('common.logout')}</span>
          </button>
        </nav>
      </aside>

      {/* Desktop Persistent Full-Height Sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-screen sticky top-0 shrink-0 z-30 border-r border-slate-800/80 utc-sidebar-bg text-white shadow-xl transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-[76px]' : 'w-72'
        }`}
      >
        {/* Top Logo & Single Toggle Button */}
        <div
          className={`h-16 flex items-center border-b border-white/10 px-4 shrink-0 ${
            sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex size-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer group"
              title={t('header.expandNav')}
              aria-label={t('header.expandNav')}
            >
              <UtcLogo compact size={34} />
            </button>
          ) : (
            <>
              <div className="flex items-center min-w-0">
                <UtcLogo
                  compact={false}
                  size={36}
                  titleClassName="text-[12px] leading-tight"
                  subtitleClassName="text-[9.5px] text-[#c8d3e2] max-w-[155px] truncate"
                />
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                title={t('header.collapseNav')}
                aria-label={t('header.collapseNav')}
              >
                <PanelLeftClose className="size-4" />
              </button>
            </>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 scrollbar-thin">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="mb-2 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-slate-300 transition-all hover:bg-white/10 hover:text-white cursor-pointer"
              title={t('header.expandNav')}
              aria-label={t('header.expandNav')}
            >
              <PanelLeftOpen className="size-4.5" />
            </button>
          )}
          {items.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => go(key)}
              title={sidebarCollapsed ? t(labelKey) : undefined}
              className={`flex items-center ${
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3.5 py-2.5'
              } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                page === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{t(labelKey)}</span>}
              </div>
              {!sidebarCollapsed && key !== 'overview' && key !== 'profile' && key !== 'settings' && (
                <ChevronRight className="size-3.5 opacity-50" />
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer with Logout Button */}
        <div className="p-3 border-t border-white/10 shrink-0">
          <button
            onClick={logout}
            title={sidebarCollapsed ? t('common.logout') : undefined}
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'
            } rounded-xl text-xs font-bold text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer`}
          >
            <LogOut className="size-4 shrink-0" />
            {!sidebarCollapsed && <span>{t('common.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Column: Header + Content */}
      <div className="flex flex-1 flex-col min-w-0 smartattend-page-enter">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#111d33]/90 sm:px-6 shadow-xs">
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              aria-label={t('header.openNav')}
            >
              <Menu className="size-5" />
            </button>

            {/* Mobile UTC Logo */}
            <div className="lg:hidden">
              <UtcLogo compact size={34} textColor="text-slate-800 dark:text-white" />
            </div>

            {/* Breadcrumb / Workspace eyebrow badge on desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400">
                {role === 'student' ? t('student.workspace') : role === 'admin' ? t('admin.administration') : t('teacher.workspace')}
              </span>
            </div>
          </div>

          {/* Central Search Capsule Bar */}
          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('student.searchPlaceholder')}
                className="h-9 w-full rounded-full border border-slate-200 bg-slate-100/80 pl-9 pr-4 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:bg-slate-800"
              />
            </div>
          </div>

          {/* Right Tools & User Profile Chip */}
          <div className="flex items-center gap-2.5">
            <LanguageSwitcher compact />
            <button
              onClick={() => setDark(!dark)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              aria-label={t('header.toggleDark')}
            >
              <Moon className="size-4" />
            </button>
            <NotificationBell notifications={data.notifications} role={role} go={go} t={t} />

            {/* User Profile Dropdown */}
            <UserProfileDropdown
              appUser={appUser}
              role={role}
              go={go}
              logout={logout}
              t={t}
            />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {role === 'student' ? <StudentView {...viewProps} /> : <StaffView {...viewProps} role={role} />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#111d33] lg:hidden shadow-lg">
        {items.slice(0, 4).map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => go(key)}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] font-medium transition-colors ${
              page === key ? 'text-blue-600 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="size-4" />
            <span className="truncate max-w-[70px]">{t(labelKey)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
