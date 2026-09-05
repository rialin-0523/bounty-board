import http from 'node:http'
import { DOUYU_BIND_ROOM_ID, localDateKey, nowIso, supabaseAdmin } from './config.mjs'
import { clearCookieHeader, cookieHeader, parseCookieHeader, SESSION_COOKIE, isValidPassword, isValidUsername } from './auth.mjs'
import { DouyuDanmakuClient, generateBindCode, normalizeBindCodeText } from './douyu.mjs'
import {
  completeBindSession,
  createBindSessionWithRetry,
  findDouyuProfile,
  getBindSession,
  getUserBySessionToken,
  listActiveBindSessions,
  loginWithUsernamePassword,
  markBindSessionMatched,
  refreshExpiredBindSessions,
  revokeSessionToken,
  upsertDouyuProfile,
} from './store.mjs'

const PORT = Number(process.env.PORT || 8788)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true'
const BASE_URL = process.env.BIND_SERVER_BASE_URL || `http://127.0.0.1:${PORT}`
const ALLOW_ORIGIN = process.env.BIND_SERVER_ALLOW_ORIGIN || 'http://127.0.0.1:5173'
const BIND_TTL_MS = 120_000
const LISTENER_IDLE_STOP_MS = Number(process.env.DOUYU_BIND_IDLE_STOP_MS || 30_000)
const CACHE_REFRESH_MS = 2_000

let bindClient = null
let bindCache = []
let refreshTimer = null
let idleStopTimer = null

function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...headers,
  })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

function notFound(res) {
  json(res, 404, { ok: false, reason: 'Not found' })
}

function badRequest(res, reason) {
  json(res, 400, { ok: false, reason })
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '')
  return cookies[SESSION_COOKIE] || ''
}

function listenerStatus() {
  return bindClient ? 'active' : 'idle'
}

function bindSessionResponse(bind) {
  return {
    ok: true,
    bind: bind
      ? {
          id: bind.id,
          roomId: bind.roomId,
          code: bind.code,
          status: bind.status,
          expiresAt: bind.expiresAt,
          matchedAt: bind.matchedAt,
          completedAt: bind.completedAt,
          profile: bind.profile,
          userId: bind.userId,
          createdAt: bind.createdAt,
          updatedAt: bind.updatedAt,
        }
      : null,
  }
}

async function refreshBindCache() {
  try {
    await refreshExpiredBindSessions().catch(() => {})
    bindCache = await listActiveBindSessions(DOUYU_BIND_ROOM_ID)
    scheduleIdleStopIfNeeded()
  } catch (err) {
    console.error('[bind-server] refresh bind cache failed:', err)
  }
}

function startRefreshTimer() {
  if (!refreshTimer) refreshTimer = setInterval(refreshBindCache, CACHE_REFRESH_MS)
}

function stopRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
}

function clearIdleStopTimer() {
  if (idleStopTimer) clearTimeout(idleStopTimer)
  idleStopTimer = null
}

function stopListener(reason = 'idle') {
  clearIdleStopTimer()
  stopRefreshTimer()
  if (bindClient) {
    console.log(`[douyu] 停止监听：${reason}`)
    bindClient.stop()
    bindClient.removeAllListeners()
    bindClient = null
  }
}

function scheduleIdleStopIfNeeded() {
  if (!bindClient) return
  const hasActiveBind = bindCache.some(item => item.status === 'pending' || item.status === 'matched')
  if (hasActiveBind) {
    clearIdleStopTimer()
    return
  }
  if (idleStopTimer) return
  idleStopTimer = setTimeout(() => {
    if (!bindCache.some(item => item.status === 'pending' || item.status === 'matched')) {
      stopListener('当前没有有效绑定码')
    }
  }, LISTENER_IDLE_STOP_MS)
}

async function handleDouyuChat(payload) {
  try {
    await upsertDouyuProfile(payload)
  } catch (err) {
    console.warn('[bind-server] profile upsert failed:', err.message || err)
  }

  const rawCodeText = String(payload.text || '').trim()
  if (!/^[A-Z0-9]{6}$/i.test(rawCodeText)) return
  const code = normalizeBindCodeText(rawCodeText)
  const matched = bindCache.find(item => item.status === 'pending' && normalizeBindCodeText(item.code) === code)
  if (!matched) return
  const expiresAt = new Date(matched.expiresAt).getTime()
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return

  const profile = await findDouyuProfile(DOUYU_BIND_ROOM_ID, payload.uid, payload.name)
  const nextProfile = profile
    ? {
        uid: String(profile.uid || payload.uid || ''),
        name: String(profile.name || payload.name || ''),
        avatar: String(profile.avatar || payload.avatar || ''),
        level: profile.level ?? payload.level ?? null,
        badgeName: String(profile.badge_name || payload.badgeName || ''),
        badgeLevel: profile.badge_level ?? payload.badgeLevel ?? 0,
      }
    : {
        uid: String(payload.uid || ''),
        name: String(payload.name || ''),
        avatar: String(payload.avatar || ''),
        level: payload.level ?? null,
        badgeName: String(payload.badgeName || ''),
        badgeLevel: payload.badgeLevel ?? 0,
      }

  const updated = await markBindSessionMatched(matched.id, nextProfile, payload.raw)
  if (updated) {
    console.log(`[bind-server] matched code ${matched.code} from ${nextProfile.name || nextProfile.uid || 'unknown'}`)
    await refreshBindCache()
  }
}

