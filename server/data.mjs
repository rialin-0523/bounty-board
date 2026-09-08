import { nowIso, supabaseAdmin } from './config.mjs'

const GIFT_TYPES = new Set(['飞机', '火箭', '币'])
const CHALLENGE_STATUSES = new Set(['active', 'completed', 'cancelled'])

function db() {
  if (!supabaseAdmin) throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY，无法访问数据库')
  return supabaseAdmin
}

function normalizeUserRow(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username || '',
    username_normalized: row.username_normalized || '',
    douyu_id: row.douyu_uid || row.douyu_id || '',
    douyu_uid: row.douyu_uid || row.douyu_id || '',
    douyu_nickname: row.douyu_nickname || row.douyu_name || '',
    douyu_name: row.douyu_name || row.douyu_nickname || '',
    douyu_avatar: row.douyu_avatar || '',
    douyu_level: row.douyu_level ?? 0,
    douyu_badge_name: row.douyu_badge_name || '',
    douyu_badge_level: row.douyu_badge_level ?? 0,
    is_blacklisted: Boolean(row.is_blacklisted),
    bind_session_id: row.bind_session_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_login_at: row.last_login_at || null,
  }
}

function userBossLabel(user) {
  return String(user?.username || user?.douyu_nickname || user?.douyu_name || user?.douyu_uid || user?.douyu_id || '').trim()
}

