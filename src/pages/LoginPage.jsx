import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/useAuth'
import './LoginPage.css'

const emptyForm = {
  username: '',
  password: '',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, signIn } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setNotice('正在登录...')
    try {
      await signIn(form)
      setNotice('登录成功')
      setForm(emptyForm)
      const returnTo = searchParams.get('returnTo')
      navigate(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/')
    } catch (err) {
      setNotice(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="login-page">
        <div className="login-card">
          <div className="login-card-border"></div>
          <div className="login-emblem" aria-hidden="true">令</div>
          <div className="login-kicker">亿星传媒 · 悬赏令</div>
          <h1 className="login-title">欢迎回来</h1>
          <p className="login-heading">用用户名和密码登录</p>
          <p className="login-subtitle">登录后会保持在浏览器里，适合长期使用。</p>

          {user && <div className="login-tip">当前已登录：{user.username}</div>}
          {notice && <div className="login-notice">{notice}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              用户名
              <span className="login-field-label">用户名</span>
              <input
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="请输入用户名"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span className="login-field-label">密码</span>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </label>
            <div className="login-form-actions">
              <button type="button" className="login-secondary-btn" onClick={() => navigate(-1)}>
                返回
              </button>
              <button type="submit" className="login-primary-btn" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          </form>
          <div className="login-register-tip">
            没有账号？<Link to="/bind">绑定斗鱼注册</Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}