async function ensureListenerActive() {
  if (!supabaseAdmin) return false
  clearIdleStopTimer()
  await refreshBindCache()
  if (!bindCache.some(item => item.status === 'pending' || item.status === 'matched')) return false
  if (bindClient) return true

  bindClient = new DouyuDanmakuClient({ roomId: DOUYU_BIND_ROOM_ID })
  bindClient.on('status', text => console.log('[douyu]', text))
  bindClient.on('error', err => console.warn('[douyu]', err.message || err))
  bindClient.on('chat', payload => {
    handleDouyuChat(payload).catch(err => console.error('[bind-server] chat handling failed:', err))
  })
  bindClient.start()
  startRefreshTimer()
  return true
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    })
    return res.end()
  }

  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      roomId: DOUYU_BIND_ROOM_ID,
      hasSupabase: Boolean(supabaseAdmin),
      now: nowIso(),
      dateKey: localDateKey(),
      listener: listenerStatus(),
      activeBindCount: bindCache.length,
    })
  }

  if (url.pathname === '/api/bind/sessions' && req.method === 'POST') {
    const body = await readJson(req)
    const roomId = String(body.roomId || DOUYU_BIND_ROOM_ID).trim()
    const expiresAt = new Date(Date.now() + BIND_TTL_MS).toISOString()
    const bind = await createBindSessionWithRetry({ roomId, codeFactory: () => generateBindCode(6), expiresAt, codeDay: localDateKey() })
    await ensureListenerActive()
    return json(res, 200, { ok: true, bind, listener: listenerStatus() })
  }

  const bindMatch = url.pathname.match(/^\/api\/bind\/sessions\/([^/]+)$/)
  if (bindMatch && req.method === 'GET') {
    const bind = await getBindSession(bindMatch[1])
    if (bind?.status === 'pending' || bind?.status === 'matched') await ensureListenerActive()
    return json(res, 200, bindSessionResponse(bind))
  }

  const bindCompleteMatch = url.pathname.match(/^\/api\/bind\/sessions\/([^/]+)\/complete$/)
  if (bindCompleteMatch && req.method === 'POST') {
    const body = await readJson(req)
    if (!isValidUsername(body.username)) return badRequest(res, '用户名只能包含中英文，长度 2-20 位')
    if (!isValidPassword(body.password)) return badRequest(res, '密码需 8-64 位，且包含字母和数字，并只使用可见字符')
    if (body.password !== body.passwordConfirm) return badRequest(res, '两次输入的密码不一致')
    const result = await completeBindSession(bindCompleteMatch[1], {
      username: body.username,
      password: body.password,
    })
    res.setHeader('Set-Cookie', cookieHeader(result.token, { secure: COOKIE_SECURE }))
    await refreshBindCache()
    return json(res, 200, { ok: true, user: result.user, bind: result.bind })
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson(req)
    if (!String(body.username || '').trim() || !String(body.password || '')) return badRequest(res, '请填写用户名和密码')
    const result = await loginWithUsernamePassword({ username: body.username, password: body.password })
    res.setHeader('Set-Cookie', cookieHeader(result.token, { secure: COOKIE_SECURE }))
    return json(res, 200, { ok: true, user: result.user })
  }

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const token = getSessionTokenFromRequest(req)
    if (!token) return json(res, 200, { ok: true, user: null })
    const result = await getUserBySessionToken(token)
    return json(res, 200, { ok: true, user: result?.user || null })
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = getSessionTokenFromRequest(req)
    if (token) await revokeSessionToken(token)
    res.setHeader('Set-Cookie', clearCookieHeader({ secure: COOKIE_SECURE }))
    return json(res, 200, { ok: true })
  }

  notFound(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', BASE_URL)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      console.error('[bind-server]', err)
      json(res, 500, { ok: false, reason: err.message || '服务器错误' })
    })
    return
  }
  json(res, 404, { ok: false, reason: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`[bind-server] listening on ${PORT}`)
  if (supabaseAdmin) {
    refreshBindCache().then(ensureListenerActive).catch(err => console.warn('[bind-server] startup refresh failed:', err.message || err))
  } else {
    console.warn('[bind-server] listener disabled because SUPABASE_SERVICE_ROLE_KEY is missing')
  }
})

process.on('SIGINT', () => {
  stopListener('server exit')
  server.close(() => process.exit(0))
})
