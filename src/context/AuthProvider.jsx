import { useEffect, useMemo, useState } from 'react'
import { getMe, login as loginRequest, logout as logoutRequest } from '../lib/authApi'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function refreshUser() {
    const data = await getMe()
    setUser(data.user || null)
    setLoading(false)
    return data.user || null
  }

    useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getMe()
        if (cancelled) return
        setUser(data.user || null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function signIn(payload) {
    const data = await loginRequest(payload)
    setUser(data.user || null)
    return data.user || null
  }

  async function signOut() {
    await logoutRequest()
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshUser,
      signIn,
      signOut,
      setUser,
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
