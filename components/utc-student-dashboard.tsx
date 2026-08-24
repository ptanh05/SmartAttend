'use client'

import React, { useState } from 'react'
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  Inbox,
  Newspaper,
  Pin,
  ScanLine,
  Search,
  Sparkles,
  Wallet,
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
      title: 'THÔNG BÁO MỞ HỆ THỐNG LÀM BÀI THU HOẠCH SINH HOẠT CÔNG DÂN – SINH VIÊN NĂM HỌC 2026 – 2027 Dành cho sinh viên Khóa 63, 64, 65, 66',
      date: '21/08/2026',
      content: 'Nhà trường thông báo mở hệ thống trực tuyến để toàn thể sinh viên các khóa 63, 64, 65, 66 hoàn thành bài thu hoạch Tuần sinh hoạt công dân đầu năm học. Đề nghị các bạn sinh viên nghiêm túc thực hiện đúng thời hạn quy định.',
    },
    {
      id: 'sn-2',
      title: 'Gia hạn đánh giá RLSV học kì II năm học 2025 - 2026',
      date: '21/08/2026',
      content: 'Phòng Công tác sinh viên thông báo gia hạn thời gian tự đánh giá điểm rèn luyện của sinh viên và đánh giá của ban cán sự lớp đến hết ngày 30/08/2026.',
    },
    {
      id: 'sn-3',
      title: 'Thực hiện chế độ chính sách sinh viên học kỳ I năm học 2026 - 2027',
      date: '11/08/2026',
      content: 'Hướng dẫn nộp hồ sơ xét miễn giảm học phí và trợ cấp xã hội cho sinh viên diện chính sách trong học kỳ I năm học 2026 - 2027.',
    },
  ]

  const trainingNews = [
    {
      id: 'tn-1',
      title: 'Hướng dẫn sinh viên đăng ký nhu cầu (nguyện vọng) học kỳ 1 đợt học 2 năm học 2026 - 2027',
      date: '22/08/2026',
      content: 'Phòng Đào tạo Đại học hướng dẫn các bước đăng ký nguyện vọng lớp học phần qua cổng thông tin tín chỉ.',
    },
    {
      id: 'tn-2',
      title: 'Hướng dẫn sinh viên đăng ký nhu cầu (nguyện vọng) học kỳ 1 đợt học 2 năm học 2026 - 2027',
      date: '22/08/2026',
      content: 'Lưu ý về số lượng tín chỉ tối thiểu và tối đa được phép đăng ký trong đợt học 2.',
    },
    {
      id: 'tn-3',
      title: 'Thông báo hủy kết quả đăng ký Tiếng Anh B1, tiếng Anh chuyên ngành do chưa qua Tiếng Anh A2',
      date: '22/08/2026',
      content: 'Danh sách các sinh viên chưa đạt điều kiện tiên quyết môn Tiếng Anh A2 sẽ được rà soát và hủy đăng ký môn học phần kế tiếp theo đúng quy chế đào tạo.',
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
        {/* Shortcut 1: Học tập / Đăng ký học (Điểm danh QR) */}
        <div
          onClick={() => go('join')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#1e4da1] text-white shadow-sm group-hover:scale-105 transition-transform">
            <BookOpen className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickAcademic')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickCourseReg')}
            </h2>
          </div>
        </div>

        {/* Shortcut 2: Lịch / Thời khóa biểu */}
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

        {/* Shortcut 3: Tài chính / Học phí */}
        <div
          onClick={() => go('history')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#009688] text-white shadow-sm group-hover:scale-105 transition-transform">
            <Wallet className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('student.quickFinance')}
            </p>
            <h2 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('student.quickTuition')}
            </h2>
          </div>
        </div>

        {/* Shortcut 4: Thông tin / Tin tức & thông báo */}
        <div
          onClick={() => go('notifications')}
          className="group flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-[#121c2d]"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#d32f2f] text-white shadow-sm group-hover:scale-105 transition-transform">
            <Newspaper className="size-5" />
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

      {/* 4. SECONDARY ROW: HOẠT ĐỘNG SINH VIÊN & SỰ KIỆN SẮP TỚI */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hoạt động sinh viên */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-blue-600">
          <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-blue-600" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-blue-950 dark:text-slate-100">
                {t('student.studentActivities')}
              </h2>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-slate-400">
            <Inbox className="size-7 mb-2 text-slate-300 dark:text-slate-600" />
            <p>{t('student.noNewsYet')}</p>
          </div>
        </div>

        {/* Sự kiện sắp tới (Right box) */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-amber-500">
          <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-amber-500" />
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                {t('student.upcomingEvents')}
              </h2>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-slate-400">
            <Calendar className="size-7 mb-2 text-slate-300 dark:text-slate-600" />
            <p>{t('student.noEventsYet')}</p>
          </div>
        </div>
      </div>

      {/* 5. BOTTOM WIDE CARD: SỰ KIỆN SẮP TỚI */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] border-l-4 border-l-amber-500">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-amber-500" />
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-300">
              {t('student.upcomingEvents')}
            </h2>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
          <Calendar className="size-7 mb-2 text-slate-300 dark:text-slate-600" />
          <p>{t('student.noEventsYet')}</p>
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
