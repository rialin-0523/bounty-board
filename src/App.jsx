import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ChallengeDetail from './pages/ChallengeDetail'
import PublishPage from './pages/PublishPage'
import Admin from './Admin'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/challenges" element={<Navigate to="/" replace />} />
        <Route path="/challenges/:id" element={<ChallengeDetail />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
