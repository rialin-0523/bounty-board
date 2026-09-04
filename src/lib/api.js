import { supabase } from './supabase'

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
export async function listMainChallengesWithHidden() {
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

  const combined = mains.map(m => ({
    ...m,
    hidden_challenges: (hiddens || []).filter(h => h.parent_challenge_id === m.id),
  }))

  // 排序：active 优先，然后按 created_at desc；completed/cancelled 排最后
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
