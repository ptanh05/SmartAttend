'use client'

import React, { useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileCheck,
  FileText,
  GraduationCap,
  Inbox,
  Pin,
  QrCode,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useI18n } from '@/components/i18n-provider'
import type { AppUser, PageKey, ViewProps } from './smart-attend-ui'

export function formatUtcDate(locale: string = 'vi'): { greeting: string; dateString: string } {
  const now = new Date()
  const hour = now.getHours()
  let greeting = 'Chào buổi sáng,'
  if (hour >= 12 && hour < 18) {
    greeting = 'Chào buổi chiều,'
  } else if (hour >= 18) {
    greeting = 'Chào buổi tối,'
  }

  const daysVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const dayOfWeek = locale === 'vi' ? daysVi[now.getDay()] : daysEn[now.getDay()]
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  const dateString =
    locale === 'vi'
      ? `${dayOfWeek}, ngày ${day}/${month}/${year}`
      : `${dayOfWeek}, ${month}/${day}/${year}`

  return { greeting, dateString }
}

export function UtcStudentDashboard({
  user,
  go,
  data,
}: {
  user: AppUser
  go: (p: PageKey) => void
  data: ViewProps['data']
}) {
  const { t, locale } = useI18n()
  const { greeting, dateString } = formatUtcDate(locale)
  const [newsModal, setNewsModal] = useState<{ title: string; date: string; content: string } | null>(null)

  const schoolNews = [
    {
      id: 'sn-1',
      title: 'Quy định đánh giá điểm chuyên cần và điều kiện dự thi kết thúc học phần Học kỳ I',
      date: '21/08/2026',
      content: 'Sinh viên có tỷ lệ vắng mặt vượt quá 20% tổng số tiết của học phần sẽ không đủ điều kiện dự thi kết thúc học phần. Đề nghị sinh viên theo dõi tỷ lệ chuyên cần thường xuyên trên hệ thống SmartAttend.',
    },
    {
      id: 'sn-2',
      title: 'Hướng dẫn quét mã QR động điểm danh qua ứng dụng SmartAttend tại phòng học',
      date: '21/08/2026',
      content: 'Mã QR tại giảng đường được tự động làm mới theo chu kỳ để đảm bảo tính minh bạch. Sinh viên cần kết nối mạng Wi-Fi trường và cấp quyền định vị vị trí để hoàn tất điểm danh hợp lệ.',
    },
    {
      id: 'sn-3',
      title: 'Quy trình gửi đơn xin phép vắng học và nộp minh chứng y tế / công tác trực tuyến',
      date: '11/08/2026',
      content: 'Sinh viên gửi đơn kèm ảnh chụp minh chứng qua mục Lịch sử chuyên cần trong vòng 48 giờ kể từ buổi học cần xin phép để được giảng viên phụ trách xem xét duyệt vắng có phép.',
    },
  ]

  const trainingNews = [
    {
      id: 'tn-1',
      title: 'Lưu ý bật định vị GPS và cấp quyền Camera khi thực hiện quét mã điểm danh',
      date: '22/08/2026',
      content: 'Hệ thống yêu cầu xác thực vị trí phòng học để chống điểm danh hộ từ xa. Vui lòng đảm bảo thiết bị đã bật GPS và trình duyệt cho phép truy cập vị trí.',
    },
    {
      id: 'tn-2',
      title: 'Thông báo lịch mở phiên điểm danh học bù cho các lớp học phần Tuần 12',
      date: '22/08/2026',
      content: 'Giảng viên các lớp học phần có lịch học bù đã cập nhật phiên điểm danh mới. Sinh viên theo dõi mục Lịch học để vào điểm danh đúng khung giờ quy định.',
    },
    {
      id: 'tn-3',
      title: 'Cảnh báo tự động: Hệ thống đã gửi thông báo đến các sinh viên chạm ngưỡng vắng 15%',
      date: '22/08/2026',
      content: 'Sinh viên nhận được cảnh báo cần kiểm tra lại lịch sử điểm danh, các đơn nghỉ phép đã gửi và liên hệ trực tiếp với Giảng viên nếu có sai sót.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP WELCOME HERO BANNER (Vibrant Royal Blue Gradient) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#185adb] via-[#216fe0] to-[#3a86ff] p-6 text-white shadow-lg sm:p-8">
        {/* Subtle background light circles */}
        <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 right-1/3 size-40 rounded-full bg-blue-400/20 blur-xl" />

        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <p className="text-sm font-medium tracking-wide text-blue-100/90">
              {greeting}
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl text-white drop-shadow-xs">
              {user.name}
            </h1>
            <div className="flex items-center gap-2 pt-1 text-xs font-medium text-blue-100">
              <Calendar className="size-3.5 shrink-0 text-blue-200" />
              <span>{dateString}</span>
              {user.studentCode && (
                <>
                  <span className="opacity-60">•</span>
                  <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-xs">
                    MSV: {user.studentCode}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right Icon Container */}
          <div className="flex items-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md ring-1 ring-white/30 shadow-inner sm:size-20">
              <GraduationCap className="size-10 sm:size-12 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. FOUR QUICK SHORTCUT ACTION CARDS */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Shortcut 1: Điểm danh ngay / Quét QR */}
        <div
          onClick={() => go('join')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#1e4da1] text-white shadow-sm group-hover:scale-105 transition-transform">
            <ScanLine className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickScan')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickScanSub')}
            </h2>
          </div>
        </div>

        {/* Shortcut 2: Lịch học / Ca học & Phòng học */}
        <div
          onClick={() => go('courses')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#e67e22] text-white shadow-sm group-hover:scale-105 transition-transform">
            <Calendar className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickSchedule')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickTimetable')}
            </h2>
          </div>
        </div>

        {/* Shortcut 3: Chuyên cần / Lịch sử điểm danh */}
        <div
          onClick={() => go('history')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#009688] text-white shadow-sm group-hover:scale-105 transition-transform">
            <ClipboardCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickHistory')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickHistorySub')}
            </h2>
          </div>
        </div>

        {/* Shortcut 4: Thông báo / Nhắc nhở & Cảnh báo */}
        <div
          onClick={() => go('notifications')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#d32f2f] text-white shadow-sm group-hover:scale-105 transition-transform">
            <Bell className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickInfo')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickNewsNotice')}
            </h2>
          </div>
        </div>
      </div>

      {/* 3. TWO-COLUMN NEWS GRID (TIN NHÀ TRƯỜNG & TIN ĐÀO TẠO) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: TIN NHÀ TRƯỜNG */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-blue-600" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-blue-950 dark:text-slate-100">
                {t('student.schoolNews')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => go('notifications')}
              className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors dark:border-blue-900/60 dark:bg-slate-900 dark:text-blue-400 cursor-pointer"
            >
              {t('student.viewAll')}
            </button>
          </div>

          <div className="divide-y divide-slate-100 p-5 dark:divide-slate-800/60">
            {schoolNews.map((news) => (
              <div
                key={news.id}
                onClick={() => setNewsModal(news)}
                className="group flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0 hover:text-blue-600 transition-colors"
              >
                <div className="mt-0.5 text-blue-600">
                  <Pin className="size-3.5 rotate-45" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold leading-relaxed text-slate-800 group-hover:text-blue-600 transition-colors dark:text-slate-200">
                    {news.title}
                  </h3>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Calendar className="size-3" />
                    <span>{news.date}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: TIN ĐÀO TẠO */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-blue-600" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-blue-950 dark:text-slate-100">
                {t('student.academicNews')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => go('notifications')}
              className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors dark:border-blue-900/60 dark:bg-slate-900 dark:text-blue-400 cursor-pointer"
            >
              {t('student.viewAll')}
            </button>
          </div>

          <div className="divide-y divide-slate-100 p-5 dark:divide-slate-800/60">
            {trainingNews.map((news) => (
              <div
                key={news.id}
                onClick={() => setNewsModal(news)}
                className="group flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0 hover:text-blue-600 transition-colors"
              >
                <div className="mt-0.5 text-blue-600">
                  <Pin className="size-3.5 rotate-45" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold leading-relaxed text-slate-800 group-hover:text-blue-600 transition-colors dark:text-slate-200">
                    {news.title}
                  </h3>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Calendar className="size-3" />
                    <span>{news.date}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. ATTENDANCE STATUS & UPCOMING SESSIONS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cảnh báo & Tình trạng chuyên cần */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-emerald-500" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-emerald-950 dark:text-slate-100">
                {t('student.studentActivities')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => go('history')}
              className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-400 cursor-pointer"
            >
              {t('student.viewAll')}
            </button>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50/80 p-3.5 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-900/40">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div>
                <p className="font-bold">Trạng thái chuyên cần: An toàn</p>
                <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  Tất cả các học phần hiện tại đều đạt tỷ lệ có mặt trên 80%. Bạn đủ điều kiện dự thi kết thúc học phần.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Quy chế: Vắng quá 20% tổng số tiết sẽ bị cấm thi.</span>
              <button
                type="button"
                onClick={() => go('history')}
                className="font-semibold text-blue-600 hover:underline cursor-pointer dark:text-blue-400"
              >
                Chi tiết vắng →
              </button>
            </div>
          </div>
        </div>

        {/* Phiên điểm danh & Ca học */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-amber-500" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                {t('student.upcomingEvents')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => go('courses')}
              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-colors dark:border-amber-900/60 dark:bg-slate-900 dark:text-amber-400 cursor-pointer"
            >
              Lịch học
            </button>
          </div>
          <div className="p-5 flex flex-col items-center justify-center text-center">
            <Clock className="size-8 text-amber-500 mb-2" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Sẵn sàng cho các ca học hôm nay
            </p>
            <p className="mt-1 text-[11px] text-slate-500 max-w-sm">
              Khi giảng viên mở phiên điểm danh trên lớp, hãy bấm nút quét mã QR bên dưới để xác thực tham gia.
            </p>
            <button
              type="button"
              onClick={() => go('join')}
              className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <ScanLine className="size-4" />
              Quét mã QR điểm danh
            </button>
          </div>
        </div>
      </div>

      {/* Detail News Modal */}
      {newsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <Calendar className="size-3" />
                  {newsModal.date}
                </span>
                <h3 className="mt-2.5 text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {newsModal.title}
                </h3>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {newsModal.content}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNewsModal(null)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
