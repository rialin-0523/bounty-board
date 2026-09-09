import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { DOUYU_BIND_ROOM_ID, localDateKey, nowIso, supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY } from './config.mjs'
import { clearCookie, clearCookieHeader, cookieHeader, parseCookieHeader, serializeCookie, SESSION_COOKIE, isValidPassword, isValidUsername } from './auth.mjs'
import { generateBindCode } from './douyu.mjs'
import {
  completeBindSession,
  createBindSessionWithRetry,
  getBindSession,
  getUserBySessionToken,
  loginWithUsernamePassword,
  refreshExpiredBindSessions,
  revokeSessionToken,
  upsertUserDouyuProfile,
} from './store.mjs'
import {
  checkUserPermission,
  createChallengeRow,
  createFollowOrderRow,
  deleteChallengeRow,
  deleteFollowOrderRow,
  deleteUserRow,
  getBooleanParam,
  getChallengeRow,
  getSettingValue,
  getUserByDouyuUid,
  getUserRow,
  listChallengeRows,
  listFollowOrderRows,
  listMainChallengesWithHiddenRows,
  listSettingsRows,
  listUserRows,
  setSettingValue,
  updateChallengeRow,
  updateUserRow,
} from './data.mjs'

const PORT = Number(process.env.PORT || 8788)
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true'
const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE || 'Lax'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ''
const BASE_URL = process.env.BIND_SERVER_BASE_URL || `http://127.0.0.1:${PORT}`
const ALLOW_ORIGINS = (process.env.BIND_SERVER_ALLOW_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173,https://xd.miyang.cloud')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
const BIND_TTL_MS = 120_000
const ADMIN_COOKIE = 'bounty_admin_auth'
const ADMIN_SESSION_TTL_SECONDS = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 12)
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || ''
const ADMIN_CREDENTIALS = loadAdminCredentials()

function loadAdminCredentials() {
  const out = []
  if (process.env.ADMIN_CREDENTIALS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ADMIN_CREDENTIALS_JSON)
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item?.username && item?.password) out.push({ username: String(item.username), password: String(item.password) })
        })
      }
    } catch (err) {
      console.warn('[api] ADMIN_CREDENTIALS_JSON 解析失败:', err.message || err)
    }
  }
  if (process.env.ADMIN_CREDENTIALS) {
    process.env.ADMIN_CREDENTIALS.split(',').forEach(pair => {
      const index = pair.indexOf(':')
      if (index <= 0) return
      const username = pair.slice(0, index).trim()
      const password = pair.slice(index + 1)
      if (username && password) out.push({ username, password })
    })
  }
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    out.push({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
  }
  return out
}

function cookieOptions() {
  return { secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, domain: COOKIE_DOMAIN }
}

function allowedOrigin(req) {
  const origin = String(req.headers.origin || '')
  if (!origin) return ALLOW_ORIGINS[0] || '*'
  if (ALLOW_ORIGINS.includes('*') || ALLOW_ORIGINS.includes(origin)) return origin
  return ALLOW_ORIGINS[0] || origin
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req, res, status, data, headers = {}) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(req),
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

function notFound(req, res) {
  json(req, res, 404, { ok: false, reason: 'Not found' })
}

function badRequest(req, res, reason) {
  json(req, res, 400, { ok: false, reason })
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '')
  return cookies[SESSION_COOKIE] || ''
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

function requireSupabaseReady(req, res) {
  if (supabaseAdmin) return true
  json(req, res, 503, {
    ok: false,
    reason: 'SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY 未配置，绑定与登录暂不可用',
  })
  return false
}

function matchAdminCredential(username, password) {
  return ADMIN_CREDENTIALS.some(item => item.username === username && item.password === password)
}

function signAdminPayload(payload) {
  return createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('base64url')
}

function makeAdminToken(username) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000 })).toString('base64url')
  return `${payload}.${signAdminPayload(payload)}`
}

function readAdminToken(req) {
  if (!ADMIN_SESSION_SECRET) return null
  const cookies = parseCookieHeader(req.headers.cookie || '')
  const token = cookies[ADMIN_COOKIE] || ''
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = signAdminPayload(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.username || Number(data.exp || 0) < Date.now()) return null
    return { username: String(data.username) }
  } catch {
    return null
  }
}

async function requestContext(req) {
  const admin = readAdminToken(req)
  const token = getSessionTokenFromRequest(req)
  const session = token && supabaseAdmin ? await getUserBySessionToken(token) : null
  return { admin, isAdmin: Boolean(admin), user: session?.user || null }
}

