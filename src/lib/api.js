import { supabase } from './supabase'

// =========================================================
// 用户（Users）- 斗鱼用户
// =========================================================
export async function listUsers({ search = null } = {}) {
  let q = supabase.from('users').select('*').order('created_at', { ascending: false })
  if (search) {
    q = q.or(`douyu_id.ilike.%${search}%,douyu_nickname.ilike.%${search}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getUser(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function getUserByDouyuId(douyuId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('douyu_id', douyuId)
    .maybeSingle()
  if (error) throw error
  return data
}

// 根据斗鱼ID 获取或创建用户（登录用）
export async function getOrCreateUser(douyuId, nickname = null) {
  if (!douyuId) throw new Error('斗鱼ID 不能为空')
  const existing = await getUserByDouyuId(douyuId)
  if (existing) {
    // 更新 last_login_at
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', existing.id)
    return existing
  }
  const { data, error } = await supabase
    .from('users')
    .insert({
      douyu_id: douyuId,
      douyu_nickname: nickname || douyuId,
      douyu_level: 0,
      is_blacklisted: false,
      last_login_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUser(id, payload) {
  const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function blacklistUser(id, isBlacklisted) {
  return updateUser(id, { is_blacklisted: isBlacklisted })
}

export async function deleteUser(id) {
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) throw error
}

// =========================================================
// 配置（Settings）
// =========================================================
export async function getSetting(key, defaultValue = null) {
  const { data, error } = await supabase.from('settings').select('*').eq('key', key).maybeSingle()
  if (error) throw error
  if (!data) return defaultValue
  // 尝试解析为数字
  if (!isNaN(data.value) && data.value !== '' && data.value !== null) {
    return Number(data.value)
  }
  return data.value
}

export async function setSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function listSettings() {
  const { data, error } = await supabase.from('settings').select('*')
  if (error) throw error
  return data || []
}

// =========================================================
// 当前用户（localStorage 管理）
// =========================================================
const CURRENT_USER_KEY = 'bounty_board_current_user'

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

export function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY)
}

// 检查当前用户是否有权操作（黑名单 + 等级）
export async function checkCurrentUserPermission() {
  const user = getCurrentUser()
  if (!user) {
    return { allowed: false, reason: 'not_logged_in', message: '请先登录' }
  }
  if (user.is_blacklisted) {
    return { allowed: false, reason: 'blacklisted', message: '你的账号已被拉黑，无法操作' }
  }
  const minLevel = await getSetting('min_douyu_level', 0)
  if ((user.douyu_level || 0) < minLevel) {
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

  // 隐藏任务可见性过滤
  // 规则：一个隐藏任务对以下用户可见：
  //   1. 该隐藏任务自己的创建者
  //   2. 主任务的创建者
  const visibleHiddens = (hiddens || []).filter(h => {
    if (!currentUserId) return false // 未登录看不到任何隐藏
    if (h.created_by === currentUserId) return true // 隐藏任务自己的创建者
    const main = mains.find(m => m.id === h.parent_challenge_id)
    if (main && main.created_by === currentUserId) return true // 主任务创建者
    return false
  })

  const combined = mains.map(m => ({
    ...m,
    hidden_challenges: visibleHiddens.filter(h => h.parent_challenge_id === m.id),
    // 如果有用户看不到的隐藏任务，给主任务一个 hidden_count 用于徽章（只对主任务创建者显示）
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
