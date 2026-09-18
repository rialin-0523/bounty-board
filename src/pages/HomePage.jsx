import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/useAuth'
import { aggregateFollowOrders, listMainChallengesWithHidden, updateChallenge, GIFT_ICONS } from '../lib/api'
import { challengeStatusLabel, formatRemainingTime, getChallengeStatus, isChallengeActive } from '../lib/challengeExpiry'
import './HomePage.css'

export default function HomePage() {
  const { user: currentUser } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [followMap, setFollowMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [giftFilter, setGiftFilter] = useState('全部')
  const [busy, setBusy] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const fetchingRef = useRef(false)

  const fetchAll = useCallback(async ({ silent = false } = {}) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (!silent) setLoading(true)
    try {
      const cs = await listMainChallengesWithHidden({ currentUserId: currentUser?.id || null })
      setChallenges(cs)
      const fm = {}
      const visibleRows = cs.flatMap(c => [c, ...(c.hidden_challenges || [])])
      const hasBatchSummary = visibleRows.every(c => c.follow_summary)
      if (!hasBatchSummary) {
        await Promise.all(visibleRows.map(async c => {
          fm[c.id] = await aggregateFollowOrders(c.id)
        }))
        setFollowMap(fm)
        return
      }
      for (const c of cs) {
        fm[c.id] = c.follow_summary || { acc: {} }
        for (const h of c.hidden_challenges || []) fm[h.id] = h.follow_summary || { acc: {} }
      }
      setFollowMap(fm)
    } catch (e) {
      console.error(e)
    } finally {
      if (!silent) setLoading(false)
      fetchingRef.current = false
    }
  }, [currentUser])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchAll({ silent: true })
    }
    const timer = window.setInterval(refreshWhenVisible, 10000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [fetchAll])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  function getTotal(c) {
    const fm = followMap[c.id]
    return fm ? c.gift_quantity + (fm.acc[c.gift_type] || 0) : c.gift_quantity
  }

  function isMainCreator(c) { return currentUser && c.created_by === currentUser.id }

  function bossAvatarNode(c) {
    const src = c.boss_avatar || c.created_by_user?.douyu_avatar || ''
    const label = c.boss_douyu_nickname || c.created_by_user?.douyu_nickname || c.boss_id || '老板'
    if (src && /^https?:\/\//i.test(src)) return <img className="cb-boss-avatar-img" src={src} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    return <div className="cb-boss-avatar">{label?.charAt(0) || '?'}</div>
  }

  async function handleComplete(c, e) {
    e.preventDefault(); e.stopPropagation()
    if (busy || !isChallengeActive(c, now)) return
    if (!confirm(`确认任务「${c.title}」已完成吗？`)) return
    setBusy(c.id)
    try { await updateChallenge(c.id, { status: 'completed' }); await fetchAll() } catch (err) { alert('操作失败：' + err.message) } finally { setBusy(null) }
  }

  const display = challenges.filter(c => {
    const status = getChallengeStatus(c, now)
    if (statusFilter !== '全部' && status !== statusFilter) return false
    if (giftFilter !== '全部' && c.gift_type !== giftFilter) return false
    if (search) {
      const hay = `${c.title} ${c.boss_id || ''} ${c.description || ''} ${c.condition_desc || ''}`
      if (!hay.toLowerCase().includes(search.toLowerCase())) return false
    }
    return true
  })

  return (
    <Layout>
      <div className="home-bg"><div className="home-bg-stripe"></div></div>
      <div className="home-toolbar">
        <input className="home-search" type="text" placeholder="搜索任务 / 老板ID..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="home-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="全部">全部状态</option><option value="active">进行中</option><option value="expired">已到期</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select>
        <select className="home-select" value={giftFilter} onChange={e => setGiftFilter(e.target.value)}><option value="全部">全部礼物</option><option value="飞机">✈️ 飞机</option><option value="火箭">🚀 火箭</option><option value="币">🪙 币</option></select>
      </div>
      {loading ? <div className="home-loading">加载中...</div> : display.length === 0 ? <div className="home-empty"><div className="home-empty-icon">⚔️</div><div className="home-empty-text">{challenges.length === 0 ? '暂无任务' : '没有匹配的任务'}</div>{challenges.length === 0 && <Link to="/publish" className="home-empty-cta">+ 发布第一个挑战</Link>}</div> : <div className="cb-list">
        {display.map(c => {
          const status = getChallengeStatus(c, now)
          return <Link key={c.id} to={`/challenges/${c.id}`} className={`cb-card ${status === 'completed' || status === 'expired' ? 'is-completed' : ''}`}><div className="cb-card-inner"><div className="cb-card-border"></div>
            <div className="cb-card-head"><div className="cb-boss-info">{bossAvatarNode(c)}<div><div className="cb-boss-name">{c.boss_id}</div><div className="cb-boss-label">老板{c.boss_douyu_level != null ? ` · LV${c.boss_douyu_level}` : ''}</div></div></div><span className={`cb-status cb-status-${status}`}>{challengeStatusLabel(status)}</span></div>
            <div className="cb-title">{c.title}</div>{c.condition_desc && <div className="cb-condition">条件：{c.condition_desc}</div>}{c.description && <div className="cb-desc">{c.description}</div>}
            <div className={`cb-expiry ${status === 'expired' ? 'is-expired' : ''}`}>{status === 'active' ? `⏳ ${formatRemainingTime(c.expires_at, now)} · ${c.validity_hours || 3}小时有效` : status === 'expired' ? '⌛ 任务已到期，不能再跟单' : `有效期：${c.validity_hours || 3}小时`}</div>
            <div className="cb-gift-row"><div className="cb-gift-badge"><span className="cb-gift-icon">{GIFT_ICONS[c.gift_type]}</span><span className="cb-gift-type">{c.gift_type}</span><span className="cb-gift-qty">x {getTotal(c)}</span></div>{(followMap[c.id]?.acc[c.gift_type] || 0) > 0 && <div className="cb-follow-info">含 {followMap[c.id].acc[c.gift_type]} 跟单</div>}</div>
            {isMainCreator(c) && c.hidden_total_count > 0 && <div className="cb-hidden-badge">🎁 包含 {c.hidden_total_count} 个隐藏任务</div>}
            {status === 'active' && isMainCreator(c) && <button className="cb-complete-btn" onClick={e => handleComplete(c, e)} disabled={busy === c.id}>{busy === c.id ? '处理中...' : '✓ 标记完成'}</button>}
          </div></Link>
        })}
      </div>}
    </Layout>
  )
}
