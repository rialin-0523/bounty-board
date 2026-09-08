import { Link } from 'react-router-dom'
import './LoginModal.css'

export default function LoginModal({ onClose }) {
  function handleClose() {
    onClose()
  }

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={e => e.stopPropagation()}>
        <div className="login-modal-title">🎯 账号入口</div>
        <p className="login-modal-subtitle">
          普通用户不能手动输入斗鱼资料；首次使用请先通过弹幕识别绑定斗鱼账号。
        </p>

        <div className="login-actions">
          <button type="button" className="login-btn-secondary" onClick={handleClose}>
            取消
          </button>
          <Link to="/login" className="login-btn-secondary" onClick={handleClose}>
            已绑定，去登录
          </Link>
          <Link to="/bind" className="login-btn-primary" onClick={handleClose}>
            去绑定斗鱼
          </Link>
        </div>

        <p className="login-hint">
          💡 斗鱼 UID、昵称、头像、等级和粉丝牌只允许由绑定接口识别，或由管理员后台修正。
        </p>
      </div>
    </div>
  )
}
