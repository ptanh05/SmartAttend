import { describe, expect, it } from 'vitest'
import { challengeCode, positiveInteger, requiredText } from './index'

describe('requiredText', () => {
  it('returns the trimmed value', () => {
    expect(requiredText('  hello  ', 'Name')).toBe('hello')
  })

  it('throws for empty, whitespace-only, or non-string values', () => {
    expect(() => requiredText('', 'Name')).toThrow(/required/)
    expect(() => requiredText('   ', 'Name')).toThrow(/required/)
    expect(() => requiredText(null, 'Name')).toThrow(/required/)
    expect(() => requiredText(42, 'Name')).toThrow(/required/)
  })
})

describe('challengeCode', () => {
  it('normalizes to uppercase and accepts 6 alphanumeric characters', () => {
    expect(challengeCode('abc123')).toBe('ABC123')
  })

  it('rejects wrong lengths and invalid characters', () => {
    expect(() => challengeCode('abc12')).toThrow(/6 letters or numbers/)
    expect(() => challengeCode('abc1234')).toThrow(/6 letters or numbers/)
    expect(() => challengeCode('abc-12')).toThrow(/6 letters or numbers/)
    expect(() => challengeCode('')).toThrow(/required/)
  })
})

describe('positiveInteger', () => {
  it('accepts positive integers', () => {
    expect(positiveInteger('5', 'Count')).toBe(5)
    expect(positiveInteger(42, 'Count')).toBe(42)
  })

  it('rejects zero, negatives, floats, and NaN', () => {
    expect(() => positiveInteger(0, 'Count')).toThrow(/positive integer/)
    expect(() => positiveInteger(-1, 'Count')).toThrow(/positive integer/)
    expect(() => positiveInteger(2.5, 'Count')).toThrow(/positive integer/)
    expect(() => positiveInteger('abc', 'Count')).toThrow(/positive integer/)
  })
})
