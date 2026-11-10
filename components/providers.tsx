'use client'

import { I18nProvider } from '@/components/i18n-provider'
import { CookieConsentBanner } from '@/components/cookie-consent-banner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      {children}
      <CookieConsentBanner />
    </I18nProvider>
  )
}
