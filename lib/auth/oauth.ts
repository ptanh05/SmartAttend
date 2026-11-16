import { MicrosoftEntraId } from 'arctic'

export const MICROSOFT_ENV_VARS = [
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_REDIRECT_URI',
] as const

/** Names (never values) of the Microsoft SSO variables that are missing. */
export function missingMicrosoftConfig(): string[] {
  return MICROSOFT_ENV_VARS.filter((name) => !process.env[name]?.trim())
}

export class MicrosoftConfigError extends Error {
  missing: string[]
  constructor(missing: string[]) {
    super(`Microsoft OAuth configuration is missing: ${missing.join(', ')}`)
    this.missing = missing
  }
}

export function getMicrosoftAuth() {
  const missing = missingMicrosoftConfig()
  if (missing.length > 0) throw new MicrosoftConfigError(missing)

  return new MicrosoftEntraId(
    process.env.MICROSOFT_TENANT_ID!.trim(),
    process.env.MICROSOFT_CLIENT_ID!.trim(),
    process.env.MICROSOFT_CLIENT_SECRET!.trim(),
    process.env.MICROSOFT_REDIRECT_URI!.trim(),
  )
}

const MULTI_TENANT_ALIASES = new Set(['common', 'organizations', 'consumers'])

/** A concrete Entra tenant (GUID or verified domain), not a multi-tenant alias. */
export function isSingleTenant(tenantId: string | undefined): boolean {
  const t = tenantId?.trim().toLowerCase()
  return Boolean(t) && !MULTI_TENANT_ALIASES.has(t!)
}

export type MicrosoftIdTokenClaims = {
  oid?: string
  tid?: string
  aud?: string | string[]
  email?: string
  preferred_username?: string
}

export type MicrosoftIdentityDecision =
  | { ok: true; providerAccountId: string; email: string; mayLinkByEmail: boolean }
  | { ok: false; reason: 'audience' | 'tenant' | 'identity' }

/**
 * Validates ID-token claims received directly from the Microsoft token
 * endpoint (code flow over TLS, PKCE + state already checked) and decides
 * whether a FIRST login may be linked to an existing account by email.
 *
 * Linking by email is only allowed when the app is restricted to one specific
 * tenant AND the token's `tid` equals it: inside a single institutional tenant
 * the address is administered by the institution. With a multi-tenant
 * configuration (`common` / `organizations`) any Microsoft account could
 * present a matching `preferred_username`, which would allow account takeover.
 */
export function evaluateMicrosoftIdentity(
  claims: MicrosoftIdTokenClaims,
  config: { clientId: string; tenantId: string },
): MicrosoftIdentityDecision {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!config.clientId || !audiences.includes(config.clientId)) return { ok: false, reason: 'audience' }

  const singleTenant = isSingleTenant(config.tenantId)
  if (singleTenant && (!claims.tid || claims.tid.toLowerCase() !== config.tenantId.trim().toLowerCase())) {
    return { ok: false, reason: 'tenant' }
  }

  const email = (claims.email || claims.preferred_username || '').trim().toLowerCase()
  if (!claims.oid || !email) return { ok: false, reason: 'identity' }

  return { ok: true, providerAccountId: claims.oid, email, mayLinkByEmail: singleTenant }
}
