import { createPublicKey, type KeyObject } from 'crypto'

/**
 * Minimal, strict CBOR decoder — just enough for a WebAuthn COSE_Key
 * (RFC 9052 §7) embedded in authenticator data: maps, integers, byte strings,
 * text strings, arrays, and the simple values false/true/null.
 * Indefinite lengths, tags and floats are rejected (they never appear in a
 * COSE_Key produced by an authenticator).
 */
type CborValue = number | bigint | Buffer | string | boolean | null | CborValue[] | Map<CborValue, CborValue>

const MAX_DEPTH = 8

function readLength(buf: Buffer, offset: number, info: number): [number, number] {
  if (info < 24) return [info, offset]
  if (info === 24) return [buf.readUInt8(offset), offset + 1]
  if (info === 25) return [buf.readUInt16BE(offset), offset + 2]
  if (info === 26) return [buf.readUInt32BE(offset), offset + 4]
  throw new Error('Unsupported CBOR length encoding.')
}

export function decodeCborItem(buf: Buffer, offset = 0, depth = 0): [CborValue, number] {
  if (depth > MAX_DEPTH) throw new Error('CBOR nesting too deep.')
  if (offset >= buf.length) throw new Error('Truncated CBOR data.')
  const initial = buf[offset]
  const major = initial >> 5
  const info = initial & 0x1f
  let pos = offset + 1

  switch (major) {
    case 0: {
      const [value, next] = readLength(buf, pos, info)
      return [value, next]
    }
    case 1: {
      const [value, next] = readLength(buf, pos, info)
      return [-1 - value, next]
    }
    case 2:
    case 3: {
      const [len, next] = readLength(buf, pos, info)
      if (next + len > buf.length) throw new Error('Truncated CBOR string.')
      const bytes = buf.subarray(next, next + len)
      return [major === 2 ? Buffer.from(bytes) : bytes.toString('utf8'), next + len]
    }
    case 4: {
      const [count, next] = readLength(buf, pos, info)
      pos = next
      const items: CborValue[] = []
      for (let i = 0; i < count; i++) {
        const [item, after] = decodeCborItem(buf, pos, depth + 1)
        items.push(item)
        pos = after
      }
      return [items, pos]
    }
    case 5: {
      const [count, next] = readLength(buf, pos, info)
      pos = next
      const map = new Map<CborValue, CborValue>()
      for (let i = 0; i < count; i++) {
        const [key, afterKey] = decodeCborItem(buf, pos, depth + 1)
        const [value, afterValue] = decodeCborItem(buf, afterKey, depth + 1)
        if (map.has(key)) throw new Error('Duplicate CBOR map key.')
        map.set(key, value)
        pos = afterValue
      }
      return [map, pos]
    }
    case 7: {
      if (info === 20) return [false, pos]
      if (info === 21) return [true, pos]
      if (info === 22) return [null, pos]
      throw new Error('Unsupported CBOR simple value.')
    }
    default:
      throw new Error('Unsupported CBOR major type.')
  }
}

// COSE constants (RFC 9053)
const COSE_KTY = 1
const COSE_ALG = 3
const KTY_EC2 = 2
const KTY_RSA = 3
const EC2_CRV = -1
const EC2_X = -2
const EC2_Y = -3
const RSA_N = -1
const RSA_E = -2
const CRV_P256 = 1
export const COSE_ALG_ES256 = -7
export const COSE_ALG_RS256 = -257

export type ParsedCoseKey = { key: KeyObject; alg: number; byteLength: number }

/**
 * Parses the COSE_Key at the start of `buf` and returns a Node KeyObject.
 * Only the algorithms requested by the client (`pubKeyCredParams`:
 * ES256 / P-256 and RS256) are accepted.
 */
export function parseCoseKey(buf: Buffer): ParsedCoseKey {
  const [value, end] = decodeCborItem(buf, 0)
  if (!(value instanceof Map)) throw new Error('COSE key is not a CBOR map.')
  const kty = value.get(COSE_KTY)
  const alg = value.get(COSE_ALG)

  if (kty === KTY_EC2) {
    if (alg !== COSE_ALG_ES256) throw new Error('Unsupported EC2 algorithm (only ES256).')
    const crv = value.get(EC2_CRV)
    const x = value.get(EC2_X)
    const y = value.get(EC2_Y)
    if (crv !== CRV_P256 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
      throw new Error('Invalid P-256 COSE key.')
    }
    const key = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') },
      format: 'jwk',
    })
    return { key, alg, byteLength: end }
  }

  if (kty === KTY_RSA) {
    if (alg !== COSE_ALG_RS256) throw new Error('Unsupported RSA algorithm (only RS256).')
    const n = value.get(RSA_N)
    const e = value.get(RSA_E)
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) {
      throw new Error('Invalid RSA COSE key (modulus must be at least 2048 bits).')
    }
    const key = createPublicKey({
      key: { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') },
      format: 'jwk',
    })
    return { key, alg, byteLength: end }
  }

  throw new Error('Unsupported COSE key type.')
}

/** True when two public keys are mathematically the same key. */
export function samePublicKey(a: KeyObject, b: KeyObject): boolean {
  return a.export({ format: 'der', type: 'spki' }).equals(b.export({ format: 'der', type: 'spki' }))
}