function boolParam(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

async function first(result) {
  if (result.error) throw result.error
  return result.data || null
}

async function many(result) {
  if (result.error) throw result.error
  return result.data || []
}

function sortChallenges(rows) {
  return [...rows].sort((a, b) => {
    const order = { active: 0, completed: 1, cancelled: 2 }
    const oa = order[a.status] ?? 9
    const ob = order[b.status] ?? 9
    if (oa !== ob) return oa - ob
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

function canSeeChallenge(row, parent, ctx = {}) {
  if (!row) return false
  if (ctx.isAdmin) return true
  if (!row.parent_challenge_id) return true
  const userId = ctx.user?.id
  if (!userId) return false
  if (row.created_by === userId) return true
  return parent?.created_by === userId
}

async function loadChallenge(id) {
  return first(await db().from('challenges').select('*').eq('id', id).maybeSingle())
}

async function loadParent(row) {
  if (!row?.parent_challenge_id) return null
  return loadChallenge(row.parent_challenge_id)
}

async function ensureCanSeeChallenge(id, ctx = {}) {
  const row = await loadChallenge(id)
  const parent = await loadParent(row)
  if (!canSeeChallenge(row, parent, ctx)) throw new Error('任务不存在或无权查看')
  return row
}

export function getBooleanParam(value, defaultValue = false) {
  return boolParam(value, defaultValue)
}

export async function getSettingValue(key, defaultValue = null) {
  const row = await first(await db().from('settings').select('*').eq('key', key).maybeSingle())
  return row?.value ?? defaultValue
}

export async function setSettingValue(key, value) {
  const result = await db()
    .from('settings')
    .upsert({ key: String(key), value: String(value), updated_at: nowIso() })
    .select('*')
    .single()
  return first(result)
}

export async function listSettingsRows() {
  return many(await db().from('settings').select('*').order('key', { ascending: true }))
}

export async function checkUserPermission(user) {
  if (!user?.id) return { allowed: false, reason: 'not_logged_in', message: '请先登录' }
  if (user.is_blacklisted) return { allowed: false, reason: 'blacklisted', message: '你的账号已被拉黑，无法操作' }
  const minLevel = Number(await getSettingValue('min_douyu_level', 0)) || 0
  if ((Number(user.douyu_level) || 0) < minLevel) {
    return {
      allowed: false,
      reason: 'level_too_low',
      message: `斗鱼等级不足（${minLevel}级），暂时无法发布任务～`,
      requiredLevel: minLevel,
    }
  }
  return { allowed: true }
}

export async function listUserRows({ search = '' } = {}) {
  let query = db().from('users').select('*').order('created_at', { ascending: false })
  const q = String(search || '').trim()
  if (q) query = query.or(`douyu_uid.ilike.%${q}%,douyu_nickname.ilike.%${q}%,username.ilike.%${q}%`)
  return (await many(query)).map(normalizeUserRow)
}

export async function getUserRow(id) {
  return normalizeUserRow(await first(await db().from('users').select('*').eq('id', id).maybeSingle()))
}

export async function getUserByDouyuUid(douyuUid) {
  return normalizeUserRow(await first(await db().from('users').select('*').eq('douyu_uid', douyuUid).maybeSingle()))
}

export async function updateUserRow(id, payload = {}) {
  const allowed = {}
  if ('is_blacklisted' in payload) allowed.is_blacklisted = Boolean(payload.is_blacklisted)
  if (Object.keys(allowed).length === 0) throw new Error('没有可更新的用户字段')
  allowed.updated_at = nowIso()
  const row = await first(await db().from('users').update(allowed).eq('id', id).select('*').maybeSingle())
  if (!row) throw new Error('用户不存在')
  return normalizeUserRow(row)
}

export async function deleteUserRow(id) {
  const { error } = await db().from('users').delete().eq('id', id)
  if (error) throw error
}

export async function listChallengeRows({ includeHidden = true, showAllHidden = false, ctx = {} } = {}) {
  const rows = await many(await db().from('challenges').select('*').order('created_at', { ascending: false }))
  const parents = new Map(rows.filter(row => !row.parent_challenge_id).map(row => [row.id, row]))
  const allowAllHidden = showAllHidden && ctx.isAdmin
  return rows.filter(row => {
    if (!includeHidden && row.parent_challenge_id) return false
    if (allowAllHidden) return true
    return canSeeChallenge(row, parents.get(row.parent_challenge_id), ctx)
  })
}

export async function listMainChallengesWithHiddenRows({ showAllHidden = false, ctx = {} } = {}) {
  const rows = await many(await db().from('challenges').select('*').order('created_at', { ascending: false }))
  const mains = rows.filter(row => !row.parent_challenge_id)
  const hiddens = rows.filter(row => row.parent_challenge_id)
  const allowAllHidden = showAllHidden && ctx.isAdmin
  const visibleHiddens = allowAllHidden
    ? hiddens
    : hiddens.filter(row => canSeeChallenge(row, mains.find(main => main.id === row.parent_challenge_id), ctx))

  return sortChallenges(mains).map(main => {
    const children = visibleHiddens.filter(row => row.parent_challenge_id === main.id)
    const allChildren = hiddens.filter(row => row.parent_challenge_id === main.id)
    const canSeeTotal = ctx.isAdmin || (ctx.user?.id && main.created_by === ctx.user.id)
    return {
      ...main,
      hidden_challenges: children,
      hidden_total_count: canSeeTotal ? allChildren.length : children.length,
    }
  })
}

export async function getChallengeRow(id, ctx = {}) {
  return ensureCanSeeChallenge(id, ctx)
}

function validateGift(value) {
  const gift = String(value || '').trim()
  if (!GIFT_TYPES.has(gift)) throw new Error('礼物类型不正确')
  return gift
}

function validateStatus(value) {
  const status = String(value || 'active').trim()
  if (!CHALLENGE_STATUSES.has(status)) throw new Error('任务状态不正确')
  return status
}

function positiveInt(value, label = '数量') {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}必须为正整数`)
  return n
}

async function requireWritableUser(ctx) {
  if (ctx.isAdmin) return null
  const permission = await checkUserPermission(ctx.user)
  if (!permission.allowed) throw new Error(permission.message)
  return ctx.user
}

export async function createChallengeRow(payload = {}, ctx = {}) {
  const user = await requireWritableUser(ctx)
  const bossId = ctx.isAdmin ? String(payload.boss_id || '').trim() : userBossLabel(user)
  const title = String(payload.title || '').trim()
  if (!title) throw new Error('请填写挑战标题')
  const isHidden = Boolean(payload.is_hidden)
  const parentId = isHidden ? String(payload.parent_challenge_id || '').trim() : null
  if (isHidden) {
    if (!parentId) throw new Error('隐藏任务必须关联主任务')
    const parent = await ensureCanSeeChallenge(parentId, ctx)
    if (parent.parent_challenge_id) throw new Error('隐藏任务只能关联主任务')
  }
  const row = {
    boss_id: bossId,
    title,
    description: payload.description ? String(payload.description).trim() : null,
    condition_desc: payload.condition_desc ? String(payload.condition_desc).trim() : null,
    gift_type: validateGift(payload.gift_type),
    gift_quantity: positiveInt(payload.gift_quantity, '礼物数量'),
    is_hidden: isHidden,
    parent_challenge_id: parentId,
    created_by: ctx.isAdmin ? (payload.created_by || null) : user.id,
    status: validateStatus(payload.status || 'active'),
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  if (!row.boss_id) throw new Error('请填写老板ID')
  return first(await db().from('challenges').insert(row).select('*').single())
}

export async function updateChallengeRow(id, payload = {}, ctx = {}) {
  const existing = await loadChallenge(id)
  if (!existing) throw new Error('任务不存在')
  if (!ctx.isAdmin) {
    await requireWritableUser(ctx)
    if (existing.created_by !== ctx.user?.id) throw new Error('只有创建者可以修改这个任务')
  }

  const row = { updated_at: nowIso() }
  if (ctx.isAdmin) {
    if ('boss_id' in payload) row.boss_id = String(payload.boss_id || '').trim()
    if ('title' in payload) row.title = String(payload.title || '').trim()
    if ('description' in payload) row.description = payload.description ? String(payload.description).trim() : null
    if ('condition_desc' in payload) row.condition_desc = payload.condition_desc ? String(payload.condition_desc).trim() : null
    if ('gift_type' in payload) row.gift_type = validateGift(payload.gift_type)
    if ('gift_quantity' in payload) row.gift_quantity = positiveInt(payload.gift_quantity, '礼物数量')
    if ('status' in payload) row.status = validateStatus(payload.status)
    if ('created_by' in payload) row.created_by = payload.created_by || null
    if ('is_hidden' in payload) row.is_hidden = Boolean(payload.is_hidden)
    if ('parent_challenge_id' in payload) row.parent_challenge_id = payload.parent_challenge_id || null
  } else {
    if ('status' in payload) row.status = validateStatus(payload.status)
  }

  const updated = await first(await db().from('challenges').update(row).eq('id', id).select('*').single())
  return updated
}

export async function deleteChallengeRow(id) {
  const { error } = await db().from('challenges').delete().eq('id', id)
  if (error) throw error
}

export async function listFollowOrderRows(challengeId, ctx = {}) {
  await ensureCanSeeChallenge(challengeId, ctx)
  return many(await db().from('follow_orders').select('*').eq('challenge_id', challengeId).order('created_at', { ascending: true }))
}

export async function createFollowOrderRow(payload = {}, ctx = {}) {
  const user = await requireWritableUser(ctx)
  const bossId = ctx.isAdmin ? String(payload.boss_id || '').trim() : userBossLabel(user)
  const challengeId = String(payload.challenge_id || '').trim()
  if (!challengeId) throw new Error('请选择任务')
  await ensureCanSeeChallenge(challengeId, ctx)
  const row = {
    challenge_id: challengeId,
    boss_id: bossId,
    gift_type: validateGift(payload.gift_type),
    gift_quantity: positiveInt(payload.gift_quantity, '数量'),
    created_by: ctx.isAdmin ? (payload.created_by || null) : user.id,
    created_at: nowIso(),
  }
  if (!row.boss_id) throw new Error('请输入老板ID')
  return first(await db().from('follow_orders').insert(row).select('*').single())
}

export async function deleteFollowOrderRow(id) {
  const { error } = await db().from('follow_orders').delete().eq('id', id)
  if (error) throw error
}
