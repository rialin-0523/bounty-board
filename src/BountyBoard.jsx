import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './BountyBoard.css'

const statusLabels = {
  寻好汉: { text: '寻好汉', color: '#8B4513' },
  已揭榜: { text: '已揭榜', color: '#CD853F' },
  来领赏: { text: '来领赏', color: '#228B22' },
  收榜: { text: '收榜', color: '#696969' }
}

const typeLabels = {
  群英令: '群英令',
  独行赏: '独行赏'
}

function BountyCard({ task, hunters }) {
  const hunter = hunters.find(h => h.id === task.hunters_id)
  const statusInfo = statusLabels[task.status] || statusLabels['寻好汉']

  return (
    <div className="bounty-card">
      {/* 顶部标题 */}
      <div className="poster-header">
        <h2>賞金令</h2>
      </div>

      {/* 官方印章 */}
      <div className="seal seal-top"></div>
      <div className="seal seal-bottom"></div>

      {/* 出榜人信息 */}
      <div className="poster-section">
        <div className="poster-avatar">
          {task.poster_avatar_url ? (
            <img src={task.poster_avatar_url} alt={task.poster_nickname} />
          ) : (
            <div className="avatar-placeholder">賞</div>
          )}
        </div>
        <div className="poster-info">
          <span className="poster-label">出榜人</span>
          <span className="poster-name">{task.poster_nickname}</span>
        </div>
      </div>

      {/* 任务内容 */}
      <div className="bounty-content">
        <p className="bounty-desc">{task.description}</p>
      </div>

      {/* 赏金 */}
      <div className="bounty-reward">
        <span className="reward-label">賞金</span>
        <span className="reward-amount">{task.bounty}</span>
      </div>

      {/* 底部信息 */}
      <div className="bounty-footer">
        <div className="footer-left">
          <span className={`status-badge ${task.status}`}>
            {statusInfo.text}
          </span>
          <span className={`type-badge ${task.task_type}`}>
            {typeLabels[task.task_type]}
          </span>
        </div>
        <div className="footer-right">
          {hunter && (
            <div className="hunter-info">
              <span className="hunter-label">揭榜人</span>
              <div className="hunter-avatar">
                {hunter.avatar_url ? (
                  <img src={hunter.avatar_url} alt={hunter.nickname} />
                ) : (
                  <div className="avatar-placeholder">侠</div>
                )}
              </div>
              <span className="hunter-name">{hunter.nickname}</span>
            </div>
          )}
        </div>
      </div>

      {/* 发布时间 */}
      <div className="bounty-time">
        {new Date(task.created_at).toLocaleDateString('zh-CN')}
      </div>
    </div>
  )
}

function BountyBoard() {
  const [tasks, setTasks] = useState([])
  const [hunters, setHunters] = useState([])
  const [filter, setFilter] = useState('全部')
  const [hunterFilter, setHunterFilter] = useState('全部')
  const [typeFilter, setTypeFilter] = useState('全部')
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

  function handleSearch() {
    fetchData()
  }

  const filteredTasks = tasks.filter(task => {
    if (filter !== '全部' && task.status !== filter) return false
    if (hunterFilter !== '全部' && task.hunters_id !== hunterFilter) return false
    if (typeFilter !== '全部' && task.task_type !== typeFilter) return false
    return true
  })

  return (
    <div className="bounty-board">
      <h1 className="board-title">賞金令</h1>

      {/* 筛选栏 - 一排展示 */}
      <div className="filters">
        <div className="filter-group">
          <label>状态</label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="全部">全部</option>
            <option value="寻好汉">寻好汉</option>
            <option value="已揭榜">已揭榜</option>
            <option value="来领赏">来领赏</option>
            <option value="收榜">收榜</option>
          </select>
        </div>

        <div className="filter-group">
          <label>揭榜人</label>
          <select value={hunterFilter} onChange={e => setHunterFilter(e.target.value)}>
            <option value="全部">全部</option>
            {hunters.map(h => (
              <option key={h.id} value={h.id}>{h.nickname}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>类型</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="全部">全部</option>
            <option value="群英令">群英令</option>
            <option value="独行赏">独行赏</option>
          </select>
        </div>

        <button className="search-btn" onClick={handleSearch}>查询</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="empty">暂无賞金令</div>
      ) : (
        <div className="bounty-grid">
          {filteredTasks.map(task => (
            <BountyCard key={task.id} task={task} hunters={hunters} />
          ))}
        </div>
      )}
    </div>
  )
}

export default BountyBoard