import { useState } from 'react'
import { getOrCreateUser, setCurrentUser } from '../lib/api'
import './LoginModal.css'

export default function LoginModal({ onClose, onLogin }) {
  const [douyuId, setDouyuId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!douyuId.trim()) {
      setError('请输入斗鱼ID')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await getOrCreateUser(douyuId.trim())
      setCurrentUser(user)
      onLogin && onLogin(user)
      onClose()
    } catch (err) {
      console.error(err)
      setError('登录失败：' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={e => e.stopPropagation()}>
        <div className="login-modal-title">🎯 登录</div>
        <p className="login-modal-subtitle">输入你的斗鱼ID 即可登录（自动注册）</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-form-label">
            斗鱼ID
            <input
              className="login-form-input"
              type="text"
              value={douyuId}
              onChange={e => setDouyuId(e.target.value)}
              placeholder="例如：12345 或 abc-xxx"
              autoFocus
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <div className="login-actions">
            <button
              type="button"
              className="login-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="login-btn-primary"
              disabled={submitting}
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </div>
        </form>

        <p className="login-hint">
          💡 首次登录会自动创建账号，昵称和等级默认为空 / 0
        </p>
      </div>
    </div>
  )
}
