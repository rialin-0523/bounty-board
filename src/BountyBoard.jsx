import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, X, Clock } from 'lucide-react'
import { supabase } from './lib/supabase'
import './BountyBoard.css'

const statusMap = {
  寻好汉: { label: '寻好汉', bg: 'bg-amber-600', text: 'text-amber-100' },
  已揭榜: { label: '已揭榜', bg: 'bg-sky-700', text: 'text-sky-100' },
  来领赏: { label: '来领赏', bg: 'bg-emerald-700', text: 'text-emerald-100' },
  收榜: { label: '收榜', bg: 'bg-stone-500', text: 'text-stone-100' },
}

const typeMap = {
  独行赏: { short: '独', full: '独行赏', icon: '🗡' },
  群英令: { short: '群', full: '群英令', icon: '⚔' },
}

const generateAvatar = (name) => {
  const colors = ['#7f1d1d', '#78350f', '#365314', '#134e4a', '#1e3a5f', '#4c1d95', '#701a75', '#3b0764', '#1c1917']
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const color = colors[hash % colors.length]
  const initial = name.charAt(0)
  return { color, initial }
}

function BountyBoard() {
  const [tasks, setTasks] = useState([])
  const [hunters, setHunters] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [filterStatus, setFilterStatus] = useState('全部')
  const [filterAcceptor, setFilterAcceptor] = useState('全部')
  const [filterType, setFilterType] = useState('全部')
  const [searchText, setSearchText] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [tasksRes, huntersRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('hunters').select('*')
    ])
    if (tasksRes.data) setTasks(tasksRes.data)
    if (huntersRes.data) setHunters(huntersRes.data)
    setLoading(false)
  }

  const getHunterName = (id) => {
    const hunter = hunters.find(h => h.id === id)
    return hunter ? hunter.nickname : '未知'
  }

  const getHunterAvatar = (id) => {
    const hunter = hunters.find(h => h.id === id)
    return hunter ? generateAvatar(hunter.nickname) : generateAvatar('?')
  }

  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== '全部' && t.status !== filterStatus) return false
    if (filterAcceptor !== '全部' && t.hunters_id !== filterAcceptor) return false
    if (filterType !== '全部' && t.task_type !== filterType) return false
    if (searchText && !t.description?.includes(searchText) && !t.poster_nickname?.includes(searchText)) return false
    return true
  })

  const activeFilterCount = [filterStatus, filterAcceptor, filterType].filter(f => f !== '全部').length

  const CompactCard = ({ task }) => {
    const avatar = generateAvatar(task.poster_nickname)
    const status = statusMap[task.status] || statusMap['寻好汉']
    const type = typeMap[task.task_type] || typeMap['独行赏']

    return (
      <motion.div
        whileHover={{ scale: 1.03, y: -3 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setSelectedTask(task)}
        className="compact-card"
      >
        <div className="card-inner">
          <div className="card-border"></div>
          <div className="card-content">
            <div className="card-header">
              <span className="card-title-decoration">━ 悬赏 ━</span>
            </div>
            <div className="card-status-row">
              <span className={`status-badge ${task.status}`}>{status.label}</span>
              <span className="card-type">{type.short}</span>
            </div>
            <div className="card-avatar-section">
              {task.poster_avatar_url ? (
                <img className="card-avatar-img" src={task.poster_avatar_url} alt={task.poster_nickname} />
              ) : (
                <div className="card-avatar">{avatar.initial}</div>
              )}
              <div className="card-poster-name">{task.poster_nickname}</div>
            </div>
            <div className="card-description">{task.description}</div>
            <div className="card-bounty">{task.bounty}</div>
          </div>
        </div>
      </motion.div>
    )
  }

  const DetailModal = ({ task, onClose }) => {
    const avatar = generateAvatar(task.poster_nickname)
    const status = statusMap[task.status] || statusMap['寻好汉']
    const type = typeMap[task.task_type] || typeMap['独行赏']
    const hunter = task.hunters_id ? hunters.find(h => h.id === task.hunters_id) : null

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-overlay"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 280 }}
          onClick={e => e.stopPropagation()}
          className="modal-content"
        >
          <div className="modal-border"></div>
          <div className="modal-handle"></div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>

          <div className="modal-inner">
            <div className="modal-title-section">
              <div className="modal-main-title">悬 赏 令</div>
              <div className="modal-title-line"></div>
              <div className="modal-title-line"></div>
            </div>

            <div className="modal-status-row">
              <span className={`status-badge ${task.status}`}>{status.label}</span>
              <span className="modal-type">{type.icon} {type.full}</span>
            </div>

            <div className="modal-avatar-section">
              {task.poster_avatar_url ? (
                <img className="modal-avatar-img" src={task.poster_avatar_url} alt={task.poster_nickname} />
              ) : (
                <div className="modal-avatar">{avatar.initial}</div>
              )}
              <div className="modal-poster-name">{task.poster_nickname}</div>
              <div className="modal-poster-label">出 榜 人</div>
            </div>

            <div className="modal-task-section">
              <div className="section-label">任务详情</div>
              <p className="task-text">{task.description}</p>
            </div>

            <div className="modal-bounty-section">
              <div className="bounty-label">赏 金</div>
              <div className="bounty-amount">{task.bounty}</div>
            </div>

            {hunter && (
              <div className="modal-hunter-section">
                <div className="section-label">揭 榜 人</div>
                <div className="hunter-list">
                  <span className="hunter-item">
                    <span className="hunter-avatar" style={{ backgroundColor: getHunterAvatar(hunter.id).color }}>
                      {getHunterAvatar(hunter.id).initial}
                    </span>
                    <span className="hunter-name">{hunter.nickname}</span>
                  </span>
                </div>
              </div>
            )}

            <div className="modal-time">
              <Clock size={11} />
              <span>{new Date(task.created_at).toLocaleString('zh-CN')} 张贴于此</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <div className="bounty-board">
      <header className="board-header">
        <div className="header-glow"></div>
        <div className="header-content">
          <h1 className="board-title">江 湖 悬 赏 榜</h1>
          <div className="header-divider">
            <div className="divider-line"></div>
            <span className="divider-icon">⚔</span>
            <div className="divider-line"></div>
          </div>
        </div>
      </header>

      <div className="board-container">
        <div className="filter-section">
          <div className="filter-row">
            <div className="search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="搜索悬赏令..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="search-input"
              />
            </div>
            <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={14} />
              {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </button>
            <div className="desktop-filters">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="filter-select">
                <option value="全部">全部状态</option>
                <option value="寻好汉">寻好汉</option>
                <option value="已揭榜">已揭榜</option>
                <option value="来领赏">来领赏</option>
                <option value="收榜">收榜</option>
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
                <option value="全部">全部类型</option>
                <option value="群英令">群英令</option>
                <option value="独行赏">独行赏</option>
              </select>
              <select value={filterAcceptor} onChange={e => setFilterAcceptor(e.target.value)} className="filter-select">
                <option value="全部">全部揭榜人</option>
                {hunters.map(h => <option key={h.id} value={h.id}>{h.nickname}</option>)}
              </select>
            </div>
          </div>
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mobile-filters"
              >
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="filter-select">
                  <option value="全部">全部状态</option>
                  <option value="寻好汉">寻好汉</option>
                  <option value="已揭榜">已揭榜</option>
                  <option value="来领赏">来领赏</option>
                  <option value="收榜">收榜</option>
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
                  <option value="全部">全部类型</option>
                  <option value="群英令">群英令</option>
                  <option value="独行赏">独行赏</option>
                </select>
                <select value={filterAcceptor} onChange={e => setFilterAcceptor(e.target.value)} className="filter-select">
                  <option value="全部">全部揭榜人</option>
                  {hunters.map(h => <option key={h.id} value={h.id}>{h.nickname}</option>)}
                </select>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setFilterStatus('全部'); setFilterType('全部'); setFilterAcceptor('全部') }} className="clear-filters">
                    清除筛选
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="results-info">
          <span className="results-count">当前共 {filteredTasks.length} 道悬赏</span>
          <div className="legend">
            <span><span className="legend-dot amber"></span>寻好汉</span>
            <span><span className="legend-dot sky"></span>已揭榜</span>
            <span><span className="legend-dot emerald"></span>来领赏</span>
            <span><span className="legend-dot stone"></span>收榜</span>
          </div>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚔</div>
            <div className="empty-text">天下太平，暂无悬赏</div>
            <div className="empty-hint">换个条件再看看？</div>
          </div>
        ) : (
          <div className="cards-grid">
            {filteredTasks.map(task => (
              <CompactCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTask && (
          <DetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

export default BountyBoard