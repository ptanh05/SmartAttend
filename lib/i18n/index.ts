import { en } from './locales/en'
import { vi } from './locales/vi'
import type { Locale, Messages } from './types'

export const locales: Locale[] = ['en', 'vi']
export const defaultLocale: Locale = 'vi'

export const messages: Record<Locale, Messages> = { en, vi }

export function translate(locale: Locale, key: string, params?: Record<string, string | number>) {
  const parts = key.split('.')
  let value: unknown = messages[locale]

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part]
    } else {
      value = undefined
      break
    }
  }

  if (typeof value !== 'string') return key

  if (!params) return value

  return Object.entries(params).reduce(
    (result, [name, paramValue]) => result.replaceAll(`{${name}}`, String(paramValue)),
    value,
  )
}

export type { Locale, Messages }
