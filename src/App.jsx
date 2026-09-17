import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import './App.css'

const HomePage = lazy(() => import('./pages/HomePage'))
const ChallengeDetail = lazy(() => import('./pages/ChallengeDetail'))
const PublishPage = lazy(() => import('./pages/PublishPage'))
const Admin = lazy(() => import('./Admin'))
const BindDouyuPage = lazy(() => import('./pages/BindDouyuPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function RouteLoading() {
  return (
    <div className="route-loading" role="status">
      页面加载中...
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/challenges" element={<Navigate to="/" replace />} />
            <Route path="/challenges/:id" element={<ChallengeDetail />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/admin" element={<Navigate to="/xiaoyangadmin" replace />} />
            <Route path="/xiaoyangadmin" element={<Admin />} />
            <Route path="/bind" element={<BindDouyuPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
