import { supabase } from './supabase'

function normalizeUserRow(row) {
  if (!row) return null
  return {
    ...row,
    douyu_id: row.douyu_id || row.douyu_uid || '',
    douyu_uid: row.douyu_uid || row.douyu_id || '',
    douyu_nickname: row.douyu_nickname || row.douyu_name || '',
    douyu_name: row.douyu_name || row.douyu_nickname || '',
    douyu_avatar: row.douyu_avatar || '',
    douyu_level: row.douyu_level ?? 0,
    douyu_badge_name: row.douyu_badge_name || '',
    douyu_badge_level: row.douyu_badge_level ?? 0,
    is_blacklisted: Boolean(row.is_blacklisted),
    username: row.username || '',
    username_normalized: row.username_normalized || '',
    bind_session_id: row.bind_session_id || null,
    last_login_at: row.last_login_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

// =========================================================
// 用户（Users）- 斗鱼用户 + 站内账号
// =========================================================
export async function listUsers({ search = null } = {}) {
  let q = supabase.from('users').select('*').order('created_at', { ascending: false })
  if (search) {
    q = q.or(`douyu_uid.ilike.%${search}%,douyu_nickname.ilike.%${search}%,username.ilike.%${search}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeUserRow)
}

export async function getUser(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
  if (error) throw error
  return normalizeUserRow(data)
}

export async function getUserByDouyuId(douyuId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('douyu_uid', douyuId)
    .maybeSingle()
  if (error) throw error
  return normalizeUserRow(data)
}

export async function updateUser(id, payload) {
  const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().single()
  if (error) throw error
  return normalizeUserRow(data)
}

export async function blacklistUser(id, isBlacklisted) {
  return updateUser(id, { is_blacklisted: isBlacklisted })
}

export async function deleteUser(id) {
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) throw error
}

// 根据斗鱼ID 获取或创建用户（兼容旧逻辑，可用于简单登录）
export async function getOrCreateUser(douyuId, nickname = null) {
  if (!douyuId) throw new Error('斗鱼ID 不能为空')
  const existing = await getUserByDouyuId(douyuId)
  if (existing) {
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', existing.id)
    return existing
  }
  const { data, error } = await supabase
    .from('users')
    .insert({
      douyu_uid: douyuId,
      douyu_nickname: nickname || douyuId,
      douyu_level: 0,
      is_blacklisted: false,
      last_login_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return normalizeUserRow(data)
}

// =========================================================
// 配置（Settings）
// =========================================================
export async function getSetting(key, defaultValue = null) {
  const { data, error } = await supabase.from('settings').select('*').eq('key', key).maybeSingle()
  if (error) throw error
  if (!data) return defaultValue
  if (data.value == null || data.value === '') return defaultValue
  if (!Number.isNaN(Number(data.value))) return Number(data.value)
  return data.value
}

export async function setSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function listSettings() {
  const { data, error } = await supabase.from('settings').select('*').order('key', { ascending: true })
  if (error) throw error
  return data || []
}

export async function upsertSetting(payload) {
  const { data, error } = await supabase.from('settings').upsert(payload).select().single()
  if (error) throw error
  return data
}

// =========================================================
// 当前用户（由服务器 session 维护，这里仅提供权限判断工具）
// =========================================================
export async function checkCurrentUserPermission(currentUser) {
  if (!currentUser?.id) {
    return { allowed: false, reason: 'not_logged_in', message: '请先登录' }
  }
  if (currentUser.is_blacklisted) {
    return { allowed: false, reason: 'blacklisted', message: '你的账号已被拉黑，无法操作' }
  }
  const minLevel = Number(await getSetting('min_douyu_level', 0)) || 0
  if ((currentUser.douyu_level || 0) < minLevel) {
    return {
      allowed: false,
      reason: 'level_too_low',
      message: `斗鱼等级不足（${minLevel}级），暂时无法发布任务～`,
      requiredLevel: minLevel,
    }
  }
  return { allowed: true }
}

// =========================================================
// 挑战（Challenges）
// =========================================================
export async function listChallenges({ includeHidden = true } = {}) {
  let q = supabase.from('challenges').select('*')
  if (!includeHidden) q = q.eq('is_hidden', false)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// 拉所有主任务 + 它们的隐藏子任务，按 active 优先、completed 靠后排
// currentUserId 传入时，hidden_challenges 字段只包含该用户可见的隐藏任务
export async function listMainChallengesWithHidden({ currentUserId = null } = {}) {
  const { data: mains, error: e1 } = await supabase
    .from('challenges')
    .select('*')
    .is('parent_challenge_id', null)
    .order('created_at', { ascending: false })
  if (e1) throw e1
  if (!mains || mains.length === 0) return []

  const ids = mains.map(c => c.id)
  const { data: hiddens, error: e2 } = await supabase
    .from('challenges')
    .select('*')
    .in('parent_challenge_id', ids)
    .order('created_at', { ascending: true })
  if (e2) throw e2

  const visibleHiddens = (hiddens || []).filter(h => {
    if (!currentUserId) return false
    if (h.created_by === currentUserId) return true
    const main = mains.find(m => m.id === h.parent_challenge_id)
    if (main && main.created_by === currentUserId) return true
    return false
  })

  const combined = mains.map(m => ({
    ...m,
    hidden_challenges: visibleHiddens.filter(h => h.parent_challenge_id === m.id),
    hidden_total_count: (hiddens || []).filter(h => h.parent_challenge_id === m.id).length,
  }))

  return combined.sort((a, b) => {
    const order = { active: 0, completed: 1, cancelled: 2 }
    const oa = order[a.status] ?? 9
    const ob = order[b.status] ?? 9
    if (oa !== ob) return oa - ob
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export async function getChallenge(id) {
  const { data, error } = await supabase.from('challenges').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createChallenge(payload) {
  const { data, error } = await supabase.from('challenges').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateChallenge(id, payload) {
  const { data, error } = await supabase.from('challenges').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteChallenge(id) {
  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw error
}

// =========================================================
// 跟单（Follow Orders）
// =========================================================
export async function listFollowOrders(challengeId) {
  const { data, error } = await supabase
    .from('follow_orders')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function aggregateFollowOrders(challengeId) {
  const orders = await listFollowOrders(challengeId)
  const acc = { 飞机: 0, 火箭: 0, 币: 0 }
  orders.forEach(o => {
    acc[o.gift_type] = (acc[o.gift_type] || 0) + o.gift_quantity
  })
  return { orders, acc }
}

export async function createFollowOrder(payload) {
  const { data, error } = await supabase.from('follow_orders').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteFollowOrder(id) {
  const { error } = await supabase.from('follow_orders').delete().eq('id', id)
  if (error) throw error
}

// =========================================================
// 礼物常量
// =========================================================
export const GIFT_TYPES = ['飞机', '火箭', '币']
export const GIFT_ICONS = {
  飞机: '✈️',
  火箭: '🚀',
  币: '🪙',
}
