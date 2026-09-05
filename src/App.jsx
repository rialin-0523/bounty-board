import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ChallengeDetail from './pages/ChallengeDetail'
import PublishPage from './pages/PublishPage'
import Admin from './Admin'
import BindDouyuPage from './pages/BindDouyuPage'
import LoginPage from './pages/LoginPage'
import { AuthProvider } from './context/AuthProvider'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/challenges" element={<Navigate to="/" replace />} />
          <Route path="/challenges/:id" element={<ChallengeDetail />} />
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/bind" element={<BindDouyuPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
