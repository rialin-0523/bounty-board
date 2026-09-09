import { requestJson } from './http'

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

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
    last_login_at: row.last_login_at || row.lastLoginAt || null,
    created_at: row.created_at || row.createdAt || null,
    updated_at: row.updated_at || row.updatedAt || null,
  }
}

// =========================================================
// 用户（Users）- 斗鱼用户 + 站内账号
// =========================================================
export async function listUsers({ search = null } = {}) {
  const data = await requestJson(`/api/admin/users${queryString({ search })}`)
  return (data.users || []).map(normalizeUserRow)
}

export async function getUser(id) {
  const data = await requestJson(`/api/admin/users/${encodeURIComponent(id)}`)
  return normalizeUserRow(data.user)
}

export async function getUserByDouyuId(douyuId) {
  const data = await requestJson(`/api/admin/users/by-douyu/${encodeURIComponent(douyuId)}`)
  return normalizeUserRow(data.user)
}

export async function updateUser(id, payload) {
  const data = await requestJson(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return normalizeUserRow(data.user)
}

export async function blacklistUser(id, isBlacklisted) {
  return updateUser(id, { is_blacklisted: isBlacklisted })
}

export async function deleteUser(id) {
  await requestJson(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function saveDouyuUserProfile(payload) {
  const body = {
    id: payload.id || null,
    douyu_uid: String(payload.douyu_uid || '').trim(),
    douyu_nickname: String(payload.douyu_nickname || '').trim(),
    douyu_avatar: String(payload.douyu_avatar || '').trim(),
    douyu_level: Number(payload.douyu_level || 0) || 0,
    douyu_badge_name: String(payload.douyu_badge_name || '').trim(),
    douyu_badge_level: Number(payload.douyu_badge_level || 0) || 0,
  }
  if (!body.douyu_uid) throw new Error('斗鱼 UID 不能为空')
  if (!body.douyu_nickname) throw new Error('斗鱼昵称不能为空')
  const data = await requestJson('/api/admin/users/douyu-profile', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return normalizeUserRow(data.user)
}

// 旧弹窗兼容：当前正式登录必须走 /bind 绑定，不再允许前端手工创建斗鱼用户。
export async function getOrCreateUser() {
  throw new Error('请使用“绑定斗鱼”完成账号绑定后再登录')
}

export function setCurrentUser(user) {
  window.localStorage.setItem('bounty_legacy_user', JSON.stringify(user || null))
}

// =========================================================
// 配置（Settings）
// =========================================================
export async function getSetting(key, defaultValue = null) {
  const data = await requestJson(`/api/settings/${encodeURIComponent(key)}`)
  const value = data.value
  if (value == null || value === '') return defaultValue
  if (!Number.isNaN(Number(value))) return Number(value)
  return value
}

export async function setSetting(key, value) {
  await requestJson(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value: String(value) }),
  })
}

export async function listSettings() {
  const data = await requestJson('/api/admin/settings')
  return data.settings || []
}

export async function upsertSetting(payload) {
  await setSetting(payload.key, payload.value)
  return payload
}

// =========================================================
// 当前用户权限
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
export async function listChallenges({ includeHidden = true, showAllHidden = false } = {}) {
  const data = await requestJson(`/api/challenges${queryString({ includeHidden: includeHidden ? '1' : '0', showAllHidden: showAllHidden ? '1' : '0' })}`)
  return data.challenges || []
}

export async function listMainChallengesWithHidden({ showAllHidden = false } = {}) {
  const data = await requestJson(`/api/challenges/with-hidden${queryString({ showAllHidden: showAllHidden ? '1' : '0' })}`)
  return data.challenges || []
}

export async function getChallenge(id) {
  const data = await requestJson(`/api/challenges/${encodeURIComponent(id)}`)
  return data.challenge
}

export async function createChallenge(payload) {
  const data = await requestJson('/api/challenges', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.challenge
}

export async function updateChallenge(id, payload) {
  const data = await requestJson(`/api/challenges/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return data.challenge
}

export async function deleteChallenge(id) {
  await requestJson(`/api/challenges/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// =========================================================
// 跟单（Follow Orders）
// =========================================================
export async function listFollowOrders(challengeId) {
  const data = await requestJson(`/api/challenges/${encodeURIComponent(challengeId)}/follow-orders`)
  return data.followOrders || []
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
  const data = await requestJson('/api/follow-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.followOrder
}

export async function deleteFollowOrder(id) {
  await requestJson(`/api/follow-orders/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
