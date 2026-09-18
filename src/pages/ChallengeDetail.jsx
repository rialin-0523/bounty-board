import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/useAuth'
import {
  getChallengeDetail,
  createFollowOrder,
  createChallenge,
  updateChallenge,
  checkCurrentUserPermission,
  GIFT_ICONS,
  GIFT_TYPES,
} from '../lib/api'
import { challengeStatusLabel, formatDateTimeWithWeekday, formatExpiryTime, formatRemainingTime, getChallengeStatus, isChallengeActive } from '../lib/challengeExpiry'
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
  const [followForm, setFollowForm] = useState({ gift_type: '飞机', gift_quantity: 1 })

  // 隐藏任务
  const [showHiddenForm, setShowHiddenForm] = useState(false)
  const [hiddenForm, setHiddenForm] = useState({
    title: '',
    condition_desc: '',
    description: '',
    gift_type: '飞机',
    gift_quantity: 1,
  })

  const [submitting, setSubmitting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await getChallengeDetail(id, { followLimit: 50 })
      const c = detail.challenge
      setChallenge(c)
      setHiddenList(detail.hiddenChallenges || [])
      setHiddenTotal(detail.hiddenTotalCount || 0)
      const mainSummary = c?.follow_summary || detail.followSummary || { count: 0, acc: {} }
      setFollowMain({ orders: detail.followOrders || [], acc: mainSummary.acc || {} })
      const hiddenFollow = {}
      ;(detail.hiddenChallenges || []).forEach(hidden => {
        hiddenFollow[hidden.id] = {
          orders: hidden.follow_orders || [],
          acc: hidden.follow_summary?.acc || {},
        }
      })
      setFollowHidden(hiddenFollow)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  function getTotal(c) {
    if (c.id === challenge?.id) {
      return c.gift_quantity + (followMain.acc[c.gift_type] || 0)
    }
    const fh = followHidden[c.id]
    return c.gift_quantity + ((fh && fh.acc[c.gift_type]) || 0)
  }

  const isMain = challenge?.parent_challenge_id == null
  const isMainCreator = currentUser && challenge && challenge.created_by === currentUser.id
  const currentUserLabel = currentUser?.username || currentUser?.douyu_nickname || currentUser?.douyu_id || ''

  function bossAvatarNode(c, small = false) {
    const src = c?.boss_avatar || c?.created_by_user?.douyu_avatar || ''
    const label = c?.boss_douyu_nickname || c?.created_by_user?.douyu_nickname || c?.boss_id || '老板'
    const className = `cd-boss-avatar${small ? ' small' : ''}`
    if (src && /^https?:\/\//i.test(src)) {
      return <img className={`${className} cd-boss-avatar-img`} src={src} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    }
    return <div className={className}>{label?.charAt(0) || '?'}</div>
  }

  async function checkPerm() {
    const perm = await checkCurrentUserPermission(currentUser)
    if (!perm.allowed) {
      alert(perm.message)
      return false
    }
    return true
  }

  function openFollowForm(c) {
    if (!isChallengeActive(c, now)) {
      alert('任务已结束或到期，不能跟单')
      return
    }
    setFollowTarget(c)
    setShowFollowForm(true)
    setFollowForm({ gift_type: c.gift_type, gift_quantity: 1 })
  }

  async function submitFollow(e) {
    e.preventDefault()
    if (!currentUserLabel.trim()) {
      alert('登录后未获取到用户信息，请重新登录')
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
        boss_id: currentUserLabel.trim(),
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
    if (!isChallengeActive(challenge, now)) {
      alert('主任务已结束或到期，不能添加隐藏任务')
      return
    }
    setShowHiddenForm(true)
    setHiddenForm({
      title: '',
      condition_desc: '',
      description: '',
      gift_type: '飞机',
      gift_quantity: 1,
    })
  }

  async function submitHidden(e) {
    e.preventDefault()
    if (!currentUserLabel.trim()) {
      alert('登录后未获取到用户信息，请重新登录')
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
        boss_id: currentUserLabel.trim(),
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
    if (!isChallengeActive(challenge, now)) {
      alert('任务已结束或到期，不能标记完成')
      return
    }
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
  const challengeStatus = getChallengeStatus(challenge, now)

  return (
    <Layout>
      <div className="cd-page">
        <button className="cd-back" onClick={() => navigate(-1)}>← 返回</button>

        <div className="cd-main-card">
          <div className="cd-main-card-border"></div>
          <div className={`cd-status-tag cd-status-${challengeStatus}`}>
            {isMain ? '主任务 · ' : '隐藏任务 · '}{challengeStatusLabel(challengeStatus)}
          </div>
          <div className={`cd-expiry ${challengeStatus === 'expired' ? 'is-expired' : ''}`}>
            {challengeStatus === 'active' ? `⏳ ${formatRemainingTime(challenge.expires_at, now)}（${formatExpiryTime(challenge.expires_at)} 到期）` : challengeStatus === 'expired' ? '⌛ 任务已到期，不能再跟单或添加隐藏任务' : `有效期：${challenge.validity_hours || 3}小时`}
          </div>

          <div className="cd-boss-row">
            {bossAvatarNode(challenge)}
            <div>
              <div className="cd-boss-name">{challenge.boss_id}</div>
              <div className="cd-boss-label">
                {isMain ? '发布老板' : '隐藏任务老板'}{challenge.boss_douyu_level != null ? ` · LV${challenge.boss_douyu_level}` : ''}
              </div>
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
                  <div key={o.id} className="cd-follow-chip">
                    <span>{o.boss_id}: {GIFT_ICONS[o.gift_type]} {o.gift_quantity}</span>
                    <small>{formatDateTimeWithWeekday(o.created_at)}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="cd-actions">
            <button className="cd-follow-btn" onClick={() => handleFollowClick(challenge)} disabled={challengeStatus !== 'active'}>
              {challengeStatus === 'active' ? '+ 跟单' : '任务已结束'}
            </button>
            {isMain && challengeStatus === 'active' && currentUser && (
              <button
                className="cd-add-hidden-btn-action"
                onClick={handleAddHiddenClick}
              >
                🎁 + 隐藏任务
              </button>
            )}
            {isMain && isMainCreator && challengeStatus === 'active' && (
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
                const hiddenStatus = getChallengeStatus(h, now)
                return (
                  <div key={h.id} className="cd-hidden-card">
                    <div className="cd-hidden-card-border"></div>
                    <div className="cd-hidden-status">隐藏任务 · {challengeStatusLabel(hiddenStatus)}</div>
                    <div className="cd-hidden-expiry">{hiddenStatus === 'active' ? formatRemainingTime(h.expires_at, now) : hiddenStatus === 'expired' ? '已到期' : `有效期：${h.validity_hours || 3}小时`}</div>
                    <div className="cd-boss-row small">
                      {bossAvatarNode(h, true)}
                      <div>
                        <div className="cd-boss-name">{h.boss_id}</div>
                        <div className="cd-boss-label">老板{h.boss_douyu_level != null ? ` · LV${h.boss_douyu_level}` : ''}</div>
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

                    {fh.orders.length > 0 && (
                      <div className="cd-hidden-follow-list">
                        <div className="cd-section-label">跟单记录 ({fh.orders.length})</div>
                        <div className="cd-follow-items">
                          {fh.orders.map(o => (
                            <div key={o.id} className="cd-follow-chip">
                              <span>{o.boss_id}: {GIFT_ICONS[o.gift_type]} {o.gift_quantity}</span>
                              <small>{formatDateTimeWithWeekday(o.created_at)}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className="cd-follow-btn small" onClick={() => handleFollowClick(h)} disabled={hiddenStatus !== 'active'}>
                      {hiddenStatus === 'active' ? '+ 跟单' : '任务已结束'}
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
                <div className="cd-current-user-box">
                  <div>当前跟单用户：<strong>{currentUserLabel || '未获取到信息'}</strong></div>
                  <small>系统会自动使用登录账号信息，不支持手动输入。</small>
                </div>
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
                <div className="cd-current-user-box">
                  <div>当前发布用户：<strong>{currentUserLabel || '未获取到信息'}</strong></div>
                  <small>系统会自动使用登录账号信息，不支持手动输入。</small>
                </div>
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
