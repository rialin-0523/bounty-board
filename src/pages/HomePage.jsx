import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { listStreamers, listMainChallengesWithHidden } from '../lib/api'
import './HomePage.css'

const ALL = '全部'

export default function HomePage() {
  const [streamers, setStreamers] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [gameFilter, setGameFilter] = useState(ALL)
  const [sortBy, setSortBy] = useState('default')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [ss, cs] = await Promise.all([
        listStreamers(),
        listMainChallengesWithHidden(),
      ])
      setStreamers(ss)
      setChallenges(cs)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // 主播收到的主挑战数
  function challengeCountFor(streamerId) {
    return challenges.filter(c => c.streamer_id === streamerId).length
  }

  // 过滤+排序
  let displayList = streamers
  if (gameFilter !== ALL) displayList = displayList.filter(s => s.game_tag === gameFilter)

  if (sortBy === 'rush_coin') {
    displayList = [...displayList].sort((a, b) => (b.rush_coin || 0) - (a.rush_coin || 0))
  } else if (sortBy === 'rush_value') {
    displayList = [...displayList].sort((a, b) => (b.rush_value || 0) - (a.rush_value || 0))
  } else if (sortBy === 'live') {
    displayList = [...displayList].sort((a, b) => (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0))
  }

  const gameOptions = [ALL, ...Array.from(new Set(streamers.map(s => s.game_tag).filter(Boolean)))]

  return (
    <Layout>
      <div className="home-bg">
        <div className="home-bg-stripe"></div>
      </div>

      <div className="home-toolbar">
        <div className="home-filter-tabs">
          {gameOptions.map(tag => (
            <button
              key={tag}
              className={`home-tab ${gameFilter === tag ? 'active' : ''}`}
              onClick={() => setGameFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="home-sort">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="default">默认排序</option>
            <option value="live">直播中优先</option>
            <option value="rush_coin">Rush币</option>
            <option value="rush_value">Rush值</option>
          </select>
        </div>
      </div>

      <div className="home-section-title">全部主播</div>

      <div className="streamers-grid">
        {loading ? (
          <div className="home-loading">加载中...</div>
        ) : displayList.length === 0 ? (
          <div className="home-empty">暂无主播</div>
        ) : (
          displayList.map(s => (
            <Link key={s.id} to="/challenges" className="streamer-card">
              <div className="streamer-card-inner">
                <div className="streamer-card-border"></div>
                <div className="streamer-card-head">
                  <span className="streamer-game-tag">{s.game_tag || '其他'}</span>
                  <span className="streamer-level">{s.level || 'LV0'}</span>
                </div>
                <div className="streamer-avatar-wrap">
                  <div className="streamer-avatar placeholder">
                    {s.nickname?.charAt(0) || '?'}
                  </div>
                  {s.is_live && <span className="streamer-live-badge">直播中</span>}
                </div>
                <div className="streamer-name">{s.nickname}</div>
                <div className="streamer-room">直播间 {s.room_id || '-'}</div>
                <div className="streamer-stats">
                  <div className="streamer-stat">
                    <div className="stat-num">{s.rush_coin || 0}</div>
                    <div className="stat-label">Rush币</div>
                  </div>
                  <div className="streamer-stat">
                    <div className="stat-num">{formatNum(s.rush_value || 0)}</div>
                    <div className="stat-label">Rush值</div>
                  </div>
                </div>
                {challengeCountFor(s.id) > 0 && (
                  <div className="streamer-challenge-count">
                    {challengeCountFor(s.id)} 个挑战
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </Layout>
  )
}

function formatNum(n) {
  return n.toLocaleString('en-US')
}
