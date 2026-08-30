'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { DashboardData } from '@/lib/api/client'
import type { Role } from '@/lib/types/domain'
import type { PageKey } from '@/components/smart-attend-ui'

export function NotificationBell({
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
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted cursor-pointer"
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
