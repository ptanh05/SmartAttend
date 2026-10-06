'use client'

import React from 'react'
import Image from 'next/image'

export function UtcLogo({
  compact = false,
  className = '',
  textColor,
  size = 46,
  title = 'TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI',
  subtitle,
  titleClassName,
  subtitleClassName,
}: {
  compact?: boolean
  className?: string
  textColor?: string
  size?: number
  title?: string
  subtitle?: string
  titleClassName?: string
  subtitleClassName?: string
}) {
  const displaySubtitle = subtitle !== undefined ? subtitle : 'UNIVERSITY OF TRANSPORT AND COMMUNICATIONS'

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
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
        <div className="flex flex-col justify-center leading-tight min-w-0">
          <span
            className={`font-black tracking-wide uppercase ${
              textColor || 'text-[#efe68f]'
            } ${titleClassName || 'text-[14px] sm:text-[15px]'}`}
            style={{
              textShadow: '0 1px 2px rgba(0,0,0,0.25)',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {title}
          </span>
          {displaySubtitle && (
            <span
              className={`font-medium tracking-wider uppercase text-[#d5dce5]/90 ${
                subtitleClassName || 'text-[10px] sm:text-[11px]'
              }`}
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

