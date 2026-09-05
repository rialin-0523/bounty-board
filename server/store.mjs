import { hashToken, makePasswordHash, makeSessionToken, normalizeUsername, verifyPassword } from './auth.mjs'
import { localDateKey, nowIso, nowMs, supabaseAdmin } from './config.mjs'

function requireAdmin() {
  if (!supabaseAdmin) {
    throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY，无法访问用户与绑定数据')
  }
  return supabaseAdmin
}

async function firstData(result) {
  if (result?.error) throw result.error
  return result?.data || null
}

function userShape(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    douyu: {
      uid: row.douyu_uid,
      name: row.douyu_name,
      avatar: row.douyu_avatar || '',
      level: row.douyu_level ?? null,
      badgeName: row.douyu_badge_name || '',
      badgeLevel: row.douyu_badge_level ?? 0,
    },
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

function bindShape(row) {
  if (!row) return null
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN
  const expired = Number.isFinite(expiresAt) && expiresAt < Date.now() && row.status !== 'completed'
  return {
    id: row.id,
    roomId: row.room_id,
    code: row.code,
    codeDay: row.code_day,
    status: expired && (row.status === 'pending' || row.status === 'matched') ? 'expired' : row.status,
    expiresAt: row.expires_at,
    matchedAt: row.matched_at,
    matchedMessage: row.matched_message || null,
    profile: row.matched_uid
      ? {
          uid: row.matched_uid,
          name: row.matched_name || '',
          avatar: row.matched_avatar || '',
          level: row.matched_level ?? null,
          badgeName: row.matched_badge_name || '',
          badgeLevel: row.matched_badge_level ?? 0,
        }
      : null,
    completedAt: row.completed_at,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sessionShape(row, user = null) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    user: user ? userShape(user) : null,
  }
}

export async function createBindSession({ roomId, code, expiresAt, codeDay }) {
  const supabase = requireAdmin()
  const result = await supabase
    .from('bind_sessions')
    .insert({
      room_id: String(roomId || '').trim(),
      code: String(code || '').trim().toUpperCase(),
      code_normalized: String(code || '').trim().toUpperCase(),
      code_day: String(codeDay || localDateKey()),
      status: 'pending',
      expires_at: expiresAt,
      updated_at: nowIso(),
    })
    .select('*')
    .single()
  return bindShape(await firstData(result))
}

export async function createBindSessionWithRetry({ roomId, codeFactory, expiresAt, codeDay }) {
  const supabase = requireAdmin()
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = codeFactory()
    const result = await supabase
      .from('bind_sessions')
      .insert({
        room_id: String(roomId || '').trim(),
        code: code.toUpperCase(),
        code_normalized: code.toUpperCase(),
        code_day: String(codeDay || localDateKey()),
        status: 'pending',
        expires_at: expiresAt,
        updated_at: nowIso(),
      })
      .select('*')
      .single()
    if (!result.error && result.data) return bindShape(result.data)
    const msg = String(result.error?.message || '')
    if (!/duplicate|unique|conflict|already exists/i.test(msg)) throw result.error
  }
  throw new Error('生成绑定码失败，请重试')
}

export async function refreshExpiredBindSessions() {
  const supabase = requireAdmin()
  const { error } = await supabase
    .from('bind_sessions')
    .update({ status: 'expired', updated_at: nowIso() })
    .eq('status', 'pending')
    .lt('expires_at', nowIso())
  if (error) throw error
}

export async function listActiveBindSessions(roomId) {
  const supabase = requireAdmin()
  let query = supabase
    .from('bind_sessions')
    .select('*')
    .in('status', ['pending', 'matched'])
    .gt('expires_at', nowIso())
    .order('created_at', { ascending: true })
  if (roomId) query = query.eq('room_id', String(roomId).trim())
  const result = await query
  const data = await firstData(result)
  return (data || []).map(bindShape)
}

