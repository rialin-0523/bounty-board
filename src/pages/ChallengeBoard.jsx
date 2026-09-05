import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  listMainChallengesWithHidden,
  listStreamers,
  aggregateFollowOrders,
  GIFT_ICONS,
} from '../lib/api'
import './ChallengeBoard.css'

export default function ChallengeBoard() {
  const [challenges, setChallenges] = useState([])
  const [streamers, setStreamers] = useState([])
  const [followMap, setFollowMap] = useState({}) // challengeId -> {orders, acc}
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [giftFilter, setGiftFilter] = useState('全部')

    useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [cs, ss] = await Promise.all([
          listMainChallengesWithHidden(),
          listStreamers(),
        ])
        if (!active) return
        setChallenges(cs)
        setStreamers(ss)
        const fm = {}
        await Promise.all(cs.map(async c => {
          fm[c.id] = await aggregateFollowOrders(c.id)
          if (c.hidden_challenges) {
            for (const h of c.hidden_challenges) {
              fm[h.id] = await aggregateFollowOrders(h.id)
            }
          }
        }))
        if (active) setFollowMap(fm)
      } catch (e) {
        console.error(e)
        alert('加载失败：' + e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  function getStreamer(id) {
    return streamers.find(s => s.id === id)
  }

  function getTotal(c) {
    // 主任务的累计 = 基础 + 跟单(同类型)
    const fm = followMap[c.id]
    if (!fm) return c.gift_quantity
    return c.gift_quantity + (fm.acc[c.gift_type] || 0)
  }

  const display = challenges.filter(c => {
    if (statusFilter !== '全部' && c.status !== statusFilter) return false
    if (giftFilter !== '全部' && c.gift_type !== giftFilter) return false
    if (search) {
      const s = getStreamer(c.streamer_id)
      const hay = `${c.title} ${c.description || ''} ${c.condition_desc || ''} ${s?.nickname || ''}`
      if (!hay.toLowerCase().includes(search.toLowerCase())) return false
    }
    return true
  })

  return (
    <Layout>
      <div className="cb-page">
        <div className="cb-hero">
          <div className="cb-hero-title">突围特工队</div>
          <div className="cb-hero-sub">挑战榜 / S1</div>
        </div>

        <div className="cb-toolbar">
          <input
            className="cb-search"
            type="text"
            placeholder="搜索挑战 / 主播昵称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="cb-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="全部">全部状态</option>
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
          <select className="cb-select" value={giftFilter} onChange={e => setGiftFilter(e.target.value)}>
            <option value="全部">全部礼物</option>
            <option value="飞机">✈️ 飞机</option>
            <option value="火箭">🚀 火箭</option>
            <option value="币">🪙 币</option>
          </select>
        </div>

        {loading ? (
          <div className="cb-loading">加载中...</div>
        ) : display.length === 0 ? (
          <div className="cb-empty">
            <div className="cb-empty-icon">⚔️</div>
            <div className="cb-empty-text">暂无挑战</div>
          </div>
        ) : (
          <div className="cb-list">
            {display.map(c => {
              const streamer = getStreamer(c.streamer_id)
              return (
                <Link key={c.id} to={`/challenges/${c.id}`} className="cb-card">
                  <div className="cb-card-inner">
                    <div className="cb-card-border"></div>
                    <div className="cb-card-head">
                      <div className="cb-streamer-info">
                        <div className="cb-streamer-avatar placeholder">
                          {streamer?.nickname?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="cb-streamer-name">{streamer?.nickname || '未知主播'}</div>
                          <div className="cb-streamer-meta">
                            {streamer?.game_tag} · {streamer?.level}
                          </div>
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

                    {c.hidden_challenges && c.hidden_challenges.length > 0 && (
                      <div className="cb-hidden-badge">
                        🎁 包含 {c.hidden_challenges.length} 个隐藏任务
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
