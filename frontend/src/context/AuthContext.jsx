import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api, { AUTH_SESSION_EXPIRED } from '../api/client'
import useIdleSession from '../hooks/useIdleSession'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  } catch {
    try { localStorage.removeItem('user') } catch { /* Storage may be disabled. */ }
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  const [loading, setLoading] = useState(true)
  const [sessionDeadline, setSessionDeadline] = useState(null)
  useEffect(() => {
    const expire = () => { setUser(null); setLoading(false) }
    window.addEventListener(AUTH_SESSION_EXPIRED, expire)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED, expire)
  }, [])

  // The credential is the HttpOnly session cookie set by Laravel; the stored
  // user object is only a UI hint and is re-validated against /me on boot.
  const persistUser = useCallback((nextUser) => {
    setUser(nextUser)
    try {
      if (nextUser) {
        // Keep only a session hint on disk; personal details stay in memory and are fetched after authentication.
        localStorage.setItem('user', JSON.stringify({ id: nextUser.id, role: nextUser.role }))
      } else {
        localStorage.removeItem('user')
      }
    } catch { /* Authentication state stays in memory when storage is disabled. */ }
  }, [])

  const expireIdleSession = useCallback(() => persistUser(null), [persistUser])
  useIdleSession(user?.id, loading, sessionDeadline, expireIdleSession)

  const rememberDeadline = useCallback(data => {
    const seconds = Number.isFinite(data.session_idle_seconds_remaining) ? data.session_idle_seconds_remaining : 45 * 60
    setSessionDeadline(Date.now() + seconds * 1000)
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/me')
      rememberDeadline(data)
      persistUser(data.user)
    } catch {
      persistUser(null)
    } finally {
      setLoading(false)
    }
  }, [persistUser, rememberDeadline])

  useEffect(() => {
    if (readStoredUser()) {
      fetchMe()
    } else {
      setLoading(false)
    }
  }, [fetchMe])

  const login = async (email, password) => {
    const { data } = await api.post('/login', { email, password })
    rememberDeadline(data)
    persistUser(data.user)
    return data
  }

  const register = async (payload) => {
    const { data } = await api.post('/register', payload)
    return data
  }

  const verifyEmail = async (email, code) => {
    const { data } = await api.post('/verify-email', { email, code })
    rememberDeadline(data)
    persistUser(data.user)
    return data
  }

  const resendCode = async (email) => {
    const { data } = await api.post('/resend-code', { email })
    return data
  }

  const logout = async () => {
    try {
      await api.post('/logout')
    } catch {
      /* ignore */
    }
    persistUser(null)
  }

  const deleteAccount = async () => {
    await api.delete('/profile')
    persistUser(null)
  }

  const updateProfile = async (payload) => {
    const { data } = await api.patch('/profile', payload)
    persistUser(data.user)
    return data
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyEmail, resendCode, logout, deleteAccount, updateProfile, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
