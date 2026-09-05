import { createClient } from '@supabase/supabase-js'

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Shanghai'
export const DOUYU_BIND_ROOM_ID = String(process.env.DOUYU_BIND_ROOM_ID || '63136').trim()
export const DOUYU_DANMAKU_HOSTS = (process.env.DOUYU_DANMAKU_HOSTS || 'danmuproxy.douyu.com,openbarrage.douyutv.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tbtvgdeljiiwzixwiwue.supabase.co'
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[bind-server] Missing SUPABASE_SERVICE_ROLE_KEY; backend will not be able to write data.')
}

export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null

export function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function nowIso() {
  return new Date().toISOString()
}

export function nowMs() {
  return Date.now()
}
