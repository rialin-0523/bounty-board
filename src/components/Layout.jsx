import { Link, useLocation } from 'react-router-dom'
import '../App.css'

export default function Layout({ children }) {
  const location = useLocation()
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
