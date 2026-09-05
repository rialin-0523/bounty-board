import { useCallback, useEffect, useState, Fragment } from 'react'
import {
  listMainChallengesWithHidden,
  listChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  listFollowOrders,
  createFollowOrder,
  deleteFollowOrder,
  listUsers,
  blacklistUser,
  deleteUser,
  getSetting,
  setSetting,
  GIFT_TYPES,
  GIFT_ICONS,
} from './lib/api'
import './Admin.css'

const ADMIN_USERNAME = 'yjw1018594399'
const ADMIN_PASSWORD = '13142@yjW'
const ADMIN_SESSION_KEY = 'bounty_admin_authed'

const emptyChallenge = {
  boss_id: '',
  title: '',
  description: '',
  condition_desc: '',
  gift_type: '飞机',
  gift_quantity: 1,
  status: 'active',
}

const emptyFollow = {
  challenge_id: '',
  boss_id: '',
  gift_type: '飞机',
  gift_quantity: 1,
}

function Admin() {
  const [authenticated, setAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(ADMIN_SESSION_KEY) === '1'
  })
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState('challenges')
  const [challenges, setChallenges] = useState([])
  const [allChallenges, setAllChallenges] = useState([])
  const [followOrders, setFollowOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')

  const [minLevel, setMinLevel] = useState(0)
  const [savingSetting, setSavingSetting] = useState(false)

  const [challengeForm, setChallengeForm] = useState(emptyChallenge)
  const [editingChallenge, setEditingChallenge] = useState(null)
  const [followForm, setFollowForm] = useState(emptyFollow)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (authenticated) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, '1')
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_KEY)
    }
  }, [authenticated])

  const loadAllFollowOrders = useCallback(async () => {
    const all = await listChallenges()
    const all2 = []
    for (const c of all) {
      const os = await listFollowOrders(c.id)
      os.forEach(o => all2.push({ ...o, challenge_title: c.title }))
    }
    return all2
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cs, allC, fos, us, ml] = await Promise.all([
        listMainChallengesWithHidden({ showAllHidden: true }),
        listChallenges(),
        loadAllFollowOrders(),
        listUsers(),
        getSetting('min_douyu_level', 0),
      ])
      setChallenges(cs)
      setAllChallenges(allC)
      setFollowOrders(fos)
      setUsers(us)
      setMinLevel(Number(ml) || 0)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }, [loadAllFollowOrders])

  const searchUsers = useCallback(async (q) => {
    setUserSearch(q)
    try {
      const us = await listUsers({ search: q.trim() || null })
      setUsers(us)
    } catch (e) {
      console.error(e)
    }
  }, [])

  function handleLogin(e) {
    e.preventDefault()
    if (account.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      fetchData()
    } else {
      alert('账号或密码错误')
    }
  }

  function handleLogout() {
    setAuthenticated(false)
    setAccount('')
    setPassword('')
    setLoading(true)
    setChallenges([])
    setAllChallenges([])
    setFollowOrders([])
    setUsers([])
  }

  async function handleChallengeSubmit(e) {
    e.preventDefault()
    if (!challengeForm.boss_id.trim()) {
      alert('请填写老板ID')
      return
    }
    if (parseInt(challengeForm.gift_quantity) <= 0) {
      alert('礼物数量必须为正整数')
      return
    }
    try {
      const payload = {
        boss_id: challengeForm.boss_id.trim(),
        title: challengeForm.title,
        description: challengeForm.description || null,
        condition_desc: challengeForm.condition_desc || null,
        gift_type: challengeForm.gift_type,
        gift_quantity: parseInt(challengeForm.gift_quantity),
        is_hidden: false,
        parent_challenge_id: null,
        created_by: null,
        status: challengeForm.status,
      }
      if (editingChallenge) {
        await updateChallenge(editingChallenge.id, payload)
        alert('更新成功')
      } else {
        await createChallenge(payload)
        alert('创建成功')
      }
      setChallengeForm(emptyChallenge)
      setEditingChallenge(null)
      fetchData()
    } catch (err) {
      alert('操作失败：' + err.message)
    }
  }

  function editChallenge(c) {
    setChallengeForm({
      ...emptyChallenge,
      ...c,
    })
    setEditingChallenge(c)
  }

  async function handleChallengeDelete(id) {
    if (!confirm('确定删除该任务？隐藏任务和跟单也会被删除。')) return
    try {
      await deleteChallenge(id)
      fetchData()
    } catch (err) {
      alert('删除失败：' + err.message)
    }
  }

  async function handleFollowSubmit(e) {
    e.preventDefault()
    if (parseInt(followForm.gift_quantity) <= 0) {
      alert('数量必须为正整数')
      return
    }
    if (!followForm.challenge_id) {
      alert('请选择任务')
      return
    }
    try {
      await createFollowOrder({
        challenge_id: followForm.challenge_id,
        boss_id: followForm.boss_id.trim(),
        gift_type: followForm.gift_type,
        gift_quantity: parseInt(followForm.gift_quantity),
        created_by: null,
      })
      alert('跟单成功')
      setFollowForm(emptyFollow)
      fetchData()
    } catch (err) {
      alert('操作失败：' + err.message)
    }
  }

  async function handleFollowDelete(id) {
    if (!confirm('确定删除此跟单？')) return
    try {
      await deleteFollowOrder(id)
      fetchData()
    } catch (err) {
      alert('删除失败：' + err.message)
    }
  }

  async function toggleBlacklist(u) {
    try {
      await blacklistUser(u.id, !u.is_blacklisted)
      await fetchData()
    } catch (err) {
      alert('操作失败：' + err.message)
    }
  }

  async function handleDeleteUser(u) {
    if (!confirm(`确定删除用户 ${u.douyu_id || u.douyu_uid || u.username}？`)) return
    try {
      await deleteUser(u.id)
      await fetchData()
    } catch (err) {
      alert('删除失败：' + err.message)
    }
  }

  async function saveMinLevel() {
    setSavingSetting(true)
    try {
      await setSetting('min_douyu_level', parseInt(minLevel) || 0)
      alert('保存成功')
    } catch (err) {
      alert('保存失败：' + err.message)
    } finally {
      setSavingSetting(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="admin-login">
        <form className="admin-login-form" onSubmit={handleLogin}>
          <h2>超级管理员登录</h2>
          <input
            type="text"
            placeholder="管理员账号"
            value={account}
            onChange={e => setAccount(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button type="submit">进入后台</button>
        </form>
      </div>
    )
  }

  if (loading) {
    return <div className="admin-loading">加载中...</div>
  }

  return (
    <div className="admin">
      <h1 className="admin-title">突围特工队 · 后台管理</h1>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button type="button" className="admin-btn-secondary" onClick={handleLogout}>退出管理员</button>
      </div>
      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'challenges' ? 'active' : ''}`} onClick={() => setActiveTab('challenges')}>
          任务管理
        </button>
        <button className={`admin-tab ${activeTab === 'follows' ? 'active' : ''}`} onClick={() => setActiveTab('follows')}>
          跟单管理
        </button>
        <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          用户管理 ({users.length})
        </button>
        <button className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          配置管理
        </button>
      </div>

      {activeTab === 'challenges' && (
        <div className="admin-panel">
          <form className="admin-form" onSubmit={handleChallengeSubmit}>
            <h3>{editingChallenge ? '编辑任务' : '新建主任务'}</h3>
            <label>老板ID
              <input value={challengeForm.boss_id} onChange={e => setChallengeForm({ ...challengeForm, boss_id: e.target.value })} required />
            </label>
            <label>标题
              <input value={challengeForm.title} onChange={e => setChallengeForm({ ...challengeForm, title: e.target.value })} required />
            </label>
            <label>任务类型
              <select value="main" disabled>
                <option value="main">主任务</option>
              </select>
            </label>
            <label>条件描述
              <input value={challengeForm.condition_desc} onChange={e => setChallengeForm({ ...challengeForm, condition_desc: e.target.value })} />
            </label>
            <label>任务描述
              <textarea rows="3" value={challengeForm.description} onChange={e => setChallengeForm({ ...challengeForm, description: e.target.value })} />
            </label>
            <div className="admin-form-row">
              <label>礼物类型
                <select value={challengeForm.gift_type} onChange={e => setChallengeForm({ ...challengeForm, gift_type: e.target.value })}>
                  {GIFT_TYPES.map(t => <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>)}
                </select>
              </label>
              <label>数量
                <input type="number" min="1" step="1" value={challengeForm.gift_quantity} onChange={e => setChallengeForm({ ...challengeForm, gift_quantity: e.target.value })} required />
              </label>
            </div>
            <div className="admin-form-row">
              <label>状态
                <select value={challengeForm.status} onChange={e => setChallengeForm({ ...challengeForm, status: e.target.value })}>
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </label>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary">{editingChallenge ? '保存' : '创建'}</button>
              {editingChallenge && <button type="button" className="admin-btn-secondary" onClick={() => { setChallengeForm(emptyChallenge); setEditingChallenge(null) }}>取消</button>}
            </div>
          </form>

          <div className="admin-list">
            <h3>任务列表</h3>
            {challenges.length === 0 ? <div className="admin-empty">暂无任务</div> : (
              <table>
                <thead>
                  <tr>
                    <th>老板</th><th>标题</th><th>类型</th><th>礼物</th><th>数量</th><th>状态</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(c => (
                    <Fragment key={c.id}>
                      <tr className="admin-row-main">
                        <td>{c.boss_id}</td>
                        <td>{c.title}</td>
                        <td>主任务</td>
                        <td>{GIFT_ICONS[c.gift_type]} {c.gift_type}</td>
                        <td>{c.gift_quantity}</td>
                        <td>{c.status}</td>
                        <td>
                          <button onClick={() => editChallenge(c)}>编辑</button>
                          <button className="admin-btn-danger" onClick={() => handleChallengeDelete(c.id)}>删除</button>
                        </td>
                      </tr>
                      {c.hidden_challenges && c.hidden_challenges.map(h => (
                        <tr key={h.id} className="admin-row-hidden">
                          <td>{h.boss_id}</td>
                          <td>↳ {h.title}</td>
                          <td>🎁 隐藏</td>
                          <td>{GIFT_ICONS[h.gift_type]} {h.gift_type}</td>
                          <td>{h.gift_quantity}</td>
                          <td>{h.status}</td>
                          <td>
                            <button onClick={() => editChallenge(h)}>编辑</button>
                            <button className="admin-btn-danger" onClick={() => handleChallengeDelete(h.id)}>删除</button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'follows' && (
        <div className="admin-panel">
          <form className="admin-form" onSubmit={handleFollowSubmit}>
            <h3>新建跟单</h3>
            <label>选择任务
              <select value={followForm.challenge_id} onChange={e => setFollowForm({ ...followForm, challenge_id: e.target.value })} required>
                <option value="">-- 选择 --</option>
                <optgroup label="主任务">
                  {allChallenges.filter(c => c.parent_challenge_id == null).map(c => (
                    <option key={c.id} value={c.id}>[主] {c.title}</option>
                  ))}
                </optgroup>
                <optgroup label="隐藏任务">
                  {allChallenges.filter(c => c.parent_challenge_id != null).map(c => (
                    <option key={c.id} value={c.id}>[隐藏] {c.title}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>老板ID
              <input value={followForm.boss_id} onChange={e => setFollowForm({ ...followForm, boss_id: e.target.value })} required />
            </label>
            <div className="admin-form-row">
              <label>礼物类型
                <select value={followForm.gift_type} onChange={e => setFollowForm({ ...followForm, gift_type: e.target.value })}>
                  {GIFT_TYPES.map(t => <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>)}
                </select>
              </label>
              <label>数量
                <input type="number" min="1" step="1" value={followForm.gift_quantity} onChange={e => setFollowForm({ ...followForm, gift_quantity: e.target.value })} required />
              </label>
            </div>
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary">提交跟单</button>
            </div>
          </form>

          <div className="admin-list">
            <h3>跟单记录</h3>
            {followOrders.length === 0 ? <div className="admin-empty">暂无跟单</div> : (
              <table>
                <thead>
                  <tr>
                    <th>任务</th><th>老板ID</th><th>礼物</th><th>数量</th><th>时间</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {followOrders.map(o => (
                    <tr key={o.id}>
                      <td>{o.challenge_title}</td>
                      <td>{o.boss_id}</td>
                      <td>{GIFT_ICONS[o.gift_type]} {o.gift_type}</td>
                      <td>{o.gift_quantity}</td>
                      <td>{new Date(o.created_at).toLocaleString('zh-CN')}</td>
                      <td>
                        <button className="admin-btn-danger" onClick={() => handleFollowDelete(o.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="admin-panel">
          <div className="admin-form">
            <h3>用户管理</h3>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: -8, marginBottom: 16 }}>
              支持按斗鱼ID、昵称或用户名模糊搜索
            </p>
            <input
              type="text"
              placeholder="搜索斗鱼ID / 昵称 / 用户名..."
              value={userSearch}
              onChange={e => searchUsers(e.target.value)}
            />
          </div>

          <div className="admin-list">
            <h3>用户列表 ({users.length})</h3>
            {users.length === 0 ? <div className="admin-empty">暂无用户</div> : (
              <table>
                <thead>
                  <tr>
                    <th>斗鱼ID</th><th>昵称</th><th>等级</th><th>状态</th><th>最后登录</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={u.is_blacklisted ? 'admin-row-banned' : ''}>
                      <td>{u.douyu_uid || u.douyu_id || '-'}</td>
                      <td>{u.douyu_nickname || u.douyu_name || '-'}</td>
                      <td>LV{u.douyu_level || 0}</td>
                      <td>
                        {u.is_blacklisted ? (
                          <span style={{ color: '#ff5050', fontWeight: 700 }}>🚫 已拉黑</span>
                        ) : (
                          <span style={{ color: '#00C853' }}>✓ 正常</span>
                        )}
                      </td>
                      <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-CN') : '-'}</td>
                      <td>
                        <button
                          onClick={() => toggleBlacklist(u)}
                          className={u.is_blacklisted ? '' : 'admin-btn-danger'}
                        >
                          {u.is_blacklisted ? '解除拉黑' : '拉黑'}
                        </button>
                        <button className="admin-btn-danger" onClick={() => handleDeleteUser(u)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="admin-panel">
          <div className="admin-form">
            <h3>配置管理</h3>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: -8, marginBottom: 16 }}>
              限制斗鱼等级低于该值的用户进行跟单、下单、发布隐藏任务等操作
            </p>
            <label>最低斗鱼等级（小于该等级的用户将被拦截）
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={minLevel}
                  onChange={e => setMinLevel(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="admin-btn-primary"
                  onClick={saveMinLevel}
                  disabled={savingSetting}
                >
                  {savingSetting ? '保存中...' : '保存'}
                </button>
              </div>
            </label>
            <p style={{ color: '#FFD700', fontSize: '0.85rem', marginTop: 12 }}>
              💡 当前最低等级：<strong>LV{minLevel}</strong>。低于此等级的用户在点击「发布挑战」/「跟单」/「添加隐藏任务」时会看到提示：
              <br/>
              <code style={{ background: '#0a0a0a', padding: '2px 6px', borderRadius: 2, marginTop: 4, display: 'inline-block' }}>
                斗鱼等级不足（{minLevel}级），暂时无法发布任务～
              </code>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
