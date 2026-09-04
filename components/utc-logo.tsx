'use client'

import React from 'react'
import Image from 'next/image'

export function UtcLogo({
  compact = false,
  className = '',
  textColor,
  size = 46,
  subtitle,
}: {
  compact?: boolean
  className?: string
  textColor?: string
  size?: number
  subtitle?: string
}) {
  const displaySubtitle = subtitle !== undefined ? subtitle : 'UNIVERSITY OF TRANSPORT AND COMMUNICATIONS'

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Official UTC Seal / Emblem with crisp white border */}
      <div
        className="relative shrink-0 flex items-center justify-center rounded-full bg-white p-[1.5px] shadow-md ring-1 ring-white/60"
        style={{ width: size, height: size }}
      >
        <Image
          src="/utc-logo.png"
          alt="Trường Đại học Giao thông Vận tải - UTC"
          width={size}
          height={size}
          className="h-full w-full rounded-full object-contain"
          priority
        />
      </div>

      {!compact && (
        <div className="flex flex-col justify-center leading-tight">
          <span
            className={`text-[14px] sm:text-[15px] font-black tracking-wide uppercase ${
              textColor || 'text-[#efe68f]'
            }`}
            style={{
              textShadow: '0 1px 2px rgba(0,0,0,0.25)',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI
          </span>
          {displaySubtitle && (
            <span
              className="text-[10px] sm:text-[11px] font-medium tracking-wider uppercase text-[#d5dce5]/90"
              style={{
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {displaySubtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

