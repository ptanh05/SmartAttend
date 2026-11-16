import { createHash, generateKeyPairSync, randomBytes, type KeyObject } from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkAuthenticatorData,
  consumeWebAuthnChallenge,
  generateWebAuthnChallenge,
  verifyPasskeyRegistration,
} from './webauthn'

// Single-use nonce store backed by an in-memory Set instead of Postgres.
const { usedNonces } = vi.hoisted(() => ({ usedNonces: new Set<string>() }))
vi.mock('@/lib/db', () => ({
  db: () => ({
    insert: () => ({
      values: (row: { key: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (usedNonces.has(row.key)) return []
            usedNonces.add(row.key)
            return [{ key: row.key }]
          },
        }),
      }),
    }),
  }),
}))

const RP_ID = 'localhost'
const ORIGIN = 'http://localhost:3000'
const USER = 'user_reg_1'

// --- tiny CBOR encoder (test-only) for COSE_Key maps -------------------------
function cborHead(major: number, value: number) {
  if (value < 24) return Buffer.from([(major << 5) | value])
  if (value < 256) return Buffer.from([(major << 5) | 24, value])
  const b = Buffer.alloc(3)
  b[0] = (major << 5) | 25
  b.writeUInt16BE(value, 1)
  return b
}
function cborInt(n: number) {
  return n >= 0 ? cborHead(0, n) : cborHead(1, -1 - n)
}
function cborBytes(b: Buffer) {
  return Buffer.concat([cborHead(2, b.length), b])
}
function cborMap(entries: Array<[number, Buffer]>) {
  return Buffer.concat([cborHead(5, entries.length), ...entries.flatMap(([k, v]) => [cborInt(k), v])])
}
function coseEc2(publicKey: KeyObject, alg = -7) {
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  return cborMap([
    [1, cborInt(2)],
    [3, cborInt(alg)],
    [-1, cborInt(1)],
    [-2, cborBytes(Buffer.from(jwk.x, 'base64url'))],
    [-3, cborBytes(Buffer.from(jwk.y, 'base64url'))],
  ])
}
// -----------------------------------------------------------------------------

function buildAuthData(credId: Buffer, coseKey: Buffer, flags = 0x45, rpId = RP_ID) {
  const rpIdHash = createHash('sha256').update(rpId).digest()
  const counter = Buffer.alloc(4)
  const aaguid = Buffer.alloc(16)
  const len = Buffer.alloc(2)
  len.writeUInt16BE(credId.length)
  return Buffer.concat([rpIdHash, Buffer.from([flags]), counter, aaguid, len, credId, coseKey])
}

function newCredential() {
  const credId = randomBytes(16)
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return { credId, publicKey, pem: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

function validInput(overrides: Record<string, unknown> = {}) {
  const challenge = generateWebAuthnChallenge(USER)
  const { credId, publicKey, pem } = newCredential()
  return {
    credentialId: credId.toString('base64url'),
    publicKey: pem,
    challenge,
    clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN })).toString('base64url'),
    authenticatorData: buildAuthData(credId, coseEc2(publicKey)).toString('base64url'),
    ...overrides,
  }
}

describe('WebAuthn passkey registration verification', () => {
  beforeEach(() => {
    usedNonces.clear()
    process.env.WEBAUTHN_RP_ID = RP_ID
    process.env.WEBAUTHN_ORIGIN = ORIGIN
  })

  it('accepts a well-formed registration once and returns the key derived from the authenticator', async () => {
    const input = validInput()
    const res = await verifyPasskeyRegistration(USER, input)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.publicKeyPem.replace(/\s/g, '')).toBe(input.publicKey.replace(/\s/g, ''))
  })

  it('rejects replay of the same registration challenge', async () => {
    const input = validInput()
    expect((await verifyPasskeyRegistration(USER, input)).ok).toBe(true)
    const replay = await verifyPasskeyRegistration(USER, input)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.reason).toMatch(/already been used/)
  })

  it('rejects a challenge issued for another user', async () => {
    const input = validInput({ challenge: generateWebAuthnChallenge('someone_else') })
    expect((await verifyPasskeyRegistration(USER, input)).ok).toBe(false)
  })

  it('rejects a wrong clientData type (assertion payload reused for registration)', async () => {
    const base = validInput()
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: base.challenge, origin: ORIGIN })).toString('base64url')
    const res = await verifyPasskeyRegistration(USER, { ...base, clientDataJSON })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/webauthn.create/)
  })

  it('rejects a foreign or missing origin', async () => {
    const base = validInput()
    for (const origin of ['https://evil.example', undefined]) {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: base.challenge, origin })).toString('base64url')
      expect((await verifyPasskeyRegistration(USER, { ...base, clientDataJSON })).ok).toBe(false)
    }
  })

  it('rejects a wrong RP ID hash and missing UV/UP flags', async () => {
    const { credId, publicKey } = newCredential()
    const base = validInput({ credentialId: credId.toString('base64url'), publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() })
    const cose = coseEc2(publicKey)
    for (const authData of [buildAuthData(credId, cose, 0x45, 'evil.example'), buildAuthData(credId, cose, 0x41), buildAuthData(credId, cose, 0x44)]) {
      expect((await verifyPasskeyRegistration(USER, { ...base, authenticatorData: authData.toString('base64url') })).ok).toBe(false)
    }
  })

  it('rejects a credentialId that is not the attested one', async () => {
    const res = await verifyPasskeyRegistration(USER, validInput({ credentialId: randomBytes(16).toString('base64url') }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/credentialId/)
  })

  it('rejects a submitted public key that differs from the authenticator COSE key (key substitution)', async () => {
    const attacker = newCredential()
    const res = await verifyPasskeyRegistration(USER, validInput({ publicKey: attacker.pem }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/does not match/)
  })

  it('rejects an unsupported COSE algorithm and a malformed COSE key', async () => {
    const { credId, publicKey, pem } = newCredential()
    const base = validInput({ credentialId: credId.toString('base64url'), publicKey: pem })
    const wrongAlg = buildAuthData(credId, coseEc2(publicKey, -35)).toString('base64url')
    const garbage = buildAuthData(credId, Buffer.from([0xff, 0x00])).toString('base64url')
    expect((await verifyPasskeyRegistration(USER, { ...base, authenticatorData: wrongAlg })).ok).toBe(false)
    expect((await verifyPasskeyRegistration(USER, { ...base, authenticatorData: garbage })).ok).toBe(false)
  })

  it('rejects a public key that is not SPKI (old attestationObject fallback)', async () => {
    const res = await verifyPasskeyRegistration(USER, validInput({ publicKey: randomBytes(64).toString('base64') }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/SPKI/)
  })

  it('does not consume the challenge when verification fails early', async () => {
    const base = validInput()
    await verifyPasskeyRegistration(USER, { ...base, publicKey: 'garbage' })
    expect(await consumeWebAuthnChallenge(base.challenge)).toBe(true)
  })

  it('checkAuthenticatorData enforces length, RP ID, UP and UV', () => {
    expect(checkAuthenticatorData(Buffer.alloc(10))).toMatch(/length/)
    const { credId, publicKey } = newCredential()
    expect(checkAuthenticatorData(buildAuthData(credId, coseEc2(publicKey)))).toBeNull()
  })
})
