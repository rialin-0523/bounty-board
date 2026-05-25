import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import './Admin.css'
import './BountyPoster.css'

const ADMIN_PASSWORD = 'bounty2024'

function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [tasks, setTasks] = useState([])
  const [hunters, setHunters] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    bounty: '',
    status: '寻好汉',
    task_type: '独行赏',
    poster_nickname: '',
    poster_avatar_url: '',
    hunters_id: ''
  })
  const [hunterForm, setHunterForm] = useState({
    nickname: '',
    avatar_url: ''
  })
  const [editingTask, setEditingTask] = useState(null)
  const [editingHunter, setEditingHunter] = useState(null)
  const [activeTab, setActiveTab] = useState('tasks')

  function handleLogin(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true)
      fetchData()
    } else {
      alert('密码错误')
    }
  }

  useEffect(() => {
    if (authenticated) fetchData()
  }, [authenticated])

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

  async function uploadImage(file, type) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const path = type === 'hunter' ? `hunters/${fileName}` : fileName
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(path, file)
    if (error) {
      alert('上传失败: ' + error.message)
      return null
    }
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)
    return publicUrl
  }

  async function handleTaskSubmit(e) {
    e.preventDefault()
    console.log('提交任务:', taskForm)
    setLoading(true)
    const cleanForm = {
      ...taskForm,
      hunters_id: taskForm.hunters_id || null,
      poster_avatar_url: taskForm.poster_avatar_url || null
    }
    try {
      if (editingTask) {
        const { error } = await supabase.from('tasks').update(cleanForm).eq('id', editingTask.id)
        if (error) alert('更新失败: ' + error.message)
      } else {
        const { data, error } = await supabase.from('tasks').insert(cleanForm)
        console.log('插入结果:', data, error)
        if (error) {
          alert('创建失败: ' + error.message)
        } else {
          alert('创建成功！')
        }
      }
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
    resetTaskForm()
    fetchData()
    setLoading(false)
  }

  async function deleteTask(id) {
    if (confirm('确定删除此悬赏令？')) {
      await supabase.from('tasks').delete().eq('id', id)
      fetchData()
    }
  }

  async function printBountyPoster(task) {
    const posterEl = document.createElement('div')
    posterEl.className = 'bounty-poster-print-container'
    posterEl.innerHTML = `
      <div class="bounty-poster">
        <div class="poster-border">
          <div class="poster-content">
            <div class="poster-title">悬 赏 令</div>
            <div class="poster-seals">
              <span class="seal-left">沧海城印</span>
              <span class="seal-right">沧海城印</span>
            </div>
            <div class="poster-label-box">
              <span class="label-text">悬榜人</span>
            </div>
            <div class="poster-avatar ${task.poster_avatar_url ? 'has-image' : ''}">
              ${task.poster_avatar_url ? `<img src="${task.poster_avatar_url}" alt="${task.poster_nickname}" />` : `<span class="avatar-initial">${task.poster_nickname?.charAt(0) || '?'}</span>`}
            </div>
            <div class="poster-name">${task.poster_nickname}</div>
            <div class="poster-description-box">
              <span class="desc-label">详述</span>
              <div class="desc-content" data-font-size="auto">${task.description}</div>
            </div>
            <div class="poster-bounty">
              <span class="bounty-label">赏金：</span>
              <span class="bounty-amount">${task.bounty}</span>
            </div>
            <div class="poster-seal-bottom">赏金刑重</div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(posterEl)

    // 自适应字体大小
    const descContent = posterEl.querySelector('.desc-content')
    const descBox = posterEl.querySelector('.poster-description-box')
    let fontSize = 18
    descContent.style.fontSize = fontSize + 'px'
    while (descContent.scrollHeight > descContent.clientHeight && fontSize > 8) {
      fontSize -= 1
      descContent.style.fontSize = fontSize + 'px'
    }

    await html2canvas(posterEl.querySelector('.bounty-poster'), {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      width: 595,
      height: 842
    }).then(canvas => {
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [595, 842] })
      pdf.addImage(imgData, 'PNG', 0, 0, 595, 842)
      pdf.save(`悬赏令_${task.poster_nickname}_${Date.now()}.pdf`)
    })

    document.body.removeChild(posterEl)
  }

  function editTask(task) {
    setTaskForm({ ...task })
    setEditingTask(task)
  }

  function resetTaskForm() {
    setTaskForm({
      title: '',
      description: '',
      bounty: '',
      status: '寻好汉',
      task_type: '独行赏',
      poster_nickname: '',
      poster_avatar_url: '',
      hunters_id: ''
    })
    setEditingTask(null)
  }

  async function handleHunterSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const cleanForm = {
      ...hunterForm,
      avatar_url: hunterForm.avatar_url || null
    }
    try {
      if (editingHunter) {
        const { error } = await supabase.from('hunters').update(cleanForm).eq('id', editingHunter.id)
        if (error) alert('更新失败: ' + error.message)
      } else {
        const { data, error } = await supabase.from('hunters').insert(cleanForm)
        if (error) {
          alert('创建失败: ' + error.message)
        } else {
          alert('创建成功！')
        }
      }
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
    resetHunterForm()
    fetchData()
    setLoading(false)
  }

  async function deleteHunter(id) {
    if (confirm('确定删除此揭榜人？')) {
      await supabase.from('hunters').delete().eq('id', id)
      fetchData()
    }
  }

  function editHunter(hunter) {
    setHunterForm({ ...hunter })
    setEditingHunter(hunter)
  }

  function resetHunterForm() {
    setHunterForm({ nickname: '', avatar_url: null })
    setEditingHunter(null)
  }

  if (!authenticated) {
    return (
      <div className="login-page">
        <form className="login-form" onSubmit={handleLogin}>
          <h2>运营后台登录</h2>
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
      <h1 className="admin-title">运营后台</h1>
      <div className="tabs">
        <button className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
          悬赏令管理
        </button>
        <button className={`tab ${activeTab === 'hunters' ? 'active' : ''}`} onClick={() => setActiveTab('hunters')}>
          揭榜人管理
        </button>
      </div>

      {activeTab === 'tasks' && (
        <div className="panel">
          <form className="form" onSubmit={handleTaskSubmit}>
            <h3>{editingTask ? '编辑悬赏令' : '创建悬赏令'}</h3>
            <div className="form-group">
              <label>标题</label>
              <input type="text" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>任务描述</label>
              <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} rows="3" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>赏金</label>
                <input type="text" value={taskForm.bounty} onChange={e => setTaskForm({ ...taskForm, bounty: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>状态</label>
                <select value={taskForm.status} onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}>
                  <option value="寻好汉">寻好汉</option>
                  <option value="已揭榜">已揭榜</option>
                  <option value="来领赏">来领赏</option>
                  <option value="收榜">收榜</option>
                </select>
              </div>
              <div className="form-group">
                <label>类型</label>
                <select value={taskForm.task_type} onChange={e => setTaskForm({ ...taskForm, task_type: e.target.value })}>
                  <option value="独行赏">独行赏</option>
                  <option value="群英令">群英令</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>出榜人昵称</label>
              <input type="text" value={taskForm.poster_nickname} onChange={e => setTaskForm({ ...taskForm, poster_nickname: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>出榜人头像</label>
              <input type="file" accept="image/*" onChange={async e => {
                const url = await uploadImage(e.target.files[0], 'poster')
                if (url) setTaskForm({ ...taskForm, poster_avatar_url: url })
              }} />
              {taskForm.poster_avatar_url && <img src={taskForm.poster_avatar_url} alt="预览" className="preview-img" />}
            </div>
            <div className="form-group">
              <label>揭榜人</label>
              <select value={taskForm.hunters_id} onChange={e => setTaskForm({ ...taskForm, hunters_id: e.target.value })}>
                <option value="">无</option>
                {hunters.map(h => <option key={h.id} value={h.id}>{h.nickname}</option>)}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editingTask ? '保存修改' : '创建悬赏令'}</button>
              {editingTask && <button type="button" className="btn btn-secondary" onClick={resetTaskForm}>取消</button>}
            </div>
          </form>
          <div className="list">
            <h3>悬赏令列表</h3>
            {tasks.length === 0 ? <div className="empty">暂无悬赏令</div> : (
              <table>
                <thead>
                  <tr>
                    <th>标题</th><th>赏金</th><th>状态</th><th>类型</th><th>出榜人</th><th>揭榜人</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => {
                    const hunter = hunters.find(h => h.id === task.hunters_id)
                    return (
                      <tr key={task.id}>
                        <td>{task.title}</td>
                        <td>{task.bounty}</td>
                        <td><span className={`status-tag ${task.status}`}>{task.status}</span></td>
                        <td>{task.task_type}</td>
                        <td>{task.poster_nickname}</td>
                        <td>{hunter?.nickname || '-'}</td>
                        <td>
                          <button onClick={() => editTask(task)}>编辑</button>
                          <button onClick={() => printBountyPoster(task)} className="btn-print">打印</button>
                          <button onClick={() => deleteTask(task.id)} className="btn-danger">删除</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'hunters' && (
        <div className="panel">
          <form className="form" onSubmit={handleHunterSubmit}>
            <h3>{editingHunter ? '编辑揭榜人' : '添加揭榜人'}</h3>
            <div className="form-group">
              <label>昵称</label>
              <input type="text" value={hunterForm.nickname} onChange={e => setHunterForm({ ...hunterForm, nickname: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>头像</label>
              <input type="file" accept="image/*" onChange={async e => {
                const url = await uploadImage(e.target.files[0], 'hunter')
                if (url) setHunterForm({ ...hunterForm, avatar_url: url })
              }} />
              {hunterForm.avatar_url && <img src={hunterForm.avatar_url} alt="预览" className="preview-img" />}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editingHunter ? '保存修改' : '添加揭榜人'}</button>
              {editingHunter && <button type="button" className="btn btn-secondary" onClick={resetHunterForm}>取消</button>}
            </div>
          </form>
          <div className="list">
            <h3>揭榜人列表</h3>
            {hunters.length === 0 ? <div className="empty">暂无揭榜人</div> : (
              <table>
                <thead>
                  <tr><th>头像</th><th>昵称</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {hunters.map(hunter => (
                    <tr key={hunter.id}>
                      <td>
                        {hunter.avatar_url ? <img src={hunter.avatar_url} alt={hunter.nickname} className="table-avatar" /> : <div className="table-avatar placeholder">侠</div>}
                      </td>
                      <td>{hunter.nickname}</td>
                      <td>
                        <button onClick={() => editHunter(hunter)}>编辑</button>
                        <button onClick={() => deleteHunter(hunter.id)} className="btn-danger">删除</button>
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