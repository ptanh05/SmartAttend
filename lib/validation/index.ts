export function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`)
  return value.trim()
}

export function challengeCode(value: unknown) {
  const code = requiredText(value, 'Challenge code').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Challenge code must contain 6 letters or numbers')
  return code
}

export function positiveInteger(value: unknown, field: string) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} must be a positive integer`)
  return number
}
