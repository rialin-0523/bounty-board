import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/useAuth'
import {
  getChallenge,
  listChallenges,
  aggregateFollowOrders,
  createFollowOrder,
  createChallenge,
  updateChallenge,
  checkCurrentUserPermission,
  GIFT_ICONS,
  GIFT_TYPES,
} from '../lib/api'
import './ChallengeDetail.css'

export default function ChallengeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [challenge, setChallenge] = useState(null)
  const [hiddenList, setHiddenList] = useState([])
  const [hiddenTotal, setHiddenTotal] = useState(0)
  const [followMain, setFollowMain] = useState({ orders: [], acc: {} })
  const [followHidden, setFollowHidden] = useState({})
  const [loading, setLoading] = useState(true)

  // 跟单
  const [showFollowForm, setShowFollowForm] = useState(false)
  const [followTarget, setFollowTarget] = useState(null)
  const [followForm, setFollowForm] = useState({ boss_id: '', gift_type: '飞机', gift_quantity: 1 })

  // 隐藏任务
  const [showHiddenForm, setShowHiddenForm] = useState(false)
  const [hiddenForm, setHiddenForm] = useState({
    boss_id: '',
    title: '',
    condition_desc: '',
    description: '',
    gift_type: '飞机',
    gift_quantity: 1,
  })

  const [submitting, setSubmitting] = useState(false)
  const [completing, setCompleting] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const c = await getChallenge(id)
      setChallenge(c)

      let hiddens = []
      if (c.parent_challenge_id == null) {
        const all = await listChallenges()
        hiddens = all.filter(h => {
          if (h.parent_challenge_id !== c.id) return false
          if (!currentUser) return false
          if (h.created_by === currentUser.id) return true
          return c.created_by === currentUser.id
        })
        setHiddenList(hiddens)
        setHiddenTotal(all.filter(h => h.parent_challenge_id === c.id).length)
      }

      const fm = await aggregateFollowOrders(c.id)
      setFollowMain(fm)

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
  }, [id, currentUser])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  function getTotal(c) {
    if (c.id === challenge?.id) {
      return c.gift_quantity + (followMain.acc[c.gift_type] || 0)
    }
    const fh = followHidden[c.id]
    return c.gift_quantity + ((fh && fh.acc[c.gift_type]) || 0)
  }

  const isMain = challenge?.parent_challenge_id == null
  const isMainCreator = currentUser && challenge && challenge.created_by === currentUser.id

  async function checkPerm() {
    const perm = await checkCurrentUserPermission(currentUser)
    if (!perm.allowed) {
      alert(perm.message)
      return false
    }
    return true
  }

  function openFollowForm(c) {
    setFollowTarget(c)
    setShowFollowForm(true)
    setFollowForm({ boss_id: '', gift_type: c.gift_type, gift_quantity: 1 })
  }

  async function submitFollow(e) {
    e.preventDefault()
    if (!followForm.boss_id.trim()) {
      alert('请输入老板ID')
      return
    }
    if (parseInt(followForm.gift_quantity) <= 0) {
      alert('数量必须为正整数')
      return
    }
    setSubmitting(true)
    try {
      const user = currentUser
      await createFollowOrder({
        challenge_id: followTarget.id,
        boss_id: followForm.boss_id.trim(),
        gift_type: followForm.gift_type,
        gift_quantity: parseInt(followForm.gift_quantity),
        created_by: user?.id || null,
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

  function openHiddenForm() {
    setShowHiddenForm(true)
    setHiddenForm({
      boss_id: '',
      title: '',
      condition_desc: '',
      description: '',
      gift_type: '飞机',
      gift_quantity: 1,
    })
  }

  async function submitHidden(e) {
    e.preventDefault()
    if (!hiddenForm.boss_id.trim()) {
      alert('请输入老板ID')
      return
    }
    if (!hiddenForm.title.trim()) {
      alert('请填写任务标题')
      return
    }
    const qty = parseInt(hiddenForm.gift_quantity)
    if (!qty || qty <= 0) {
      alert('数量必须为正整数')
      return
    }
    setSubmitting(true)
    try {
      const user = currentUser
      await createChallenge({
        boss_id: hiddenForm.boss_id.trim(),
        title: hiddenForm.title.trim(),
        description: hiddenForm.description.trim() || null,
        condition_desc: hiddenForm.condition_desc.trim() || null,
        gift_type: hiddenForm.gift_type,
        gift_quantity: qty,
        is_hidden: true,
        parent_challenge_id: challenge.id,
        created_by: user?.id || null,
        status: 'active',
      })
      alert('隐藏任务添加成功！')
      setShowHiddenForm(false)
      await fetchAll()
    } catch (e) {
      console.error(e)
      alert('添加失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComplete() {
    if (!confirm(`确认任务「${challenge.title}」已完成吗？`)) return
    setCompleting(true)
    try {
      await updateChallenge(challenge.id, { status: 'completed' })
      await fetchAll()
    } catch (err) {
      alert('操作失败：' + err.message)
    } finally {
      setCompleting(false)
    }
  }

  async function handleFollowClick(c) {
    if (!currentUser) {
      alert('请先登录后再操作')
      return
    }
    if (await checkPerm()) openFollowForm(c)
  }

  async function handleAddHiddenClick() {
    if (!currentUser) {
      alert('请先登录后再发布隐藏任务')
      return
    }
    if (await checkPerm()) openHiddenForm()
  }

  if (loading) {
    return <Layout><div className="cd-loading">加载中...</div></Layout>
  }
  if (!challenge) {
    return <Layout><div className="cd-loading">任务不存在</div></Layout>
  }

  return (
    <Layout>
      <div className="cd-page">
        <button className="cd-back" onClick={() => navigate(-1)}>← 返回</button>

        <div className="cd-main-card">
          <div className="cd-main-card-border"></div>
          <div className="cd-status-tag">
            {challenge.status === 'active' ? (isMain ? '主任务 · 进行中' : '隐藏任务 · 进行中') : challenge.status === 'completed' ? '已完成' : '已取消'}
          </div>

          <div className="cd-boss-row">
            <div className="cd-boss-avatar">{challenge.boss_id?.charAt(0) || '?'}</div>
            <div>
              <div className="cd-boss-name">{challenge.boss_id}</div>
              <div className="cd-boss-label">{isMain ? '发布老板' : '隐藏任务老板'}</div>
            </div>
          </div>

          <h1 className="cd-title">{challenge.title}</h1>
          {challenge.condition_desc && (
            <div className="cd-condition">条件：{challenge.condition_desc}</div>
          )}
          {challenge.description && (
            <p className="cd-desc">{challenge.description}</p>
          )}

          <div className="cd-gift-box">
            <div className="cd-gift-label">奖励</div>
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
              <div className="cd-section-label">跟单记录 ({followMain.orders.length})</div>
              <div className="cd-follow-items">
                {followMain.orders.map(o => (
                  <span key={o.id} className="cd-follow-chip">
                    {o.boss_id}: {GIFT_ICONS[o.gift_type]} {o.gift_quantity}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="cd-actions">
            <button className="cd-follow-btn" onClick={() => handleFollowClick(challenge)}>
              + 跟单
            </button>
            {isMain && challenge.status === 'active' && currentUser && (
              <button
                className="cd-add-hidden-btn-action"
                onClick={handleAddHiddenClick}
              >
                🎁 + 隐藏任务
              </button>
            )}
            {isMain && isMainCreator && challenge.status === 'active' && (
              <button
                className="cd-complete-btn"
                onClick={handleComplete}
                disabled={completing}
              >
                {completing ? '处理中...' : '✓ 标记完成'}
              </button>
            )}
          </div>
        </div>

        {isMain && currentUser && (isMainCreator || hiddenList.length > 0) && (
          <div className="cd-hidden-section">
            <div className="cd-section-title">
              🎁 隐藏任务 ({isMainCreator ? hiddenTotal : hiddenList.length})
            </div>
            {hiddenList.length === 0 ? (
              <div className="cd-hidden-empty">
                {isMainCreator ? '暂无隐藏任务，点击右上角添加一个吧。' : '暂无你可见的隐藏任务'}
              </div>
            ) : (
              hiddenList.map(h => {
                const fh = followHidden[h.id] || { orders: [], acc: {} }
                return (
                  <div key={h.id} className="cd-hidden-card">
                    <div className="cd-hidden-card-border"></div>
                    <div className="cd-hidden-status">隐藏任务</div>
                    <div className="cd-boss-row small">
                      <div className="cd-boss-avatar small">{h.boss_id?.charAt(0) || '?'}</div>
                      <div>
                        <div className="cd-boss-name">{h.boss_id}</div>
                        <div className="cd-boss-label">老板</div>
                      </div>
                    </div>
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

                    <button className="cd-follow-btn small" onClick={() => handleFollowClick(h)}>
                      + 跟单
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {showFollowForm && (
          <div className="cd-modal-overlay" onClick={() => setShowFollowForm(false)}>
            <div className="cd-modal" onClick={e => e.stopPropagation()}>
              <div className="cd-modal-title">跟单：{followTarget.title}</div>
              <form onSubmit={submitFollow} className="cd-form">
                <label className="cd-form-label">
                  老板ID / 昵称
                  <input
                    className="cd-form-input"
                    type="text"
                    value={followForm.boss_id}
                    onChange={e => setFollowForm({ ...followForm, boss_id: e.target.value })}
                    placeholder="老板ID"
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

        {showHiddenForm && (
          <div className="cd-modal-overlay" onClick={() => setShowHiddenForm(false)}>
            <div className="cd-modal large" onClick={e => e.stopPropagation()}>
              <div className="cd-modal-title">🎁 添加隐藏任务</div>
              <div className="cd-modal-subtitle">关联到：{challenge.title}</div>
              <form onSubmit={submitHidden} className="cd-form">
                <label className="cd-form-label">
                  老板ID / 昵称 <span className="required">*</span>
                  <input
                    className="cd-form-input"
                    type="text"
                    value={hiddenForm.boss_id}
                    onChange={e => setHiddenForm({ ...hiddenForm, boss_id: e.target.value })}
                    placeholder="如：隐藏老板A"
                    required
                  />
                </label>
                <label className="cd-form-label">
                  任务标题 <span className="required">*</span>
                  <input
                    className="cd-form-input"
                    type="text"
                    value={hiddenForm.title}
                    onChange={e => setHiddenForm({ ...hiddenForm, title: e.target.value })}
                    placeholder="如：第二名也有奖"
                    required
                  />
                </label>
                <label className="cd-form-label">
                  任务条件
                  <input
                    className="cd-form-input"
                    type="text"
                    value={hiddenForm.condition_desc}
                    onChange={e => setHiddenForm({ ...hiddenForm, condition_desc: e.target.value })}
                    placeholder="如：第二名"
                  />
                </label>
                <label className="cd-form-label">
                  详细描述
                  <textarea
                    className="cd-form-input"
                    value={hiddenForm.description}
                    onChange={e => setHiddenForm({ ...hiddenForm, description: e.target.value })}
                    rows="2"
                    placeholder="补充说明..."
                  />
                </label>
                <div className="cd-form-row">
                  <label className="cd-form-label">
                    礼物类型
                    <select
                      className="cd-form-input"
                      value={hiddenForm.gift_type}
                      onChange={e => setHiddenForm({ ...hiddenForm, gift_type: e.target.value })}
                    >
                      {GIFT_TYPES.map(t => (
                        <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cd-form-label">
                    数量
                    <input
                      className="cd-form-input"
                      type="number"
                      min="1"
                      step="1"
                      value={hiddenForm.gift_quantity}
                      onChange={e => setHiddenForm({ ...hiddenForm, gift_quantity: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <div className="cd-form-actions">
                  <button type="button" className="cd-btn-secondary" onClick={() => setShowHiddenForm(false)}>
                    取消
                  </button>
                  <button type="submit" className="cd-btn-primary" disabled={submitting}>
                    {submitting ? '添加中...' : '🎁 添加隐藏任务'}
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
