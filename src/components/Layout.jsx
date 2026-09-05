import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getCurrentUser, clearCurrentUser } from '../lib/api'
import LoginModal from './LoginModal'
import '../App.css'

export default function Layout({ children }) {
  const location = useLocation()
  const [currentUser, setUser] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    setUser(getCurrentUser())
  }, [showLogin])

  function handleLogout() {
    if (!confirm('确定要退出登录吗？')) return
    clearCurrentUser()
    setUser(null)
  }

  return (
    <div>
      <header className="app-brand">
        <Link to="/" className="brand-left">
          <div className="brand-logo">
            <span className="brand-logo-text">亿星文化</span>
          </div>
          <div className="brand-title">突围特工队</div>
        </Link>
        <div className="brand-actions">
          <Link
            to="/publish"
            className={`brand-action ${location.pathname === '/publish' ? 'active' : ''}`}
          >
            + 发布挑战
          </Link>
          {currentUser ? (
            <div className="brand-user">
              <div className="brand-user-info">
                <div className="brand-user-nick">
                  {currentUser.douyu_nickname || currentUser.douyu_id}
                  {currentUser.douyu_level > 0 && (
                    <span className="brand-user-lv"> LV{currentUser.douyu_level}</span>
                  )}
                </div>
                {currentUser.is_blacklisted && (
                  <span className="brand-user-banned">已拉黑</span>
                )}
              </div>
              <button className="brand-switch-btn" onClick={() => setShowLogin(true)}>
                切换
              </button>
              <button className="brand-logout-btn" onClick={handleLogout}>
                退出
              </button>
            </div>
          ) : (
            <button className="brand-login-btn" onClick={() => setShowLogin(true)}>
              🔑 登录
            </button>
          )}
        </div>
      </header>

      <main className="app-content">{children}</main>

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={(u) => setUser(u)}
        />
      )}
    </div>
  )
}
