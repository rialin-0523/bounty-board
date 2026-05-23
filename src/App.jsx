import { useState } from 'react'
import BountyBoard from './BountyBoard'
import Admin from './Admin'
import './App.css'

function App() {
  const [page, setPage] = useState('board')

  return (
    <div className="app">
      <nav className="nav">
        <button 
          className={`nav-btn ${page === 'board' ? 'active' : ''}`}
          onClick={() => setPage('board')}
        >
          悬赏令
        </button>
        <button 
          className={`nav-btn ${page === 'admin' ? 'active' : ''}`}
          onClick={() => setPage('admin')}
        >
          后台管理
        </button>
      </nav>
      
      {page === 'board' ? <BountyBoard /> : <Admin />}
    </div>
  )
}

export default App