import { supabase } from './supabase'

// =========================================================
// 主播（Streamers）
// =========================================================
export async function listStreamers({ gameTag = null, isLive = null } = {}) {
  let q = supabase.from('streamers').select('*').order('rush_value', { ascending: false })
  if (gameTag) q = q.eq('game_tag', gameTag)
  if (isLive !== null) q = q.eq('is_live', isLive)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getStreamer(id) {
  const { data, error } = await supabase.from('streamers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createStreamer(payload) {
  const { data, error } = await supabase.from('streamers').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateStreamer(id, payload) {
  const { data, error } = await supabase.from('streamers').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteStreamer(id) {
  const { error } = await supabase.from('streamers').delete().eq('id', id)
  if (error) throw error
}

// =========================================================
// 老板（Bosses）- 通过斗鱼ID 唯一识别
// =========================================================
export async function getOrCreateBoss(douyuId, nickname = null) {
  if (!douyuId) return null
  const { data: existing } = await supabase.from('bosses').select('*').eq('douyu_id', douyuId).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase
    .from('bosses')
    .insert({ douyu_id: douyuId, nickname })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listBosses() {
  const { data, error } = await supabase.from('bosses').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// =========================================================
// 挑战（Challenges）
// =========================================================
export async function listChallenges({ streamerId = null, includeHidden = true } = {}) {
  let q = supabase
    .from('challenges')
    .select('*')
    .order('created_at', { ascending: false })
  if (streamerId) q = q.eq('streamer_id', streamerId)
  if (!includeHidden) q = q.eq('is_hidden', false)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getChallenge(id) {
  const { data, error } = await supabase.from('challenges').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function listMainChallengesWithHidden() {
  // 拉所有主挑战 + 它们各自的隐藏子任务
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
  return mains.map(m => ({
    ...m,
    hidden_challenges: (hiddens || []).filter(h => h.parent_challenge_id === m.id),
  }))
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
  // 返回 { 飞机: 累计, 火箭: 累计, 币: 累计 }
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
// 工具：上传头像到 storage
// =========================================================
export async function uploadAvatar(file) {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(fileName, file)
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
  return publicUrl
}

// =========================================================
// 礼物相关常量
// =========================================================
export const GIFT_TYPES = ['飞机', '火箭', '币']
export const GIFT_ICONS = {
  飞机: '✈️',
  火箭: '🚀',
  币: '🪙',
}
export const GAME_TAGS = ['CS2', '户外', '主机其他游戏', '主机游戏', '英雄联盟', '王者荣耀', '和平精英', '其他']
