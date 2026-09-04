import { useState, useEffect, Fragment } from 'react'
import {
  listStreamers,
  createStreamer,
  updateStreamer,
  deleteStreamer,
  listMainChallengesWithHidden,
  listChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  listFollowOrders,
  createFollowOrder,
  deleteFollowOrder,
  getOrCreateBoss,
  GIFT_TYPES,
  GIFT_ICONS,
  GAME_TAGS,
} from './lib/api'
import './Admin.css'

const ADMIN_PASSWORD = 'bounty2024'

const emptyStreamer = {
  nickname: '',
  douyu_id: '',
  game_tag: 'CS2',
  level: 'LV1',
  room_id: '',
  rush_coin: 0,
  rush_value: 0,
  is_live: true,
  description: '',
}

const emptyChallenge = {
  streamer_id: '',
  boss_douyu_id: '',
  boss_nickname: '',
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
  boss_douyu_id: '',
  boss_nickname: '',
  gift_type: '飞机',
  gift_quantity: 1,
}

function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState('streamers')
  const [streamers, setStreamers] = useState([])
  const [challenges, setChallenges] = useState([])
  const [allChallenges, setAllChallenges] = useState([])
  const [followOrders, setFollowOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [streamerForm, setStreamerForm] = useState(emptyStreamer)
  const [editingStreamer, setEditingStreamer] = useState(null)
  const [challengeForm, setChallengeForm] = useState(emptyChallenge)
  const [editingChallenge, setEditingChallenge] = useState(null)
  const [followForm, setFollowForm] = useState(emptyFollow)

  useEffect(() => {
    if (authenticated) fetchData()
  }, [authenticated])

  async function fetchData() {
    setLoading(true)
    try {
      const [ss, cs, allC, fos] = await Promise.all([
        listStreamers(),
        listMainChallengesWithHidden(),
        listChallenges(),
        loadAllFollowOrders(),
      ])
      setStreamers(ss)
      setChallenges(cs)
      setAllChallenges(allC)
      setFollowOrders(fos)
    } catch (e) {
      console.error(e)
      alert('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllFollowOrders() {
    // 简单起见：拉所有主+隐藏的跟单
    const all = await listChallenges()
    const all2 = []
    for (const c of all) {
      const os = await listFollowOrders(c.id)
      os.forEach(o => all2.push({ ...o, challenge_title: c.title }))
    }
    return all2
  }

  function handleLogin(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      fetchData()
    } else {
      alert('密码错误')
    }
  }

  // ================== Streamer CRUD ==================
  async function handleStreamerSubmit(e) {
    e.preventDefault()
    try {
      if (editingStreamer) {
        await updateStreamer(editingStreamer.id, streamerForm)
        alert('更新成功')
      } else {
        await createStreamer(streamerForm)
        alert('创建成功')
      }
      setStreamerForm(emptyStreamer)
      setEditingStreamer(null)
      fetchData()
    } catch (err) {
      alert('操作失败：' + err.message)
    }
  }

  function editStreamer(s) {
    setStreamerForm({ ...s })
    setEditingStreamer(s)
  }

  async function handleStreamerDelete(id) {
    if (!confirm('确定删除该主播？相关挑战也会被删除。')) return
    try {
      await deleteStreamer(id)
      fetchData()
    } catch (err) {
      alert('删除失败：' + err.message)
    }
  }

  // ================== Challenge CRUD ==================
  async function handleChallengeSubmit(e) {
    e.preventDefault()
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
      // 1. 创建/获取 boss
      let bossId = null
      if (challengeForm.boss_douyu_id) {
        const boss = await getOrCreateBoss(
          challengeForm.boss_douyu_id,
          challengeForm.boss_nickname || null
        )
        bossId = boss.id
      }
      const payload = {
        streamer_id: challengeForm.streamer_id || null,
        boss_id: bossId,
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
      streamer_id: c.streamer_id || '',
      boss_douyu_id: '', // 不展示，回填时查询
      boss_nickname: '',
      parent_challenge_id: c.parent_challenge_id || '',
    })
    setEditingChallenge(c)
  }

  async function handleChallengeDelete(id) {
    if (!confirm('确定删除该挑战？隐藏任务和跟单也会被删除。')) return
    try {
      await deleteChallenge(id)
      fetchData()
    } catch (err) {
      alert('删除失败：' + err.message)
    }
  }

  // ================== Follow Order CRUD ==================
  async function handleFollowSubmit(e) {
    e.preventDefault()
    if (parseInt(followForm.gift_quantity) <= 0) {
      alert('数量必须为正整数')
      return
    }
    if (!followForm.challenge_id) {
      alert('请选择挑战')
      return
    }
    try {
      let bossId = null
      if (followForm.boss_douyu_id) {
        const boss = await getOrCreateBoss(
          followForm.boss_douyu_id,
          followForm.boss_nickname || null
        )
        bossId = boss.id
      }
      await createFollowOrder({
        challenge_id: followForm.challenge_id,
        boss_id: bossId,
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

  // 头像上传已移除，直接填 URL 即可

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
        <button className={`admin-tab ${activeTab === 'streamers' ? 'active' : ''}`} onClick={() => setActiveTab('streamers')}>
          主播管理 ({streamers.length})
        </button>
        <button className={`admin-tab ${activeTab === 'challenges' ? 'active' : ''}`} onClick={() => setActiveTab('challenges')}>
          挑战管理 ({challenges.length})
        </button>
        <button className={`admin-tab ${activeTab === 'follows' ? 'active' : ''}`} onClick={() => setActiveTab('follows')}>
          跟单管理 ({followOrders.length})
        </button>
      </div>

      {activeTab === 'streamers' && (
        <div className="admin-panel">
          <form className="admin-form" onSubmit={handleStreamerSubmit}>
            <h3>{editingStreamer ? '编辑主播' : '新建主播'}</h3>
            <div className="admin-form-row">
              <label>昵称
                <input value={streamerForm.nickname} onChange={e => setStreamerForm({ ...streamerForm, nickname: e.target.value })} required />
              </label>
              <label>斗鱼ID
                <input value={streamerForm.douyu_id || ''} onChange={e => setStreamerForm({ ...streamerForm, douyu_id: e.target.value })} />
              </label>
            </div>
            <div className="admin-form-row">
              <label>游戏类型
                <select value={streamerForm.game_tag} onChange={e => setStreamerForm({ ...streamerForm, game_tag: e.target.value })}>
                  {GAME_TAGS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label>等级
                <input value={streamerForm.level || ''} onChange={e => setStreamerForm({ ...streamerForm, level: e.target.value })} placeholder="LV115" />
              </label>
              <label>直播间
                <input value={streamerForm.room_id || ''} onChange={e => setStreamerForm({ ...streamerForm, room_id: e.target.value })} placeholder="123456" />
              </label>
            </div>
            <div className="admin-form-row">
              <label>Rush币
                <input type="number" value={streamerForm.rush_coin} onChange={e => setStreamerForm({ ...streamerForm, rush_coin: parseInt(e.target.value) || 0 })} />
              </label>
              <label>Rush值
                <input type="number" value={streamerForm.rush_value} onChange={e => setStreamerForm({ ...streamerForm, rush_value: parseInt(e.target.value) || 0 })} />
              </label>
              <label>是否直播
                <select value={streamerForm.is_live ? 'true' : 'false'} onChange={e => setStreamerForm({ ...streamerForm, is_live: e.target.value === 'true' })}>
                  <option value="true">直播中</option>
                  <option value="false">未开播</option>
                </select>
              </label>
            </div>
            <label>简介
              <textarea value={streamerForm.description || ''} onChange={e => setStreamerForm({ ...streamerForm, description: e.target.value })} rows="2" />
            </label>
            <div className="admin-form-actions">
              <button type="submit" className="admin-btn-primary">{editingStreamer ? '保存' : '创建'}</button>
              {editingStreamer && <button type="button" className="admin-btn-secondary" onClick={() => { setStreamerForm(emptyStreamer); setEditingStreamer(null) }}>取消</button>}
            </div>
          </form>

          <div className="admin-list">
            <h3>主播列表</h3>
            {streamers.length === 0 ? <div className="admin-empty">暂无主播</div> : (
              <table>
                <thead>
                  <tr>
                    <th>昵称</th><th>游戏</th><th>等级</th><th>直播间</th><th>Rush币</th><th>Rush值</th><th>状态</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {streamers.map(s => (
                    <tr key={s.id}>
                      <td>{s.nickname}</td>
                      <td>{s.game_tag}</td>
                      <td>{s.level}</td>
                      <td>{s.room_id}</td>
                      <td>{s.rush_coin}</td>
                      <td>{s.rush_value}</td>
                      <td>{s.is_live ? '🟢 直播中' : '⚫ 离线'}</td>
                      <td>
                        <button onClick={() => editStreamer(s)}>编辑</button>
                        <button className="admin-btn-danger" onClick={() => handleStreamerDelete(s.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'challenges' && (
        <div className="admin-panel">
          <form className="admin-form" onSubmit={handleChallengeSubmit}>
            <h3>{editingChallenge ? '编辑挑战' : '新建挑战'}</h3>
            <div className="admin-form-row">
              <label>目标主播
                <select value={challengeForm.streamer_id} onChange={e => setChallengeForm({ ...challengeForm, streamer_id: e.target.value })}>
                  <option value="">-- 选择主播 --</option>
                  {streamers.map(s => <option key={s.id} value={s.id}>{s.nickname} ({s.game_tag})</option>)}
                </select>
              </label>
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

            <label>挑战条件
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

            <div className="admin-form-row">
              <label>老板斗鱼ID
                <input value={challengeForm.boss_douyu_id} onChange={e => setChallengeForm({ ...challengeForm, boss_douyu_id: e.target.value })} placeholder="必填" required />
              </label>
              <label>老板昵称（可选）
                <input value={challengeForm.boss_nickname} onChange={e => setChallengeForm({ ...challengeForm, boss_nickname: e.target.value })} />
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
                    <th>标题</th><th>主播</th><th>类型</th><th>礼物</th><th>数量</th><th>状态</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(c => (
                    <Fragment key={c.id}>
                      <tr className="admin-row-main">
                        <td>{c.title}</td>
                        <td>{streamers.find(s => s.id === c.streamer_id)?.nickname || '-'}</td>
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
                          <td>↳ {h.title}</td>
                          <td>{streamers.find(s => s.id === h.streamer_id)?.nickname || '-'}</td>
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
            <label>选择挑战
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
            <div className="admin-form-row">
              <label>老板斗鱼ID
                <input value={followForm.boss_douyu_id} onChange={e => setFollowForm({ ...followForm, boss_douyu_id: e.target.value })} required />
              </label>
              <label>老板昵称（可选）
                <input value={followForm.boss_nickname} onChange={e => setFollowForm({ ...followForm, boss_nickname: e.target.value })} />
              </label>
            </div>
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
                    <th>挑战</th><th>老板斗鱼ID</th><th>礼物</th><th>数量</th><th>时间</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {followOrders.map(o => (
                    <tr key={o.id}>
                      <td>{o.challenge_title}</td>
                      <td>{o.boss_id || '-'}</td>
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