export async function getBindSession(id) {
  const supabase = requireAdmin()
  const result = await supabase.from('bind_sessions').select('*').eq('id', id).single()
  return bindShape(await firstData(result))
}

export async function markBindSessionMatched(id, profile, message) {
  const supabase = requireAdmin()
  const result = await supabase
    .from('bind_sessions')
    .update({
      status: 'matched',
      matched_at: nowIso(),
      matched_uid: String(profile?.uid || '').trim(),
      matched_name: String(profile?.name || '').trim(),
      matched_avatar: String(profile?.avatar || '').trim(),
      matched_level: profile?.level ?? null,
      matched_badge_name: String(profile?.badgeName || '').trim(),
      matched_badge_level: profile?.badgeLevel ?? 0,
      matched_message: message || null,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .single()
  return bindShape(await firstData(result))
}

export async function completeBindSession(id, { username, password }) {
  const supabase = requireAdmin()
  const bind = await getBindSession(id)
  if (!bind) throw new Error('绑定会话不存在')
  if (bind.status !== 'matched') throw new Error('识别码还没有匹配成功')
  if (new Date(bind.expiresAt).getTime() < Date.now()) throw new Error('识别码已过期，请重新生成绑定码')
  if (bind.userId) throw new Error('这个绑定会话已经完成')

  const userResult = await supabase.from('bind_sessions').select('*').eq('id', id).maybeSingle()
  const bindRow = userResult.data
  if (userResult.error || !bindRow) throw userResult.error || new Error('绑定会话不存在')

  const douyuUid = String(bindRow.matched_uid || '').trim()
  const douyuName = String(bindRow.matched_name || '').trim()
  if (!douyuUid) throw new Error('没有识别到斗鱼 UID，请重新生成识别码后再发弹幕')
  if (!douyuName) throw new Error('没有识别到斗鱼昵称，请重新生成识别码后再发弹幕')

  const saltHash = makePasswordHash(password)
  const usernameNormalized = normalizeUsername(username)
  const insertResult = await supabase
    .from('app_users')
    .insert({
      username: String(username || '').trim(),
      username_normalized: usernameNormalized,
      password_salt: saltHash.salt,
      password_hash: saltHash.hash,
      douyu_uid: douyuUid,
      douyu_name: douyuName,
      douyu_avatar: String(bindRow.matched_avatar || '').trim(),
      douyu_level: bindRow.matched_level ?? null,
      douyu_badge_name: String(bindRow.matched_badge_name || '').trim(),
      douyu_badge_level: bindRow.matched_badge_level ?? 0,
      bind_session_id: bindRow.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select('*')
    .single()
  if (insertResult.error) {
    if (insertResult.error.code === '23505' && /username/i.test(insertResult.error.message || '')) throw new Error('这个用户名已经被使用')
    if (insertResult.error.code === '23505' && /douyu_uid/i.test(insertResult.error.message || '')) throw new Error('这个斗鱼账号已经绑定过')
    throw insertResult.error
  }

  const sessionToken = makeSessionToken()
  const sessionResult = await supabase
    .from('auth_sessions')
    .insert({
      user_id: insertResult.data.id,
      session_token_hash: hashToken(sessionToken),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      created_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .select('*')
    .single()
  if (sessionResult.error) throw sessionResult.error

  await supabase.from('app_users').update({ last_login_at: nowIso(), updated_at: nowIso() }).eq('id', insertResult.data.id)
  const completeResult = await supabase
    .from('bind_sessions')
    .update({ status: 'completed', completed_at: nowIso(), user_id: insertResult.data.id, updated_at: nowIso() })
    .eq('id', bindRow.id)
    .select('*')
    .single()
  if (completeResult.error) throw completeResult.error

  return {
    user: userShape(insertResult.data),
    session: sessionShape(sessionResult.data, insertResult.data),
    token: sessionToken,
    bind: bindShape(completeResult.data),
  }
}

export async function loginWithUsernamePassword({ username, password }) {
  const supabase = requireAdmin()
  const usernameNormalized = normalizeUsername(username)
  const result = await supabase
    .from('app_users')
    .select('*')
    .eq('username_normalized', usernameNormalized)
    .single()
  if (result.error || !result.data) throw new Error('用户名或密码错误')
  if (!verifyPassword(password, result.data.password_salt, result.data.password_hash)) {
    throw new Error('用户名或密码错误')
  }
  const sessionToken = makeSessionToken()
  const sessionResult = await supabase
    .from('auth_sessions')
    .insert({
      user_id: result.data.id,
      session_token_hash: hashToken(sessionToken),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(),
      created_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .select('*')
    .single()
  if (sessionResult.error) throw sessionResult.error
  await supabase.from('app_users').update({ last_login_at: nowIso(), updated_at: nowIso() }).eq('id', result.data.id)
  return { user: userShape(result.data), session: sessionShape(sessionResult.data, result.data), token: sessionToken }
}

export async function getUserBySessionToken(token) {
  const supabase = requireAdmin()
  const tokenHash = hashToken(token)
  const sessionResult = await supabase
    .from('auth_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', nowIso())
    .maybeSingle()
  if (sessionResult.error || !sessionResult.data) return null
  const row = sessionResult.data
  const userResult = await supabase.from('app_users').select('*').eq('id', row.user_id).maybeSingle()
  if (userResult.error || !userResult.data) return null
  await supabase
    .from('auth_sessions')
    .update({ last_seen_at: nowIso() })
    .eq('id', row.id)
  return {
    user: userShape(userResult.data),
    session: sessionShape(row, userResult.data),
  }
}

export async function revokeSessionToken(token) {
  const supabase = requireAdmin()
  const tokenHash = hashToken(token)
  await supabase.from('auth_sessions').update({ revoked_at: nowIso() }).eq('session_token_hash', tokenHash)
}

export async function upsertDouyuProfile(profile) {
  const supabase = requireAdmin()
  const roomId = String(profile?.roomId || '').trim()
  const uid = String(profile?.uid || '').trim()
  const name = String(profile?.name || '').trim()
  if (!roomId || (!uid && !name)) return null
  const profileKey = uid ? `uid:${uid}` : `name:${name.toLowerCase()}`
  const existingResult = await supabase
    .from('douyu_profiles')
    .select('*')
    .eq('room_id', roomId)
    .eq('profile_key', profileKey)
    .maybeSingle()
  const existing = existingResult.data || null
  const now = nowMs()
  const payload = {
    room_id: roomId,
    profile_key: profileKey,
    uid: uid || existing?.uid || '',
    name: name || existing?.name || '',
    level: profile?.level ?? existing?.level ?? null,
    avatar: profile?.avatar || existing?.avatar || '',
    badge_name: profile?.badgeName || existing?.badge_name || '',
    badge_level: profile?.badgeLevel ?? existing?.badge_level ?? 0,
    first_seen_at: existing?.first_seen_at || now,
    previous_last_seen_at: existing?.last_seen_at || 0,
    last_seen_at: now,
    message_count: (existing?.message_count || 0) + 1,
    updated_at: now,
  }
  const result = await supabase
    .from('douyu_profiles')
    .upsert(payload, { onConflict: 'room_id,profile_key' })
    .select('*')
    .single()
  if (result.error) throw result.error
  return result.data
}

export async function findDouyuProfile(roomId, uid = '', name = '') {
  const supabase = requireAdmin()
  const room = String(roomId || '').trim()
  const uidText = String(uid || '').trim()
  const nameText = String(name || '').trim().toLowerCase()
  if (!room || (!uidText && !nameText)) return null
  let query = supabase.from('douyu_profiles').select('*').eq('room_id', room)
  if (uidText) {
    query = query.eq('uid', uidText)
  } else {
    query = query.ilike('name', nameText)
  }
  const result = await query.order('last_seen_at', { ascending: false }).limit(1)
  const data = result.data || []
  return data[0] || null
}
