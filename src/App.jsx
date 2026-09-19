import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './context/useAuth'
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
function RequireAuth({ children }) {
  const location = useLocation()
  const { user, loading } = useAuth()
  if (loading) return <RouteLoading />
  if (user) return children
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/challenges" element={<Navigate to="/" replace />} />
            <Route path="/challenges/:id" element={<RequireAuth><ChallengeDetail /></RequireAuth>} />
            <Route path="/publish" element={<RequireAuth><PublishPage /></RequireAuth>} />
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
