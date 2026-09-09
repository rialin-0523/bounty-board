import { DOUYU_BIND_ROOM_ID, DOUYU_DANMAKU_HOSTS, supabaseAdmin } from './config.mjs'
import { DouyuDanmakuClient, normalizeBindCodeText } from './douyu.mjs'
import {
  listActiveBindSessions,
  markBindSessionMatched,
  refreshExpiredBindSessions,
  upsertDouyuProfile,
} from './store.mjs'

const POLL_MS = Number(process.env.DOUYU_WORKER_POLL_MS || 2_000)
const LISTENER_IDLE_STOP_MS = Number(process.env.DOUYU_BIND_IDLE_STOP_MS || 30_000)

let bindClient = null
let bindCache = []
let pollTimer = null
let idleStopTimer = null
let refreshing = false

function clearIdleStopTimer() {
  if (idleStopTimer) clearTimeout(idleStopTimer)
  idleStopTimer = null
}

function stopListener(reason = 'idle') {
  clearIdleStopTimer()
  if (bindClient) {
    console.log(`[douyu-worker] 停止监听：${reason}`)
    bindClient.stop()
    bindClient.removeAllListeners()
    bindClient = null
  }
}

function hasActiveBind() {
  return bindCache.some(item => item.status === 'pending' || item.status === 'matched')
}

function scheduleIdleStopIfNeeded() {
  if (!bindClient) return
  if (hasActiveBind()) {
    clearIdleStopTimer()
    return
  }
  if (idleStopTimer) return
  idleStopTimer = setTimeout(() => {
    if (!hasActiveBind()) stopListener('当前没有有效绑定码')
  }, LISTENER_IDLE_STOP_MS)
}

async function refreshBindCache() {
  await refreshExpiredBindSessions().catch(() => {})
  bindCache = await listActiveBindSessions(DOUYU_BIND_ROOM_ID)
  scheduleIdleStopIfNeeded()
}

async function handleDouyuChat(payload) {
  const rawCodeText = String(payload.text || '').trim()
  if (!/^[A-Z0-9]{6}$/i.test(rawCodeText)) return

  const code = normalizeBindCodeText(rawCodeText)
  const matched = bindCache.find(item => item.status === 'pending' && normalizeBindCodeText(item.code) === code)
  if (!matched) return

  const expiresAt = new Date(matched.expiresAt).getTime()
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return

  let savedProfile = null
  try {
    savedProfile = await upsertDouyuProfile(payload)
  } catch (err) {
    console.warn('[douyu-worker] 命中弹幕后缓存资料失败:', err.message || err)
  }

  const nextProfile = {
    uid: String(savedProfile?.uid || payload.uid || ''),
    name: String(savedProfile?.name || payload.name || ''),
    avatar: String(savedProfile?.avatar || payload.avatar || ''),
    level: savedProfile?.level ?? payload.level ?? null,
    badgeName: String(savedProfile?.badge_name || payload.badgeName || ''),
    badgeLevel: savedProfile?.badge_level ?? payload.badgeLevel ?? 0,
  }

  const updated = await markBindSessionMatched(matched.id, nextProfile, payload.raw)
  if (updated) {
    console.log(`[douyu-worker] matched code ${matched.code} from ${nextProfile.name || nextProfile.uid || 'unknown'}`)
    await refreshBindCache()
  }
}

async function ensureListenerActive() {
  if (!supabaseAdmin) return false
  clearIdleStopTimer()
  if (!hasActiveBind()) return false
  if (bindClient) return true

  bindClient = new DouyuDanmakuClient({ roomId: DOUYU_BIND_ROOM_ID, hosts: DOUYU_DANMAKU_HOSTS })
  bindClient.on('status', text => console.log('[douyu-worker]', text))
  bindClient.on('error', err => console.warn('[douyu-worker]', err.message || err))
  bindClient.on('chat', payload => {
    handleDouyuChat(payload).catch(err => console.error('[douyu-worker] chat handling failed:', err))
  })
  bindClient.start()
  return true
}

async function tick() {
  if (refreshing || !supabaseAdmin) return
  refreshing = true
  try {
    await refreshBindCache()
    await ensureListenerActive()
  } catch (err) {
    console.warn('[douyu-worker] tick failed:', err.message || err)
  } finally {
    refreshing = false
  }
}

function start() {
  if (!supabaseAdmin) {
    console.warn('[douyu-worker] listener disabled because SUPABASE_SERVICE_ROLE_KEY is missing')
    return
  }
  console.log(`[douyu-worker] polling bind sessions every ${POLL_MS}ms; room=${DOUYU_BIND_ROOM_ID}`)
  tick()
  pollTimer = setInterval(tick, POLL_MS)
}

function shutdown() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  stopListener('worker exit')
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

start()
