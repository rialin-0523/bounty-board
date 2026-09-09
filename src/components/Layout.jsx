import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import '../App.css'

export default function Layout({ children }) {
  const location = useLocation()
  const { user, signOut } = useAuth()

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
          <Link
            to="/bind"
            className={`brand-action secondary ${location.pathname === '/bind' ? 'active' : ''}`}
          >
            绑定斗鱼
          </Link>
          {user ? (
            <>
              <div className="brand-account">
                <span className="brand-account-dot"></span>
                <span>
                  {user.username || user.douyu_nickname || user.douyu_id}
                  {user.douyu_level > 0 ? ` · LV${user.douyu_level}` : ''}
                  {user.is_blacklisted ? ' · 已拉黑' : ''}
                </span>
              </div>
              <button type="button" className="brand-signout" onClick={signOut}>
                退出
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`brand-action secondary ${location.pathname === '/login' ? 'active' : ''}`}
            >
              登录
            </Link>
          )}
          <div className="brand-season">
            <span className="season-dot"></span>
            <span>突围特工队 / S1</span>
          </div>
        </div>
      </header>

      <main className="app-content">{children}</main>
    </div>
  )
}
