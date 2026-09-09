import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { completeBindSession, getBindSession, startBindSession } from '../lib/authApi'
import { useAuth } from '../context/useAuth'
import './BindDouyuPage.css'

const LOCAL_SESSION_KEY = 'bounty_bind_session_id'

const emptyForm = {
  username: '',
  password: '',
  passwordConfirm: '',
}

function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN')
}

export default function BindDouyuPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(LOCAL_SESSION_KEY) || '')
  const [bind, setBind] = useState(null)
  const [loading, setLoading] = useState(Boolean(sessionId))
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('点击按钮开始绑定流程。')
  const [nowTs, setNowTs] = useState(() => Date.now())

  const fetchBind = useCallback(async (id, quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await getBindSession(id)
      setBind(data.bind)
      if (data.bind?.status === 'matched') {
        setNotice('已检测到弹幕命中，可以设置用户名和密码了。')
      } else if (data.bind?.status === 'completed') {
        setNotice('绑定已完成。')
      } else if (data.bind?.status === 'expired') {
        setNotice('这个识别码已经过期，请重新生成。')
      }
    } catch (err) {
      setNotice(err.message)
      setBind(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBind(sessionId)
    const timer = setInterval(() => fetchBind(sessionId, true), 2000)
    return () => clearInterval(timer)
  }, [sessionId, fetchBind])

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const matched = bind?.status === 'matched' || bind?.status === 'completed'
  const expired = bind?.status === 'expired'
  const canComplete = bind?.status === 'matched' && !expired && !bind?.completedAt
  const code = bind?.code || ''
  const secondsLeft = bind?.expiresAt ? Math.max(0, Math.ceil((new Date(bind.expiresAt).getTime() - nowTs) / 1000)) : null

  async function handleCreate() {
    setCreating(true)
    setNotice('正在生成识别码...')
    try {
      const data = await startBindSession()
      setSessionId(data.bind.id)
      localStorage.setItem(LOCAL_SESSION_KEY, data.bind.id)
      setBind(data.bind)
      setNotice('识别码已生成，请把它发到指定直播间弹幕里。')
    } catch (err) {
      setNotice(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sessionId) return
    if (form.password !== form.passwordConfirm) {
      setNotice('两次输入的密码不一致。')
      return
    }
    setSubmitting(true)
    try {
      const data = await completeBindSession(sessionId, form)
      localStorage.removeItem(LOCAL_SESSION_KEY)
      setNotice('绑定成功，正在刷新登录状态...')
      setForm(emptyForm)
      setBind(data.bind)
      await refreshUser()
      navigate('/')
    } catch (err) {
      setNotice(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="bind-page">
        <div className="bind-card">
          <div className="bind-card-border"></div>
          <div className="bind-head">
            <div>
              <div className="bind-kicker">斗鱼账号绑定</div>
              <h1 className="bind-title">用弹幕识别你的斗鱼账号</h1>
              <p className="bind-subtitle">生成 2 分钟有效的 6 位识别码，发送到指定直播间后自动识别账号资料。</p>
            </div>
            <button className="bind-create-btn" onClick={handleCreate} disabled={creating}>
              {creating ? '生成中...' : sessionId ? '重新生成识别码' : '生成识别码'}
            </button>
          </div>

          <div className="bind-status">{notice}</div>

          {sessionId && (
            <div className="bind-session">
              <div className="bind-code-box">
                <div className="bind-code-label">识别码</div>
                <div className={`bind-code ${expired ? 'is-expired' : matched ? 'is-matched' : ''}`}>{code || '等待生成'}</div>
                <div className="bind-code-meta">
                  {bind?.roomId ? `监听直播间：${bind.roomId}` : '监听直播间：--'}
                  {secondsLeft !== null ? ` · 剩余 ${secondsLeft}s` : ''}
                </div>
              </div>

              <div className="bind-steps">
                <div className="bind-step">1. 点击生成识别码。</div>
                <div className="bind-step">2. 用你的斗鱼账号把这个码原样发到指定直播间。</div>
                <div className="bind-step">3. 命中后补用户名和密码完成绑定。</div>
              </div>

              {matched && bind?.profile && (
                <div className="bind-profile-card">
                  <div className="bind-profile-row">
                    {bind.profile.avatar && bind.profile.avatar.startsWith('http') ? (
                      <img className="bind-avatar" src={bind.profile.avatar} alt="斗鱼头像" loading="lazy" decoding="async" />
                    ) : (
                      <div className="bind-avatar placeholder">?</div>
                    )}
                    <div>
                      <div className="bind-profile-name">{bind.profile.name || '未知昵称'}</div>
                      <div className="bind-profile-meta">
                        UID：{bind.profile.uid || '--'} · 等级：{bind.profile.level ?? '--'} · 粉丝牌：{bind.profile.badgeName || '--'} {bind.profile.badgeLevel ? `${bind.profile.badgeLevel}级` : ''}
                      </div>
                      <div className="bind-profile-meta">识别时间：{formatTime(bind.matchedAt)}</div>
                    </div>
                  </div>
                </div>
              )}

              {canComplete && (
                <form className="bind-form" onSubmit={handleSubmit}>
                  <label>
                    用户名
                    <input
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder="只允许中英文"
                      required
                    />
                  </label>
                  <label>
                    密码
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="8 位以上，含字母和数字"
                      required
                    />
                  </label>
                  <label>
                    再输一次密码
                    <input
                      type="password"
                      value={form.passwordConfirm}
                      onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
                      placeholder="再输入一次密码"
                      required
                    />
                  </label>
                  <div className="bind-form-actions">
                    <button type="button" className="bind-secondary-btn" onClick={() => navigate(-1)}>
                      取消
                    </button>
                    <button type="submit" className="bind-primary-btn" disabled={submitting}>
                      {submitting ? '提交中...' : '完成绑定并登录'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {loading && <div className="bind-loading">正在读取绑定状态...</div>}
        </div>
      </div>
    </Layout>
  )
}
