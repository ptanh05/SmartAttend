'use client'

import React from 'react'

export function UtcLogo({
  compact = false,
  className = '',
  textColor = 'text-white',
  size = 42,
  subtitle = '',
}: {
  compact?: boolean
  className?: string
  textColor?: string
  size?: number
  subtitle?: string
}) {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* University Seal / Emblem in Gold & Navy */}
      <div
        className="relative shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-amber-300 to-yellow-500 p-[2px] shadow-md ring-2 ring-amber-400/30"
        style={{ width: size, height: size }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0a1930] text-amber-400">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full p-1.5"
            fill="none"
            stroke="currentColor"
          >
            {/* Outer ring with decorative teeth */}
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="41" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="2" />
            
            {/* Compass / Winged Railway Wheel symbol of Transport & Communications */}
            <g transform="translate(50,50)">
              {/* Central hub */}
              <circle cx="0" cy="0" r="8" fill="currentColor" />
              <circle cx="0" cy="0" r="4" fill="#0a1930" />
              
              {/* Wheel Spokes */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1="0"
                  y1="0"
                  x2={26 * Math.cos((deg * Math.PI) / 180)}
                  y2={26 * Math.sin((deg * Math.PI) / 180)}
                  stroke="currentColor"
                  strokeWidth="2"
                />
              ))}

              {/* Dynamic Wings / Orbit Path */}
              <path
                d="M -30 -10 C -15 -25, 15 -25, 30 -10 C 20 -15, -20 -15, -30 -10 Z"
                fill="currentColor"
              />
              <path
                d="M -32 5 C -20 22, 20 22, 32 5 C 22 14, -22 14, -32 5 Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-col leading-tight">
          <span className={`text-[13px] font-bold tracking-wide uppercase ${textColor}`}>
            TRƯỜNG ĐẠI HỌC
          </span>
          <span className="text-[14px] font-extrabold tracking-wider uppercase text-amber-400">
            GIAO THÔNG VẬN TẢI
          </span>
          {subtitle && (
            <span className="text-[11px] font-medium text-slate-300">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
