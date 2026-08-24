'use client'

import React, { useState } from 'react'
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileCheck,
  GraduationCap,
  Headphones,
  HelpCircle,
  Lock,
  LockKeyhole,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { UtcLogo } from './utc-logo'
import { useI18n } from '@/components/i18n-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { api } from '@/lib/api/client'
import type { Role } from '@/lib/types/domain'

export function UtcLoginLanding({
  onLogin,
  onRegister,
  organizationName,
}: {
  onLogin: (role: Role, mustChangePassword?: boolean) => void
  onRegister: () => void
  organizationName: string
}) {
  const { t } = useI18n()
  const [portal, setPortal] = useState<'student' | 'staff'>('student')
  const [identifier, setIdentifier] = useState('20260001')
  const [password, setPassword] = useState('student123')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'qr' | 'schedule' | 'analytics' | 'leave' | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api.login(identifier, password, portal)
      if (!result.ok || !result.role) {
        setError(result.message ?? t('common.signInFailed'))
        return
      }
      onLogin(result.role, result.mustChangePassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.signInFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handlePortalChange = (nextPortal: 'student' | 'staff') => {
    setPortal(nextPortal)
    setError('')
    if (nextPortal === 'student') {
      setIdentifier('20260001')
      setPassword('student123')
    } else {
      setIdentifier('teacher@smartattend.edu.vn')
      setPassword('12345678')
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#071935] text-white flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Background radial gradient and lighting effects */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(21,69,137,0.85),rgba(7,25,53,0.95))]" />
      
      {/* Architectural columns watermark in the background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
      
      {/* Flying graduation caps / subtle university watermark */}
      <div className="pointer-events-none absolute right-10 top-1/4 opacity-10 blur-[1px]">
        <GraduationCap className="size-96 text-blue-200" />
      </div>

      {/* Main Header */}
      <header className="relative z-10 w-full px-4 pt-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Logo on Left */}
          <div className="flex items-center">
            <UtcLogo size={46} textColor="text-white" />
          </div>

          {/* Central Title (Hidden on small mobile, visible on sm+) */}
          <div className="hidden text-center md:block flex-1 px-4">
            <h1 className="text-lg font-extrabold tracking-wider uppercase text-white lg:text-xl xl:text-2xl drop-shadow-sm">
              {t('landing.utcTitle')}
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-300">
              {t('landing.utcSubtitle')}
            </p>
          </div>

          {/* Right Tools (Language Switcher, Portal toggle) */}
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/10 p-1 backdrop-blur-md">
              <LanguageSwitcher compact />
            </div>
          </div>
        </div>

        {/* Mobile Header Title */}
        <div className="mt-4 text-center md:hidden">
          <h1 className="text-base font-bold uppercase tracking-wider text-white">
            {t('landing.utcTitle')}
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-300">
            {t('landing.utcSubtitle')}
          </p>
        </div>
      </header>

      {/* Main 2-Card Container */}
      <main className="relative z-10 mx-auto my-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-8 items-stretch">
          
          {/* LEFT CARD: Welcome & Quick Features */}
          <div className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-2xl sm:p-8 text-slate-800">
            <div>
              {/* Header Title with Mortarboard Icon */}
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/30">
                  <GraduationCap className="size-5" />
                </div>
                <h2 className="text-base font-extrabold tracking-wide uppercase text-blue-900 sm:text-lg">
                  {t('landing.welcomeTitle')}
                </h2>
              </div>

              {/* University Intro */}
              <p className="mt-4 text-sm font-medium leading-relaxed text-slate-700">
                <strong className="text-blue-950">Trường Đại học Giao thông Vận tải</strong> — nơi đào tạo nguồn nhân lực chất lượng cao trong lĩnh vực Giao thông Vận tải, Kinh tế, Kỹ thuật và Công nghệ.
              </p>
              <p className="mt-2 text-xs leading-normal text-slate-500">
                {t('landing.welcomeDetail')}
              </p>

              {/* 2x2 Feature Tiles */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Tile 1: Điểm danh QR động */}
                <div
                  onClick={() => setActiveTab(activeTab === 'qr' ? null : 'qr')}
                  className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f4f7fc] p-3.5 transition-all hover:bg-blue-50/70 hover:border-blue-200 cursor-pointer shadow-xs"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <QrCode className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{t('landing.featQR')}</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{t('landing.featQRSub')}</p>
                  </div>
                </div>

                {/* Tile 2: Thời khóa biểu & Ca học */}
                <div
                  onClick={() => setActiveTab(activeTab === 'schedule' ? null : 'schedule')}
                  className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f4f7fc] p-3.5 transition-all hover:bg-blue-50/70 hover:border-blue-200 cursor-pointer shadow-xs"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <Calendar className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{t('landing.featSchedule')}</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{t('landing.featScheduleSub')}</p>
                  </div>
                </div>

                {/* Tile 3: Báo cáo chuyên cần */}
                <div
                  onClick={() => setActiveTab(activeTab === 'analytics' ? null : 'analytics')}
                  className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f4f7fc] p-3.5 transition-all hover:bg-blue-50/70 hover:border-blue-200 cursor-pointer shadow-xs"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <BarChart3 className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{t('landing.featAnalytics')}</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{t('landing.featAnalyticsSub')}</p>
                  </div>
                </div>

                {/* Tile 4: Minh chứng nghỉ phép & GPS */}
                <div
                  onClick={() => setActiveTab(activeTab === 'leave' ? null : 'leave')}
                  className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-[#f4f7fc] p-3.5 transition-all hover:bg-blue-50/70 hover:border-blue-200 cursor-pointer shadow-xs"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">{t('landing.featLeave')}</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{t('landing.featLeaveSub')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Demo Selector */}
            <div className="mt-6 border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Tài khoản thử nghiệm:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPortal('student')
                    setIdentifier('20260001')
                    setPassword('student123')
                  }}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-blue-100 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  Sinh viên (20260001)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortal('staff')
                    setIdentifier('teacher@smartattend.edu.vn')
                    setPassword('12345678')
                  }}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-blue-100 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  Giảng viên
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT CARD: Login Box */}
          <div className="relative flex flex-col justify-between rounded-3xl bg-white p-6 shadow-2xl sm:p-8 text-slate-800">
            {/* Top Floating Lock Icon Badge */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/40 ring-4 ring-white">
              <LockKeyhole className="size-6" />
            </div>

            <div>
              {/* Form Title */}
              <div className="mt-3 text-center">
                <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                  {portal === 'student' ? 'ĐĂNG NHẬP' : 'ĐĂNG NHẬP CÁN BỘ'}
                </h2>
                <div className="mt-2 inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => handlePortalChange('student')}
                    className={`rounded-full px-3 py-1 transition-all ${
                      portal === 'student'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sinh viên
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePortalChange('staff')}
                    className={`rounded-full px-3 py-1 transition-all ${
                      portal === 'staff'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Giảng viên / Quản trị
                  </button>
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                {/* Identifier Input with Left Icon */}
                <div>
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute left-3.5 text-slate-400">
                      <UserRound className="size-4" />
                    </div>
                    <input
                      type={portal === 'student' ? 'text' : 'email'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={portal === 'student' ? 'Nhập tài khoản hoặc email' : 'Email giảng viên'}
                      required
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>

                {/* Password Input with Left Icon and Right Eye */}
                <div>
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute left-3.5 text-slate-400">
                      <Lock className="size-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mật khẩu"
                      required
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600"
                      aria-label="Toggle password"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Forgot Password & Help Links */}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => alert('Mật khẩu mặc định sinh viên: Sv@{mã SV}. Hoặc liên hệ phòng đào tạo để cấp lại.')}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t('login.forgotPassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => alert('Hotline hỗ trợ kỹ thuật: 024 3204 5867 (8h00 - 17h30)')}
                    className="flex items-center gap-1 font-medium text-blue-600 hover:underline"
                  >
                    <HelpCircle className="size-3" /> {t('landing.help')}
                  </button>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                    <CircleAlert className="size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Primary Login Button (Deep Navy Gradient) */}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-[#173a74] via-[#1d4ed8] to-[#1e40af] text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-blue-900/20 transition-all hover:brightness-110 hover:shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'ĐANG XÁC THỰC…' : 'ĐĂNG NHẬP'}
                </button>
              </form>

              {/* Or Divider */}
              <div className="relative my-3.5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                  {t('landing.orSignIn')}
                </span>
              </div>

              {/* Microsoft Login Button */}
              <button
                type="button"
                onClick={() => alert('Tính năng đăng nhập với Microsoft 365 tài khoản trường đang sẵn sàng kết nối.')}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-[#0078d4] text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#006cbd] active:scale-[0.99] cursor-pointer"
              >
                {/* 4-Color Microsoft Logo */}
                <svg className="size-4" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                <span>{t('landing.signInMicrosoft')}</span>
              </button>
            </div>

            {/* Teacher Registration Link */}
            {portal === 'staff' && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={onRegister}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {t('auth.registerTeacher')} →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM FEATURE BAR (Translucent dark glass with 4 security points) */}
        <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-xl backdrop-blur-md">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Feature 1 */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('landing.securityAbsolute')}</h4>
                <p className="text-[11px] text-slate-300">{t('landing.securityAbsoluteSub')}</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                <MapPin className="size-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('landing.safePayment')}</h4>
                <p className="text-[11px] text-slate-300">{t('landing.safePaymentSub')}</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                <Headphones className="size-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('landing.support247')}</h4>
                <p className="text-[11px] text-slate-300">{t('landing.support247Sub')}</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('landing.fastConfirm')}</h4>
                <p className="text-[11px] text-slate-300">{t('landing.fastConfirmSub')}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 w-full px-4 py-4 text-center text-[11px] text-slate-400">
        <p className="mx-auto max-w-5xl">
          {t('landing.devBy')}
        </p>
      </footer>
    </div>
  )
}
