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
  GIFT_TYPES,
  GIFT_ICONS,
} from './lib/api'
import './Admin.css'

const ADMIN_PASSWORD = 'bounty2024'

const emptyChallenge = {
  boss_id: '',
  title: '',
  description: '',
  condition_desc: '',
  gift_type: '飞机',
  gift_quantity: 1,
  is_hidden: false,
  parent_challenge_id: '',
  status: 'active',
}

const emptyFollow = {
  challenge_id: '',
  boss_id: '',
  gift_type: '飞机',
  gift_quantity: 1,
}

function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState('challenges')
  const [challenges, setChallenges] = useState([])
  const [allChallenges, setAllChallenges] = useState([])
  const [followOrders, setFollowOrders] = useState([])

  const [challengeForm, setChallengeForm] = useState(emptyChallenge)
  const [editingChallenge, setEditingChallenge] = useState(null)
  const [followForm, setFollowForm] = useState(emptyFollow)


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
    try {
      const [cs, allC, fos] = await Promise.all([
        listMainChallengesWithHidden(),
        listChallenges(),
        loadAllFollowOrders(),
      ])
      setChallenges(cs)
      setAllChallenges(allC)
      setFollowOrders(fos)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    }
  }, [loadAllFollowOrders])

  useEffect(() => {
    if (!authenticated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [authenticated, fetchData])


  function handleLogin(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
    } else {
      alert('密码错误')
    }
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
    if (challengeForm.is_hidden && !challengeForm.parent_challenge_id) {
      alert('隐藏任务必须关联一个主任务')
      return
    }
    if (!challengeForm.is_hidden && challengeForm.parent_challenge_id) {
      alert('主任务不能关联其他任务')
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
        is_hidden: challengeForm.is_hidden,
        parent_challenge_id: challengeForm.is_hidden ? challengeForm.parent_challenge_id : null,
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
      parent_challenge_id: c.parent_challenge_id || '',
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

  if (!authenticated) {
    return (
      <div className="admin-login">
        <form className="admin-login-form" onSubmit={handleLogin}>
          <h2>突围特工队 · 运营后台</h2>
          <input
            type="password"
            placeholder="请输入管理密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit">登录</button>
        </form>
      </div>
    )
  }

  return (
    <div className="admin">
      <h1 className="admin-title">突围特工队 · 后台管理</h1>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'challenges' ? 'active' : ''}`} onClick={() => setActiveTab('challenges')}>
          任务管理 ({challenges.length})
        </button>
        <button className={`admin-tab ${activeTab === 'follows' ? 'active' : ''}`} onClick={() => setActiveTab('follows')}>
          跟单管理 ({followOrders.length})
        </button>
      </div>

      {activeTab === 'challenges' && (
        <div className="admin-panel">
          <form className="admin-form" onSubmit={handleChallengeSubmit}>
            <h3>{editingChallenge ? '编辑任务' : '新建任务'}</h3>
            <label>老板ID / 昵称 <span style={{ color: '#FFD700' }}>*</span>
              <input value={challengeForm.boss_id} onChange={e => setChallengeForm({ ...challengeForm, boss_id: e.target.value })} required />
            </label>
            <div className="admin-form-row">
              <label>任务类型
                <select value={challengeForm.is_hidden ? 'hidden' : 'main'} onChange={e => setChallengeForm({ ...challengeForm, is_hidden: e.target.value === 'hidden' })}>
                  <option value="main">主任务</option>
                  <option value="hidden">隐藏任务</option>
                </select>
              </label>
              <label>状态
                <select value={challengeForm.status} onChange={e => setChallengeForm({ ...challengeForm, status: e.target.value })}>
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </label>
            </div>

            {challengeForm.is_hidden && (
              <label>关联主任务
                <select value={challengeForm.parent_challenge_id} onChange={e => setChallengeForm({ ...challengeForm, parent_challenge_id: e.target.value })} required>
                  <option value="">-- 选择主任务 --</option>
                  {allChallenges.filter(c => c.parent_challenge_id == null && c.id !== editingChallenge?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>
            )}

            <label>标题
              <input value={challengeForm.title} onChange={e => setChallengeForm({ ...challengeForm, title: e.target.value })} required />
            </label>

            <label>任务条件
              <input value={challengeForm.condition_desc || ''} onChange={e => setChallengeForm({ ...challengeForm, condition_desc: e.target.value })} placeholder="如：套圈数量最多者" />
            </label>

            <label>详细描述
              <textarea value={challengeForm.description || ''} onChange={e => setChallengeForm({ ...challengeForm, description: e.target.value })} rows="3" />
            </label>

            <div className="admin-form-row">
              <label>礼物类型
                <select value={challengeForm.gift_type} onChange={e => setChallengeForm({ ...challengeForm, gift_type: e.target.value })}>
                  {GIFT_TYPES.map(t => <option key={t} value={t}>{GIFT_ICONS[t]} {t}</option>)}
                </select>
              </label>
              <label>数量（正整数）
                <input type="number" min="1" step="1" value={challengeForm.gift_quantity} onChange={e => setChallengeForm({ ...challengeForm, gift_quantity: e.target.value })} required />
              </label>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary">{editingChallenge ? '保存' : '创建'}</button>
              {editingChallenge && <button type="button" className="admin-btn-secondary" onClick={() => { setChallengeForm(emptyChallenge); setEditingChallenge(null) }}>取消</button>}
            </div>
          </form>

          <div className="admin-list">
            <h3>主任务列表（含隐藏任务）</h3>
            {challenges.length === 0 ? <div className="admin-empty">暂无主任务</div> : (
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
    </div>
  )
}

export default Admin
