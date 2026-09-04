import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ChallengeBoard from './pages/ChallengeBoard'
import ChallengeDetail from './pages/ChallengeDetail'
import Admin from './Admin'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/challenges" element={<ChallengeBoard />} />
        <Route path="/challenges/:id" element={<ChallengeDetail />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
