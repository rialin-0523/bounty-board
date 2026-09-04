import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getChallenge,
  listStreamers,
  aggregateFollowOrders,
  createFollowOrder,
  getOrCreateBoss,
  GIFT_ICONS,
  GIFT_TYPES,
} from '../lib/api'
import './ChallengeDetail.css'

export default function ChallengeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [challenge, setChallenge] = useState(null)
  const [streamer, setStreamer] = useState(null)
  const [hiddenList, setHiddenList] = useState([])
  const [followMain, setFollowMain] = useState({ orders: [], acc: {} })
  const [followHidden, setFollowHidden] = useState({})
  const [loading, setLoading] = useState(true)
  const [showFollowForm, setShowFollowForm] = useState(false)
  const [followTarget, setFollowTarget] = useState(null) // 主挑战或某个隐藏任务
  const [followForm, setFollowForm] = useState({ douyu_id: '', gift_type: '飞机', gift_quantity: 1 })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    setLoading(true)
    try {
      const c = await getChallenge(id)
      setChallenge(c)
      // 主播
      let s = null
      if (c.streamer_id) {
        const ss = await listStreamers()
        s = ss.find(x => x.id === c.streamer_id) || null
        setStreamer(s)
      }
      // 隐藏任务（仅当当前是主任务时）
      let hiddens = []
      if (c.parent_challenge_id == null) {
        const { listChallenges } = await import('../lib/api')
        const all = await listChallenges()
        hiddens = all.filter(h => h.parent_challenge_id === c.id)
        setHiddenList(hiddens)
      }
      // 跟单
      const fm = await aggregateFollowOrders(c.id)
      setFollowMain(fm)
      // 隐藏任务各自跟单
      const fh = {}
      await Promise.all(
        hiddens.map(async h => {
          fh[h.id] = await aggregateFollowOrders(h.id)
        })
      )
      setFollowHidden(fh)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function getTotal(c) {
    // 累计: 基础 + 同类型跟单
    if (c.id === challenge?.id) {
      return c.gift_quantity + (followMain.acc[c.gift_type] || 0)
    } else {
      const fh = followHidden[c.id]
      return c.gift_quantity + ((fh && fh.acc[c.gift_type]) || 0)
    }
  }

  function openFollowForm(c) {
    setFollowTarget(c)
    setShowFollowForm(true)
    setFollowForm({ douyu_id: '', gift_type: c.gift_type, gift_quantity: 1 })
  }

  async function submitFollow(e) {
    e.preventDefault()
    if (!followForm.douyu_id.trim()) {
      alert('请输入斗鱼ID')
      return
    }
    if (followForm.gift_quantity <= 0) {
      alert('数量必须为正整数')
      return
    }
    setSubmitting(true)
    try {
      const boss = await getOrCreateBoss(followForm.douyu_id.trim())
      await createFollowOrder({
        challenge_id: followTarget.id,
        boss_id: boss.id,
        gift_type: followForm.gift_type,
        gift_quantity: parseInt(followForm.gift_quantity),
      })
      alert('跟单成功！')
      setShowFollowForm(false)
      await fetchAll()
    } catch (e) {
      console.error(e)
      alert('跟单失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Layout><div className="cd-loading">加载中...</div></Layout>
  }
  if (!challenge) {
    return <Layout><div className="cd-loading">挑战不存在</div></Layout>
  }

  // 隐藏任务列表
  const hiddens = challenge.parent_challenge_id == null ? hiddenList : []
  // 跟单老板列表
  const followBosses = followMain.orders.map(o => o.boss_id)

  return (
    <Layout>
      <div className="cd-page">
        <button className="cd-back" onClick={() => navigate(-1)}>← 返回</button>

        <div className="cd-main-card">
          <div className="cd-main-card-border"></div>
          <div className="cd-status-tag">主任务</div>

          {streamer && (
            <div className="cd-streamer-row">
              {streamer.avatar_url ? (
                <img className="cd-streamer-avatar" src={streamer.avatar_url} alt={streamer.nickname} />
              ) : (
                <div className="cd-streamer-avatar placeholder">{streamer.nickname?.charAt(0)}</div>
              )}
              <div>
                <div className="cd-streamer-name">{streamer.nickname}</div>
                <div className="cd-streamer-meta">{streamer.game_tag} · {streamer.level} · 直播间 {streamer.room_id}</div>
              </div>
            </div>
          )}

          <h1 className="cd-title">{challenge.title}</h1>
          {challenge.condition_desc && (
            <div className="cd-condition">条件：{challenge.condition_desc}</div>
          )}
          {challenge.description && (
            <p className="cd-desc">{challenge.description}</p>
          )}

          <div className="cd-gift-box">
            <div className="cd-gift-label">主奖励</div>
            <div className="cd-gift-display">
              <span className="cd-gift-icon-big">{GIFT_ICONS[challenge.gift_type]}</span>
              <span className="cd-gift-name">{challenge.gift_type}</span>
              <span className="cd-gift-x">x</span>
              <span className="cd-gift-total">{getTotal(challenge)}</span>
            </div>
            {(followMain.acc[challenge.gift_type] || 0) > 0 && (
              <div className="cd-gift-follow-info">
                基础 {challenge.gift_quantity} + 跟单 {followMain.acc[challenge.gift_type]}
              </div>
            )}
          </div>

          {followMain.orders.length > 0 && (
            <div className="cd-follow-list">
              <div className="cd-section-label">跟单 ({followMain.orders.length})</div>
              <div className="cd-follow-items">
                {followMain.orders.map(o => (
                  <span key={o.id} className="cd-follow-chip">
                    {GIFT_ICONS[o.gift_type]} {o.gift_quantity}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button className="cd-follow-btn" onClick={() => openFollowForm(challenge)}>
            + 跟单
          </button>
        </div>

        {hiddens.length > 0 && (
          <div className="cd-hidden-section">
            <div className="cd-section-title">🎁 隐藏任务 ({hiddens.length})</div>
            {hiddens.map(h => {
              const fh = followHidden[h.id] || { orders: [], acc: {} }
              return (
                <div key={h.id} className="cd-hidden-card">
                  <div className="cd-hidden-card-border"></div>
                  <div className="cd-hidden-status">隐藏任务</div>
                  <h3 className="cd-hidden-title">{h.title}</h3>
                  {h.condition_desc && <div className="cd-hidden-condition">条件：{h.condition_desc}</div>}
                  {h.description && <p className="cd-hidden-desc">{h.description}</p>}

                  <div className="cd-gift-box small">
                    <div className="cd-gift-display">
                      <span className="cd-gift-icon-big">{GIFT_ICONS[h.gift_type]}</span>
                      <span className="cd-gift-name">{h.gift_type}</span>
                      <span className="cd-gift-x">x</span>
                      <span className="cd-gift-total">{h.gift_quantity + (fh.acc[h.gift_type] || 0)}</span>
                    </div>
                  </div>

                  <button className="cd-follow-btn small" onClick={() => openFollowForm(h)}>
                    + 跟单
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showFollowForm && (
          <div className="cd-modal-overlay" onClick={() => setShowFollowForm(false)}>
            <div className="cd-modal" onClick={e => e.stopPropagation()}>
              <div className="cd-modal-title">跟单：{followTarget.title}</div>
              <form onSubmit={submitFollow} className="cd-form">
                <label className="cd-form-label">
                  老板斗鱼ID
                  <input
                    className="cd-form-input"
                    type="text"
                    value={followForm.douyu_id}
                    onChange={e => setFollowForm({ ...followForm, douyu_id: e.target.value })}
                    placeholder="请输入斗鱼ID"
                    required
                  />
                </label>
                <label className="cd-form-label">
                  礼物类型
                  <select
                    className="cd-form-input"
                    value={followForm.gift_type}
                    onChange={e => setFollowForm({ ...followForm, gift_type: e.target.value })}
                  >
                    {GIFT_TYPES.map(t => (
                      <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>
                    ))}
                  </select>
                </label>
                <label className="cd-form-label">
                  数量（正整数）
                  <input
                    className="cd-form-input"
                    type="number"
                    min="1"
                    step="1"
                    value={followForm.gift_quantity}
                    onChange={e => setFollowForm({ ...followForm, gift_quantity: e.target.value })}
                    required
                  />
                </label>
                <div className="cd-form-actions">
                  <button type="button" className="cd-btn-secondary" onClick={() => setShowFollowForm(false)}>
                    取消
                  </button>
                  <button type="submit" className="cd-btn-primary" disabled={submitting}>
                    {submitting ? '提交中...' : '确认跟单'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
