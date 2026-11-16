import { afterEach, describe, expect, it } from 'vitest'
import { evaluateMicrosoftIdentity, getMicrosoftAuth, isSingleTenant, MicrosoftConfigError, missingMicrosoftConfig } from './oauth'

const TENANT = '11111111-2222-3333-4444-555555555555'
const CLIENT = 'client-app-id'
const base = { oid: 'oid-1', tid: TENANT, aud: CLIENT, email: 'GV@utc.edu.vn' }

describe('Microsoft identity policy (account-takeover protection)', () => {
  it('accepts a token of the configured tenant and allows first-login linking by email', () => {
    expect(evaluateMicrosoftIdentity(base, { clientId: CLIENT, tenantId: TENANT })).toEqual({
      ok: true,
      providerAccountId: 'oid-1',
      email: 'gv@utc.edu.vn',
      mayLinkByEmail: true,
    })
  })

  it('rejects a token issued for another application (audience)', () => {
    expect(evaluateMicrosoftIdentity({ ...base, aud: 'other-app' }, { clientId: CLIENT, tenantId: TENANT })).toEqual({ ok: false, reason: 'audience' })
  })

  it('rejects a token from another tenant, or without tid, when a single tenant is configured', () => {
    expect(evaluateMicrosoftIdentity({ ...base, tid: 'aaaaaaaa-0000-0000-0000-000000000000' }, { clientId: CLIENT, tenantId: TENANT }).ok).toBe(false)
    expect(evaluateMicrosoftIdentity({ ...base, tid: undefined }, { clientId: CLIENT, tenantId: TENANT }).ok).toBe(false)
  })

  it('never allows linking by email in multi-tenant mode (common/organizations)', () => {
    for (const tenantId of ['common', 'organizations', 'COMMON', '']) {
      const res = evaluateMicrosoftIdentity({ ...base, tid: 'attacker-tenant' }, { clientId: CLIENT, tenantId })
      expect(res.ok && res.mayLinkByEmail).toBe(false)
    }
  })

  it('requires a stable object id and an email-like identifier', () => {
    expect(evaluateMicrosoftIdentity({ ...base, oid: undefined }, { clientId: CLIENT, tenantId: TENANT })).toEqual({ ok: false, reason: 'identity' })
    expect(evaluateMicrosoftIdentity({ ...base, email: undefined, preferred_username: undefined }, { clientId: CLIENT, tenantId: TENANT })).toEqual({ ok: false, reason: 'identity' })
  })

  it('isSingleTenant distinguishes concrete tenants from aliases', () => {
    expect(isSingleTenant(TENANT)).toBe(true)
    expect(isSingleTenant('common')).toBe(false)
    expect(isSingleTenant(undefined)).toBe(false)
  })
})

describe('Microsoft configuration errors are controlled', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('reports missing variable NAMES only and throws a typed error', () => {
    delete process.env.MICROSOFT_CLIENT_ID
    process.env.MICROSOFT_CLIENT_SECRET = 'super-secret-value'
    delete process.env.MICROSOFT_TENANT_ID
    delete process.env.MICROSOFT_REDIRECT_URI
    expect(missingMicrosoftConfig()).toEqual(['MICROSOFT_CLIENT_ID', 'MICROSOFT_TENANT_ID', 'MICROSOFT_REDIRECT_URI'])
    try {
      getMicrosoftAuth()
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(MicrosoftConfigError)
      expect(String((err as Error).message)).not.toContain('super-secret-value')
    }
  })
})
