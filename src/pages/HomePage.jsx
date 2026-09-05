import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  listMainChallengesWithHidden,
  aggregateFollowOrders,
  updateChallenge,
  getCurrentUser,
  GIFT_ICONS,
} from '../lib/api'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [challenges, setChallenges] = useState([])
  const [followMap, setFollowMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [giftFilter, setGiftFilter] = useState('全部')
  const [busy, setBusy] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    setCurrentUser(getCurrentUser())
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const user = getCurrentUser()
      const cs = await listMainChallengesWithHidden({ currentUserId: user?.id })
      setChallenges(cs)
      const fm = {}
      await Promise.all(cs.map(async c => {
        fm[c.id] = await aggregateFollowOrders(c.id)
        if (c.hidden_challenges) {
          for (const h of c.hidden_challenges) {
            fm[h.id] = await aggregateFollowOrders(h.id)
          }
        }
      }))
      setFollowMap(fm)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function getTotal(c) {
    const fm = followMap[c.id]
    if (!fm) return c.gift_quantity
    return c.gift_quantity + (fm.acc[c.gift_type] || 0)
  }

  // 判断当前用户是否是主任务的创建者（只有创建者自己能看到隐藏徽章）
  function isMainCreator(c) {
    return currentUser && c.created_by === currentUser.id
  }

  async function handleComplete(c, e) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (!confirm(`确认任务「${c.title}」已完成吗？`)) return
    setBusy(c.id)
    try {
      await updateChallenge(c.id, { status: 'completed' })
      await fetchAll()
    } catch (err) {
      alert('操作失败：' + err.message)
    } finally {
      setBusy(null)
    }
  }

  const display = challenges.filter(c => {
    if (statusFilter !== '全部' && c.status !== statusFilter) return false
    if (giftFilter !== '全部' && c.gift_type !== giftFilter) return false
    if (search) {
      const hay = `${c.title} ${c.boss_id || ''} ${c.description || ''} ${c.condition_desc || ''}`
      if (!hay.toLowerCase().includes(search.toLowerCase())) return false
    }
    return true
  })

  return (
    <Layout>
      <div className="home-bg">
        <div className="home-bg-stripe"></div>
      </div>

      <div className="home-toolbar">
        <input
          className="home-search"
          type="text"
          placeholder="搜索任务 / 老板ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="home-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="全部">全部状态</option>
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <select className="home-select" value={giftFilter} onChange={e => setGiftFilter(e.target.value)}>
          <option value="全部">全部礼物</option>
          <option value="飞机">✈️ 飞机</option>
          <option value="火箭">🚀 火箭</option>
          <option value="币">🪙 币</option>
        </select>
      </div>

      {loading ? (
        <div className="home-loading">加载中...</div>
      ) : display.length === 0 ? (
        <div className="home-empty">
          <div className="home-empty-icon">⚔️</div>
          <div className="home-empty-text">{challenges.length === 0 ? '暂无任务' : '没有匹配的任务'}</div>
          {challenges.length === 0 && (
            <Link to="/publish" className="home-empty-cta">+ 发布第一个挑战</Link>
          )}
        </div>
      ) : (
        <div className="cb-list">
          {display.map(c => (
            <Link key={c.id} to={`/challenges/${c.id}`} className={`cb-card ${c.status === 'completed' ? 'is-completed' : ''}`}>
              <div className="cb-card-inner">
                <div className="cb-card-border"></div>
                <div className="cb-card-head">
                  <div className="cb-boss-info">
                    <div className="cb-boss-avatar">{c.boss_id?.charAt(0) || '?'}</div>
                    <div>
                      <div className="cb-boss-name">{c.boss_id}</div>
                      <div className="cb-boss-label">老板</div>
                    </div>
                  </div>
                  <span className={`cb-status cb-status-${c.status}`}>
                    {c.status === 'active' ? '进行中' : c.status === 'completed' ? '已完成' : '已取消'}
                  </span>
                </div>

                <div className="cb-title">{c.title}</div>
                {c.condition_desc && <div className="cb-condition">条件：{c.condition_desc}</div>}
                {c.description && <div className="cb-desc">{c.description}</div>}

                <div className="cb-gift-row">
                  <div className="cb-gift-badge">
                    <span className="cb-gift-icon">{GIFT_ICONS[c.gift_type]}</span>
                    <span className="cb-gift-type">{c.gift_type}</span>
                    <span className="cb-gift-qty">x {getTotal(c)}</span>
                  </div>
                  {(followMap[c.id]?.acc[c.gift_type] || 0) > 0 && (
                    <div className="cb-follow-info">含 {followMap[c.id].acc[c.gift_type]} 跟单</div>
                  )}
                </div>

                {/* 隐藏任务徽章：只有主任务创建者能看到（且未登录不显示） */}
                {isMainCreator(c) && c.hidden_total_count > 0 && (
                  <div className="cb-hidden-badge">
                    🎁 包含 {c.hidden_total_count} 个隐藏任务
                  </div>
                )}

                {c.status === 'active' && isMainCreator(c) && (
                  <button
                    className="cb-complete-btn"
                    onClick={(e) => handleComplete(c, e)}
                    disabled={busy === c.id}
                  >
                    {busy === c.id ? '处理中...' : '✓ 标记完成'}
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