function requireAdminRequest(req, res, ctx) {
  if (ctx?.isAdmin) return true
  json(req, res, 401, { ok: false, reason: '需要超级管理员登录' })
  return false
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    return res.end()
  }

  if (url.pathname === '/api/health') {
    return json(req, res, 200, {
      ok: true,
      roomId: DOUYU_BIND_ROOM_ID,
      hasSupabase: Boolean(supabaseAdmin),
      now: nowIso(),
      dateKey: localDateKey(),
      listener: 'external-worker',
      adminAuthConfigured: ADMIN_CREDENTIALS.length > 0 && Boolean(ADMIN_SESSION_SECRET),
    })
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    if (ADMIN_CREDENTIALS.length === 0 || !ADMIN_SESSION_SECRET) {
      return json(req, res, 503, { ok: false, reason: '管理员账号未配置' })
    }
    const body = await readJson(req)
    const username = String(body.username || body.account || '').trim()
    const password = String(body.password || '')
    if (!matchAdminCredential(username, password)) {
      return json(req, res, 401, { ok: false, reason: '账号或密码错误' })
    }
    res.setHeader('Set-Cookie', serializeCookie(ADMIN_COOKIE, makeAdminToken(username), {
      ...cookieOptions(),
      maxAgeSeconds: ADMIN_SESSION_TTL_SECONDS,
    }))
    return json(req, res, 200, { ok: true, admin: { username } })
  }

  if (url.pathname === '/api/admin/me' && req.method === 'GET') {
    return json(req, res, 200, { ok: true, admin: readAdminToken(req) })
  }

  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', clearCookie(ADMIN_COOKIE, cookieOptions()))
    return json(req, res, 200, { ok: true })
  }

  if (!requireSupabaseReady(req, res)) return

  if (url.pathname === '/api/bind/sessions' && req.method === 'POST') {
    const body = await readJson(req)
    const roomId = String(body.roomId || DOUYU_BIND_ROOM_ID).trim()
    const expiresAt = new Date(Date.now() + BIND_TTL_MS).toISOString()
    const bind = await createBindSessionWithRetry({ roomId, codeFactory: () => generateBindCode(6), expiresAt, codeDay: localDateKey() })
    return json(req, res, 200, { ok: true, bind, listener: 'external-worker' })
  }

  const bindMatch = url.pathname.match(/^\/api\/bind\/sessions\/([^/]+)$/)
  if (bindMatch && req.method === 'GET') {
    const bind = await getBindSession(bindMatch[1])
    return json(req, res, 200, bindSessionResponse(bind))
  }

  const bindCompleteMatch = url.pathname.match(/^\/api\/bind\/sessions\/([^/]+)\/complete$/)
  if (bindCompleteMatch && req.method === 'POST') {
    const body = await readJson(req)
    if (!isValidUsername(body.username)) return badRequest(req, res, '用户名只能包含中英文，长度 2-20 位')
    if (!isValidPassword(body.password)) return badRequest(req, res, '密码需 8-64 位，且包含字母和数字，并只使用可见字符')
    if (body.password !== body.passwordConfirm) return badRequest(req, res, '两次输入的密码不一致')
    const result = await completeBindSession(bindCompleteMatch[1], {
      username: body.username,
      password: body.password,
    })
    res.setHeader('Set-Cookie', cookieHeader(result.token, cookieOptions()))
    return json(req, res, 200, { ok: true, user: result.user, bind: result.bind })
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson(req)
    if (!String(body.username || '').trim() || !String(body.password || '')) return badRequest(req, res, '请填写用户名和密码')
    const result = await loginWithUsernamePassword({ username: body.username, password: body.password })
    res.setHeader('Set-Cookie', cookieHeader(result.token, cookieOptions()))
    return json(req, res, 200, { ok: true, user: result.user })
  }

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const token = getSessionTokenFromRequest(req)
    if (!token) return json(req, res, 200, { ok: true, user: null })
    const result = await getUserBySessionToken(token)
    return json(req, res, 200, { ok: true, user: result?.user || null })
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = getSessionTokenFromRequest(req)
    if (token) await revokeSessionToken(token)
    res.setHeader('Set-Cookie', clearCookieHeader(cookieOptions()))
    return json(req, res, 200, { ok: true })
  }

  const ctx = await requestContext(req)

  if (url.pathname === '/api/auth/permission' && req.method === 'GET') {
    return json(req, res, 200, { ok: true, permission: await checkUserPermission(ctx.user) })
  }

  const settingMatch = url.pathname.match(/^\/api\/settings\/([^/]+)$/)
  if (settingMatch && req.method === 'GET') {
    return json(req, res, 200, { ok: true, key: settingMatch[1], value: await getSettingValue(settingMatch[1], null) })
  }

  if (url.pathname === '/api/admin/settings' && req.method === 'GET') {
    if (!requireAdminRequest(req, res, ctx)) return
    return json(req, res, 200, { ok: true, settings: await listSettingsRows() })
  }

  const adminSettingMatch = url.pathname.match(/^\/api\/admin\/settings\/([^/]+)$/)
  if (adminSettingMatch && req.method === 'PUT') {
    if (!requireAdminRequest(req, res, ctx)) return
    const body = await readJson(req)
    const row = await setSettingValue(adminSettingMatch[1], body.value)
    return json(req, res, 200, { ok: true, setting: row })
  }

  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    if (!requireAdminRequest(req, res, ctx)) return
    return json(req, res, 200, { ok: true, users: await listUserRows({ search: url.searchParams.get('search') || '' }) })
  }

  const adminUserByDouyuMatch = url.pathname.match(/^\/api\/admin\/users\/by-douyu\/([^/]+)$/)
  if (adminUserByDouyuMatch && req.method === 'GET') {
    if (!requireAdminRequest(req, res, ctx)) return
    return json(req, res, 200, { ok: true, user: await getUserByDouyuUid(decodeURIComponent(adminUserByDouyuMatch[1])) })
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (adminUserMatch && req.method === 'GET') {
    if (!requireAdminRequest(req, res, ctx)) return
    return json(req, res, 200, { ok: true, user: await getUserRow(adminUserMatch[1]) })
  }

  if (adminUserMatch && req.method === 'PATCH') {
    if (!requireAdminRequest(req, res, ctx)) return
    const body = await readJson(req)
    return json(req, res, 200, { ok: true, user: await updateUserRow(adminUserMatch[1], body) })
  }

  if (adminUserMatch && req.method === 'DELETE') {
    if (!requireAdminRequest(req, res, ctx)) return
    await deleteUserRow(adminUserMatch[1])
    return json(req, res, 200, { ok: true })
  }

  if (url.pathname === '/api/admin/users/douyu-profile' && req.method === 'POST') {
    if (!requireAdminRequest(req, res, ctx)) return
    const body = await readJson(req)
    const user = await upsertUserDouyuProfile(body)
    return json(req, res, 200, { ok: true, user })
  }

  if (url.pathname === '/api/challenges/with-hidden' && req.method === 'GET') {
    const showAllHidden = getBooleanParam(url.searchParams.get('showAllHidden'))
    return json(req, res, 200, { ok: true, challenges: await listMainChallengesWithHiddenRows({ showAllHidden, ctx }) })
  }

  if (url.pathname === '/api/challenges' && req.method === 'GET') {
    const includeHidden = getBooleanParam(url.searchParams.get('includeHidden'), true)
    const showAllHidden = getBooleanParam(url.searchParams.get('showAllHidden'))
    return json(req, res, 200, { ok: true, challenges: await listChallengeRows({ includeHidden, showAllHidden, ctx }) })
  }

  if (url.pathname === '/api/challenges' && req.method === 'POST') {
    const body = await readJson(req)
    const challenge = await createChallengeRow(body, ctx)
    return json(req, res, 200, { ok: true, challenge })
  }

  const followByChallengeMatch = url.pathname.match(/^\/api\/challenges\/([^/]+)\/follow-orders$/)
  if (followByChallengeMatch && req.method === 'GET') {
    const followOrders = await listFollowOrderRows(followByChallengeMatch[1], ctx)
    return json(req, res, 200, { ok: true, followOrders })
  }

  const challengeMatch = url.pathname.match(/^\/api\/challenges\/([^/]+)$/)
  if (challengeMatch && req.method === 'GET') {
    return json(req, res, 200, { ok: true, challenge: await getChallengeRow(challengeMatch[1], ctx) })
  }

  if (challengeMatch && req.method === 'PATCH') {
    const body = await readJson(req)
    const challenge = await updateChallengeRow(challengeMatch[1], body, ctx)
    return json(req, res, 200, { ok: true, challenge })
  }

  if (challengeMatch && req.method === 'DELETE') {
    if (!requireAdminRequest(req, res, ctx)) return
    await deleteChallengeRow(challengeMatch[1])
    return json(req, res, 200, { ok: true })
  }

  if (url.pathname === '/api/follow-orders' && req.method === 'POST') {
    const body = await readJson(req)
    const followOrder = await createFollowOrderRow(body, ctx)
    return json(req, res, 200, { ok: true, followOrder })
  }

  const followOrderMatch = url.pathname.match(/^\/api\/follow-orders\/([^/]+)$/)
  if (followOrderMatch && req.method === 'DELETE') {
    if (!requireAdminRequest(req, res, ctx)) return
    await deleteFollowOrderRow(followOrderMatch[1])
    return json(req, res, 200, { ok: true })
  }

  notFound(req, res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', BASE_URL)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      console.error('[api]', err)
      json(req, res, 500, { ok: false, reason: err.message || '服务器错误' })
    })
    return
  }
  json(req, res, 404, { ok: false, reason: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`[api] listening on ${PORT}`)
  if (!supabaseAdmin) console.warn('[api] SUPABASE_SERVICE_ROLE_KEY missing')
  if (ADMIN_CREDENTIALS.length === 0) console.warn('[api] ADMIN_CREDENTIALS not configured')
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
