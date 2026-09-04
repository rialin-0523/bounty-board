import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  listStreamers,
  createChallenge,
  getOrCreateBoss,
  GIFT_TYPES,
  GIFT_ICONS,
} from '../lib/api'
import './PublishPage.css'

const emptyForm = {
  boss_douyu_id: '',
  boss_nickname: '',
  streamer_id: '',
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
  const [streamers, setStreamers] = useState([])
  const [mainChallenges, setMainChallenges] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchOptions()
  }, [])

  async function fetchOptions() {
    try {
      const ss = await listStreamers()
      setStreamers(ss)
      // 如果选了隐藏任务，需要拉主任务
      const { listChallenges } = await import('../lib/api')
      const all = await listChallenges()
      setMainChallenges(all.filter(c => c.parent_challenge_id == null))
    } catch (e) {
      console.error(e)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // 校验
    if (!form.boss_douyu_id.trim()) {
      alert('请填写老板斗鱼ID')
      return
    }
    if (!form.streamer_id) {
      alert('请选择目标主播')
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
    if (!form.is_hidden && form.parent_challenge_id) {
      alert('主任务不能关联其他任务')
      return
    }

    setSubmitting(true)
    try {
      const boss = await getOrCreateBoss(
        form.boss_douyu_id.trim(),
        form.boss_nickname.trim() || null
      )
      const payload = {
        streamer_id: form.streamer_id,
        boss_id: boss.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        condition_desc: form.condition_desc.trim() || null,
        gift_type: form.gift_type,
        gift_quantity: qty,
        is_hidden: form.is_hidden,
        parent_challenge_id: form.is_hidden ? form.parent_challenge_id : null,
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
          <div className="publish-success-text">正在跳转到挑战详情...</div>
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
          <p className="publish-subtitle">填好下面信息，挑战会立刻出现在首页</p>

          <form onSubmit={handleSubmit} className="publish-form">
            <fieldset className="publish-section">
              <legend>🏷️ 老板信息</legend>
              <div className="publish-form-row">
                <label>
                  斗鱼ID <span className="required">*</span>
                  <input
                    value={form.boss_douyu_id}
                    onChange={e => setForm({ ...form, boss_douyu_id: e.target.value })}
                    placeholder="请输入你的斗鱼ID"
                    required
                  />
                </label>
                <label>
                  昵称（可选）
                  <input
                    value={form.boss_nickname}
                    onChange={e => setForm({ ...form, boss_nickname: e.target.value })}
                    placeholder="如：大佬A"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="publish-section">
              <legend>🎮 挑战内容</legend>
              <label>
                目标主播 <span className="required">*</span>
                <select
                  value={form.streamer_id}
                  onChange={e => setForm({ ...form, streamer_id: e.target.value })}
                  required
                >
                  <option value="">-- 请选择 --</option>
                  {streamers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nickname} ({s.game_tag} · {s.level})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                挑战类型
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
                      <option key={c.id} value={c.id}>
                        {c.title} ({streamers.find(s => s.id === c.streamer_id)?.nickname || '?'})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                挑战标题 <span className="required">*</span>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="如：套圈挑战赛第3期"
                  required
                />
              </label>

              <label>
                挑战条件
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
                disabled={submitting}
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
