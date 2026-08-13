'use client'

import { useI18n } from '@/components/i18n-provider'
import type { Locale } from '@/lib/i18n'

const options: { value: Locale; label: string }[] = [
  { value: 'vi', label: 'VI' },
  { value: 'en', label: 'EN' },
]

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n()

  return (
    <div className={`inline-flex rounded-lg border bg-background p-1 ${compact ? '' : 'shadow-sm'}`} role="group" aria-label="Language">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            locale === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
