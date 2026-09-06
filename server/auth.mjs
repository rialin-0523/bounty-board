import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'bounty_auth'
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90

export function hashToken(token) {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex')
}

export function makeSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function makePasswordHash(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, hash) {
  const actual = scryptSync(String(password), String(salt), 64)
  const expected = Buffer.from(String(hash), 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidUsername(value) {
  return /^[A-Za-z\u4E00-\u9FFF]{2,20}$/.test(String(value || '').trim())
}

export function isValidPassword(value) {
  const text = String(value || '')
  return text.length >= 8 && text.length <= 64 && /^[\x21-\x7E]+$/.test(text) && /[A-Za-z]/.test(text) && /\d/.test(text)
}

export function cookieHeader(token, { maxAgeSeconds = COOKIE_MAX_AGE_SECONDS, secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearCookieHeader({ secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function parseCookieHeader(headerValue = '') {
  return String(headerValue || '')
    .split(/;\s*/)
    .filter(Boolean)
    .reduce((acc, pair) => {
      const index = pair.indexOf('=')
      if (index < 0) return acc
      const key = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      acc[key] = decodeURIComponent(value)
      return acc
    }, {})
}
