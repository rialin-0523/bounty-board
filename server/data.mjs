import { nowIso, supabaseAdmin } from './config.mjs'

const GIFT_TYPES = new Set(['飞机', '火箭', '币'])
const CHALLENGE_STATUSES = new Set(['active', 'completed', 'cancelled'])
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected'])
const VALIDITY_HOURS = new Set([3, 5, 8, 12, 24])

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

function isChallengeExpired(row, now = Date.now()) {
  if (!row || row.status !== 'active' || !row.expires_at) return false
  const expiresAt = new Date(row.expires_at).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= now
}

function reviewStatus(row) {
  return row?.review_status || 'approved'
}

function challengeStatus(row, now = Date.now()) {
  if (!row) return 'cancelled'
  const review = reviewStatus(row)
  if (review !== 'approved') return review
  return isChallengeExpired(row, now) ? 'expired' : row.status
}

function decorateChallengeLifecycle(row) {
  if (!row) return row
  const effectiveStatus = challengeStatus(row)
  const review = reviewStatus(row)
  return {
    ...row,
    review_status: review,
    effective_status: effectiveStatus,
    is_expired: effectiveStatus === 'expired',
    is_review_pending: review === 'pending',
    is_review_rejected: review === 'rejected',
  }
}

function sortChallenges(rows) {
  return [...rows].sort((a, b) => {
    const order = { pending: 0, rejected: 1, active: 2, expired: 3, completed: 4, cancelled: 5 }
    const oa = order[a.effective_status || a.status] ?? 9
    const ob = order[b.effective_status || b.status] ?? 9
    if (oa !== ob) return oa - ob
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

function canSeeChallenge(row, parent, ctx = {}) {
  if (!row) return false
  if (ctx.isAdmin) return true
  const userId = ctx.user?.id
  const isOwner = userId && row.created_by === userId
  const isApproved = reviewStatus(row) === 'approved'
  if (!isApproved) return Boolean(isOwner)
  if (!row.parent_challenge_id) return true
  if (!userId) return false
  if (isOwner) return true
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
  return (await many(await query)).map(normalizeUserRow)
}

async function userMapByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()
  const rows = await many(await db().from('users').select('*').in('id', uniqueIds))
  return new Map(rows.map(row => [row.id, normalizeUserRow(row)]))
}

function attachCreator(row, usersById) {
  if (!row) return row
  const creator = usersById.get(row.created_by) || null
  return {
    ...row,
    created_by_user: creator,
    boss_avatar: creator?.douyu_avatar || '',
    boss_douyu_uid: creator?.douyu_uid || creator?.douyu_id || '',
    boss_douyu_nickname: creator?.douyu_nickname || creator?.douyu_name || '',
    boss_douyu_level: creator?.douyu_level ?? null,
    boss_douyu_badge_name: creator?.douyu_badge_name || '',
    boss_douyu_badge_level: creator?.douyu_badge_level ?? 0,
  }
}

async function enrichCreatorRows(rows = []) {
  const usersById = await userMapByIds(rows.map(row => row.created_by))
  return rows.map(row => attachCreator(row, usersById))
}

function emptyFollowSummary() {
  return {
    count: 0,
    acc: { 飞机: 0, 火箭: 0, 币: 0 },
  }
}

async function followSummaryMap(challengeIds = []) {
  const ids = [...new Set(challengeIds.filter(Boolean))]
  const summaries = new Map(ids.map(id => [id, emptyFollowSummary()]))
  if (ids.length === 0) return summaries

  let rows
  const summaryResult = await db()
    .from('follow_order_summaries')
    .select('*')
    .in('challenge_id', ids)
  if (!summaryResult.error) {
    rows = summaryResult.data || []
    for (const row of rows) {
      summaries.set(row.challenge_id, {
        count: Number(row.follow_count) || 0,
        acc: {
          飞机: Number(row.airplane_quantity) || 0,
          火箭: Number(row.rocket_quantity) || 0,
          币: Number(row.coin_quantity) || 0,
        },
      })
    }
    return summaries
  }
  if (!/follow_order_summaries|does not exist|不.*存在/i.test(String(summaryResult.error.message || summaryResult.error))) throw summaryResult.error
  rows = await many(
    await db()
      .from('follow_orders')
      .select('challenge_id, gift_type, gift_quantity')
      .in('challenge_id', ids)
  )
  for (const row of rows) {
    const summary = summaries.get(row.challenge_id) || emptyFollowSummary()
    summary.count += 1
    summary.acc[row.gift_type] = (summary.acc[row.gift_type] || 0) + (Number(row.gift_quantity) || 0)
    summaries.set(row.challenge_id, summary)
  }
  return summaries
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
  const visibleRows = rows.filter(row => {
    if (!includeHidden && row.parent_challenge_id) return false
    if (allowAllHidden) return true
    return canSeeChallenge(row, parents.get(row.parent_challenge_id), ctx)
  })
  return (await enrichCreatorRows(visibleRows)).map(decorateChallengeLifecycle)
}

export async function listMainChallengesWithHiddenRows({ showAllHidden = false, ctx = {} } = {}) {
  const rows = await many(await db().from('challenges').select('*').order('created_at', { ascending: false }))
  const allMains = rows.filter(row => !row.parent_challenge_id)
  const mains = allMains.filter(row => canSeeChallenge(row, null, ctx))
  const hiddens = rows.filter(row => row.parent_challenge_id)
  const allowAllHidden = showAllHidden && ctx.isAdmin
  const visibleHiddens = allowAllHidden
    ? hiddens
    : hiddens.filter(row => canSeeChallenge(row, allMains.find(main => main.id === row.parent_challenge_id), ctx) && mains.some(main => main.id === row.parent_challenge_id))

  const visibleIds = new Set([...mains, ...visibleHiddens].map(row => row.created_by).filter(Boolean))
  const usersById = await userMapByIds([...visibleIds])
  const followSummaries = await followSummaryMap([...mains, ...visibleHiddens].map(row => row.id))

  return sortChallenges(mains.map(row => decorateChallengeLifecycle(row))).map(main => {
    const children = visibleHiddens
      .filter(row => row.parent_challenge_id === main.id)
      .map(row => ({
        ...decorateChallengeLifecycle(attachCreator(row, usersById)),
        follow_summary: followSummaries.get(row.id) || emptyFollowSummary(),
      }))
    const allChildren = hiddens.filter(row => row.parent_challenge_id === main.id)
    const canSeeTotal = ctx.isAdmin || (ctx.user?.id && main.created_by === ctx.user.id)
    return {
      ...decorateChallengeLifecycle(attachCreator(main, usersById)),
      follow_summary: followSummaries.get(main.id) || emptyFollowSummary(),
      hidden_challenges: children,
      hidden_total_count: canSeeTotal ? allChildren.length : children.length,
    }
  })
}

export async function getChallengeRow(id, ctx = {}) {
  const row = await ensureCanSeeChallenge(id, ctx)
  const [enriched] = await enrichCreatorRows([row])
  return decorateChallengeLifecycle(enriched)
}

export async function getChallengeDetailRow(id, { followLimit = 50, ctx = {} } = {}) {
  const row = await ensureCanSeeChallenge(id, ctx)
  const parent = row.parent_challenge_id ? await loadChallenge(row.parent_challenge_id) : row
  const allRows = parent
    ? await many(await db().from('challenges').select('*').eq('parent_challenge_id', parent.id).order('created_at', { ascending: false }))
    : []
  const visibleHidden = allRows.filter(child => canSeeChallenge(child, parent, ctx))
  const detailRows = [row, ...(parent && parent.id !== row.id ? [parent] : []), ...visibleHidden]
  const usersById = await userMapByIds(detailRows.map(item => item.created_by))
  const ids = [...new Set(detailRows.map(item => item.id).filter(Boolean))]
  const safeLimit = Math.min(Math.max(Number.parseInt(String(followLimit), 10) || 50, 1), 100)
  const summaryMap = await followSummaryMap(ids)
  const followRows = ids.length === 0
    ? []
    : await many(await db().from('follow_orders').select('*').in('challenge_id', ids).order('created_at', { ascending: false }).limit(safeLimit * ids.length))
  const followUsersById = await userMapByIds(followRows.map(item => item.created_by))
  const followByChallenge = new Map(ids.map(challengeId => [challengeId, []]))
  for (const follow of followRows) {
    const list = followByChallenge.get(follow.challenge_id) || []
    if (list.length < safeLimit) list.push(attachCreator(follow, followUsersById))
    followByChallenge.set(follow.challenge_id, list)
  }
  const toDetail = item => ({
    ...decorateChallengeLifecycle(attachCreator(item, usersById)),
    follow_summary: summaryMap.get(item.id) || { count: 0, acc: { 飞机: 0, 火箭: 0, 币: 0 } },
    follow_orders: followByChallenge.get(item.id) || [],
  })
  const target = toDetail(row)
  const mainChallenge = parent && parent.id !== row.id ? toDetail(parent) : null
  const hiddenChallenges = parent && parent.id === row.id ? visibleHidden.map(toDetail) : []
  const hiddenTotalCount = parent && parent.id === row.id
    ? (ctx.isAdmin || ctx.user?.id === parent.created_by ? allRows.length : visibleHidden.length)
    : 0
 return {
    challenge: target,
    mainChallenge,
    hiddenChallenges,
    hiddenTotalCount,
    followSummary: target.follow_summary,
    followOrders: followByChallenge.get(row.id) || [],
  }
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

function validateReviewStatus(value) {
  const status = String(value || 'pending').trim()
  if (!REVIEW_STATUSES.has(status)) throw new Error('审核状态不正确')
  return status
}

function positiveInt(value, label = '数量') {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}必须为正整数`)
  return n
}

function validateValidityHours(value) {
  const hours = Number.parseInt(String(value ?? 3), 10)
  if (!VALIDITY_HOURS.has(hours)) throw new Error('任务有效期只能选择3、5、8、12或24小时')
  return hours
}

function expiresAtFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function ensureChallengeActive(row, message = '任务已到期，无法继续操作') {
  if (reviewStatus(row) !== 'approved') throw new Error('任务还没有审核通过，暂时不能操作')
  if (challengeStatus(row) !== 'active') throw new Error(message)
  return row
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
    ensureChallengeActive(parent, '关联主任务已结束或到期，不能添加隐藏任务')
  }
  const validityHours = validateValidityHours(payload.validity_hours)
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
    review_status: ctx.isAdmin ? validateReviewStatus(payload.review_status || 'approved') : 'pending',
    review_reason: null,
    reviewed_at: ctx.isAdmin ? nowIso() : null,
    reviewed_by: ctx.isAdmin ? (ctx.admin?.username || 'admin') : null,
    validity_hours: validityHours,
    expires_at: expiresAtFromNow(validityHours),
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
    ensureChallengeActive(existing, '任务已结束或到期，不能再修改')
  }

  const row = { updated_at: nowIso() }
  const allowContentEdit = ctx.isAdmin || ['pending', 'rejected'].includes(reviewStatus(existing))
  if (ctx.isAdmin || allowContentEdit) {
    if ('title' in payload) row.title = String(payload.title || '').trim()
    if ('description' in payload) row.description = payload.description ? String(payload.description).trim() : null
    if ('condition_desc' in payload) row.condition_desc = payload.condition_desc ? String(payload.condition_desc).trim() : null
    if ('gift_type' in payload) row.gift_type = validateGift(payload.gift_type)
    if ('gift_quantity' in payload) row.gift_quantity = positiveInt(payload.gift_quantity, '礼物数量')
    if ('validity_hours' in payload) row.validity_hours = validateValidityHours(payload.validity_hours)
  }
  if (ctx.isAdmin) {
    if ('boss_id' in payload) row.boss_id = String(payload.boss_id || '').trim()
    if ('status' in payload) row.status = validateStatus(payload.status)
    if ('created_by' in payload) row.created_by = payload.created_by || null
    if ('is_hidden' in payload) row.is_hidden = Boolean(payload.is_hidden)
    if ('parent_challenge_id' in payload) row.parent_challenge_id = payload.parent_challenge_id || null
    if ('review_status' in payload) {
      const nextReview = validateReviewStatus(payload.review_status)
      row.review_status = nextReview
      row.review_reason = nextReview === 'rejected' ? String(payload.review_reason || '').trim() : null
      if (nextReview === 'rejected' && !row.review_reason) throw new Error('拒绝时必须填写原因')
      row.reviewed_at = nowIso()
      row.reviewed_by = ctx.admin?.username || 'admin'
      if (nextReview === 'approved') {
        const validityHours = validateValidityHours(payload.validity_hours ?? existing.validity_hours ?? 3)
        row.validity_hours = validityHours
        row.expires_at = expiresAtFromNow(validityHours)
        row.status = 'active'
      }
    }
    if (payload.reset_expiry === true || payload.reset_expiry === 'true') {
      const validityHours = validateValidityHours(payload.validity_hours ?? existing.validity_hours ?? 3)
      row.validity_hours = validityHours
      row.expires_at = expiresAtFromNow(validityHours)
      if (existing.status === 'active') row.status = 'active'
    }
  } else {
    if (allowContentEdit && ['pending', 'rejected'].includes(reviewStatus(existing))) {
      row.review_status = 'pending'
      row.review_reason = null
      row.reviewed_at = null
      row.reviewed_by = null
      row.status = 'active'
    } else if ('status' in payload) {
      row.status = validateStatus(payload.status)
    }
  }
  if ('title' in row && !row.title) throw new Error('请填写挑战标题')

  const updated = await first(await db().from('challenges').update(row).eq('id', id).select('*').single())
  return updated
}

export async function deleteChallengeRow(id) {
  const { error } = await db().from('challenges').delete().eq('id', id)
  if (error) throw error
}

export async function listFollowOrderRows(challengeId, ctx = {}) {
  await ensureCanSeeChallenge(challengeId, ctx)
  const rows = await many(await db().from('follow_orders').select('*').eq('challenge_id', challengeId).order('created_at', { ascending: true }))
  return enrichCreatorRows(rows)
}

export async function createFollowOrderRow(payload = {}, ctx = {}) {
  const user = await requireWritableUser(ctx)
  const bossId = ctx.isAdmin ? String(payload.boss_id || '').trim() : userBossLabel(user)
  const challengeId = String(payload.challenge_id || '').trim()
  if (!challengeId) throw new Error('请选择任务')
  const challenge = await ensureCanSeeChallenge(challengeId, ctx)
  ensureChallengeActive(challenge, '任务已结束或到期，不能跟单')
  const row = {
    challenge_id: challengeId,
    boss_id: bossId,
    gift_type: validateGift(payload.gift_type),
    gift_quantity: positiveInt(payload.gift_quantity, '数量'),
    created_by: ctx.isAdmin ? (payload.created_by || null) : user.id,
    created_at: nowIso(),
  }
  const requestId = String(payload.request_id || '').trim()
  let requestIdColumnAvailable = false
  if (requestId) {
    const lookup = await db().from('follow_orders').select('*').eq('request_id', requestId).maybeSingle()
    if (!lookup.error) {
      requestIdColumnAvailable = true
      if (lookup.data) return lookup.data
    } else if (!/request_id|does not exist|不.*存在/i.test(String(lookup.error.message || lookup.error))) {
      throw lookup.error
    }
  }
  if (requestId && requestIdColumnAvailable) {
    row.request_id = requestId
  }
  if (!row.boss_id) throw new Error('请输入老板ID')
  const inserted = await db().from('follow_orders').insert(row).select('*').single()
  if (inserted.error && requestId && /duplicate|unique/i.test(String(inserted.error.message || inserted.error))) {
    const existing = await first(await db().from('follow_orders').select('*').eq('request_id', requestId).maybeSingle())
    if (existing) return existing
  }
  return first(inserted)
}

export async function deleteFollowOrderRow(id) {
  const { error } = await db().from('follow_orders').delete().eq('id', id)
  if (error) throw error
}
