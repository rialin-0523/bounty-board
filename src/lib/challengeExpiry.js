export const VALIDITY_HOURS = [3, 5, 8, 12, 24]

export function getChallengeStatus(challenge, now = Date.now()) {
  if (!challenge) return 'cancelled'
  if (challenge.status !== 'active') return challenge.status
  const expiresAt = challenge.expires_at ? new Date(challenge.expires_at).getTime() : NaN
  if (Number.isFinite(expiresAt) && expiresAt <= now) return 'expired'
  return challenge.effective_status || 'active'
}

export function isChallengeActive(challenge, now = Date.now()) {
  return getChallengeStatus(challenge, now) === 'active'
}

export function formatRemainingTime(expiresAt, now = Date.now()) {
  const expiresMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresMs)) return '未设置'
  const remainingMs = expiresMs - now
  if (remainingMs <= 0) return '已到期'
  const totalMinutes = Math.ceil(remainingMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `剩余 ${hours}小时${minutes}分` : `剩余 ${minutes}分`
}

export function formatExpiryTime(expiresAt) {
  if (!expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) return '未设置'
  return new Date(expiresAt).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function formatDateTimeWithWeekday(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '-'
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${values.weekday}`
}

export function challengeStatusLabel(status) {
  return { active: '进行中', expired: '已到期', completed: '已完成', cancelled: '已取消' }[status] || status
}
