import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/useAuth'
import {
  listChallenges,
  createChallenge,
  checkCurrentUserPermission,
  GIFT_TYPES,
  GIFT_ICONS,
} from '../lib/api'
import './PublishPage.css'

const emptyForm = {
  title: '',
  condition_desc: '',
  description: '',
  gift_type: '飞机',
  gift_quantity: 1,
  is_hidden: false,
  parent_challenge_id: '',
}

export default function PublishPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [mainChallenges, setMainChallenges] = useState([])
  const [form, setForm] = useState(emptyForm)
  const bossLabel = currentUser?.username || currentUser?.douyu_nickname || currentUser?.douyu_id || ''
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [permission, setPermission] = useState({ loading: true, allowed: false, message: '' })

  const fetchOptions = useCallback(async () => {
    try {
      const all = await listChallenges()
      setMainChallenges(all.filter(c => c.parent_challenge_id == null))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!currentUser) {
        if (!cancelled) {
          setPermission({ loading: false, allowed: false, message: '请先登录后再发布任务' })
        }
        return
      }
      try {
        const perm = await checkCurrentUserPermission(currentUser)
        if (!cancelled) setPermission({ loading: false, ...perm })
      } catch (err) {
        if (!cancelled) {
          setPermission({ loading: false, allowed: false, message: err.message || '权限检查失败' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser])

  async function handleSubmit(e) {
    e.preventDefault()

    if (!currentUser) {
      alert('请先登录后再发布任务')
      return
    }
    if (!permission.allowed) {
      alert(permission.message || '当前账号暂时无法发布任务')
      return
    }
    if (!bossLabel.trim()) {
      alert('登录后未获取到用户信息，请重新登录')
      return
    }
    if (!form.title.trim()) {
      alert('请填写挑战标题')
      return
    }
    const qty = parseInt(form.gift_quantity)
    if (!qty || qty <= 0) {
      alert('礼物数量必须为正整数')
      return
    }
    if (form.is_hidden && !form.parent_challenge_id) {
      alert('隐藏任务必须关联主任务')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        boss_id: bossLabel.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        condition_desc: form.condition_desc.trim() || null,
        gift_type: form.gift_type,
        gift_quantity: qty,
        is_hidden: form.is_hidden,
        parent_challenge_id: form.is_hidden ? form.parent_challenge_id : null,
        created_by: currentUser?.id || null,
        status: 'active',
      }
      const created = await createChallenge(payload)
      setSuccess(true)
      setTimeout(() => {
        navigate(`/challenges/${created.id}`)
      }, 1200)
    } catch (err) {
      console.error(err)
      alert('发布失败：' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <Layout>
        <div className="publish-success">
          <div className="publish-success-icon">🎯</div>
          <div className="publish-success-title">发布成功！</div>
          <div className="publish-success-text">正在跳转到任务详情...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="publish-page">
        <div className="publish-card">
          <div className="publish-card-border"></div>
          <h1 className="publish-title">发布挑战</h1>
          <p className="publish-subtitle">填好下面信息，任务立刻出现在首页</p>

          {currentUser ? (
            <div className="publish-current-user">
              当前：<strong>{currentUser.douyu_nickname || currentUser.douyu_id || currentUser.username}</strong>
              {currentUser.douyu_level > 0 && <span className="publish-user-lv"> LV{currentUser.douyu_level}</span>}
              {currentUser.is_blacklisted && <span className="publish-user-banned">已拉黑</span>}
            </div>
          ) : (
            <div className="publish-current-user is-warning">
              请先登录后再发布任务。
            </div>
          )}

          {!permission.loading && !permission.allowed && currentUser && (
            <div className="publish-current-user is-warning">{permission.message}</div>
          )}

          <form onSubmit={handleSubmit} className="publish-form">
            <fieldset className="publish-section">
              <legend>🏷️ 老板信息</legend>
              <div className="publish-current-user publish-current-user--fixed">
                <div>
                  当前登录用户：<strong>{bossLabel || '未获取到信息'}</strong>
                </div>
                <div className="publish-current-user-sub">
                  系统会自动使用登录账号信息，不支持手动输入
                </div>
              </div>
            </fieldset>

            <fieldset className="publish-section">
              <legend>🎯 任务内容</legend>
              <label>
                任务类型
                <select
                  value={form.is_hidden ? 'hidden' : 'main'}
                  onChange={e => setForm({ ...form, is_hidden: e.target.value === 'hidden' })}
                >
                  <option value="main">主任务（公开）</option>
                  <option value="hidden">隐藏任务（关联主任务）</option>
                </select>
              </label>

              {form.is_hidden && (
                <label>
                  关联主任务 <span className="required">*</span>
                  <select
                    value={form.parent_challenge_id}
                    onChange={e => setForm({ ...form, parent_challenge_id: e.target.value })}
                    required
                  >
                    <option value="">-- 请选择主任务 --</option>
                    {mainChallenges.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                任务标题 <span className="required">*</span>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="如：套圈挑战赛第3期"
                  required
                />
              </label>

              <label>
                任务条件
                <input
                  value={form.condition_desc}
                  onChange={e => setForm({ ...form, condition_desc: e.target.value })}
                  placeholder="如：套圈数量最多者"
                />
              </label>

              <label>
                详细描述
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows="3"
                  placeholder="补充说明..."
                />
              </label>
            </fieldset>

            <fieldset className="publish-section">
              <legend>🎁 奖励设置</legend>
              <div className="publish-form-row">
                <label>
                  礼物类型 <span className="required">*</span>
                  <select
                    value={form.gift_type}
                    onChange={e => setForm({ ...form, gift_type: e.target.value })}
                    required
                  >
                    {GIFT_TYPES.map(t => (
                      <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  数量 <span className="required">*</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.gift_quantity}
                    onChange={e => setForm({ ...form, gift_quantity: e.target.value })}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <div className="publish-actions">
              <button
                type="button"
                className="publish-btn-secondary"
                onClick={() => navigate(-1)}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="submit"
                className="publish-btn-primary"
                disabled={submitting || !currentUser || !permission.allowed}
              >
                {submitting ? '发布中...' : '🚀 立即发布'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
