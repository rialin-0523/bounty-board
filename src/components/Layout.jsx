import { Link, useLocation } from 'react-router-dom'
import '../App.css'

export default function Layout({ children }) {
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  return (
    <div>
      <header className="app-brand">
        <div className="brand-left">
          <div className="brand-logo">
            <span className="brand-logo-text">亿星文化</span>
          </div>
          <div className="brand-title">突围特工队</div>
        </div>
        <div className="brand-season">
          <span className="season-dot"></span>
          <span>突围特工队 / S1</span>
        </div>
      </header>

      <main className="app-content">{children}</main>

      <nav className="app-nav">
        <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <span className="nav-icon">🏠</span>
          <span className="nav-label">首页</span>
        </Link>
        <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <span className="nav-icon">🎮</span>
          <span className="nav-label">主播</span>
        </Link>
        <Link to="/challenges" className={`nav-item ${isActive('/challenges') ? 'active' : ''}`}>
          <span className="nav-icon">🏆</span>
          <span className="nav-label">榜单</span>
        </Link>
        <Link to="/admin" className="nav-item">
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">后台</span>
        </Link>
      </nav>
    </div>
  )
}
