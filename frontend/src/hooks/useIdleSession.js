import { useEffect } from 'react'
import api from '../api/client'

const idleMilliseconds = 45 * 60 * 1000
const activityKey = 'sportevo:last-interaction'

// Passive listeners preserve native scrolling. Timers are checked again when
// a sleeping phone/tab resumes; background API polling never renews this clock.
export default function useIdleSession(userId, loading, initialDeadline, onExpired) {
  useEffect(() => {
    if (!userId || loading) return
    let deadline = initialDeadline ?? Date.now() + idleMilliseconds
    let lastActivity = deadline - idleMilliseconds
    let lastSync = 0
    let lastBroadcast = 0
    let expiryTimer
    let syncTimer
    let disposed = false
    let expired = false

    const expire = () => {
      if (expired || disposed) return
      expired = true
      clearTimeout(expiryTimer)
      clearTimeout(syncTimer)
      onExpired()
      // Invalidate the HttpOnly session as well as clearing the visible login.
      // An already expired server session returns 401 and is invalidated there.
      api.post('/logout').catch(() => {})
    }
    const check = () => {
      clearTimeout(expiryTimer)
      if (Date.now() >= deadline) { expire(); return }
      expiryTimer = setTimeout(check, deadline - Date.now())
    }
    const sync = async () => {
      syncTimer = undefined
      if (disposed || expired) return
      if (Date.now() >= deadline) { expire(); return }
      lastSync = Date.now()
      const capturedActivity = lastActivity
      try {
        const { data } = await api.get('/me', {
          headers: { 'X-Session-Activity-Age': String(Math.max(0, Math.floor((Date.now() - capturedActivity) / 1000))) },
        })
        if (disposed || expired || lastActivity !== capturedActivity) return
        if (Number.isFinite(data.session_idle_seconds_remaining)) {
          deadline = Date.now() + data.session_idle_seconds_remaining * 1000
          check()
        }
      } catch { /* 401 is handled centrally; offline tabs still expire locally. */ }
    }
    const activity = () => {
      if (disposed || expired || document.hidden) return
      if (Date.now() >= deadline) { expire(); return }
      const nearExpiry = deadline - Date.now() < 30000
      lastActivity = Date.now()
      deadline = lastActivity + idleMilliseconds
      check()
      if (Date.now() - lastBroadcast >= 1000) {
        lastBroadcast = Date.now()
        try { localStorage.setItem(activityKey, JSON.stringify({ userId, at: lastActivity })) } catch { /* Storage is optional. */ }
      }
      // Send only after actual interaction, at most twice a minute per tab.
      // Include its age so delayed delivery does not add extra idle time.
      if (nearExpiry) { clearTimeout(syncTimer); syncTimer = undefined }
      if (syncTimer === undefined) syncTimer = setTimeout(sync, nearExpiry ? 0 : Math.max(1000, 30000 - (Date.now() - lastSync)))
    }
    const storage = event => {
      if (event.key === 'user' && !event.newValue) { expired = true; onExpired(); return }
      if (event.key !== activityKey || !event.newValue) return
      try {
        const other = JSON.parse(event.newValue)
        if (other.userId === userId && Number.isFinite(other.at) && other.at > lastActivity && other.at <= Date.now()) {
          lastActivity = other.at
          deadline = other.at + idleMilliseconds
          check()
        }
      } catch { /* Ignore invalid or unrelated storage events. */ }
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll']
    events.forEach(name => window.addEventListener(name, activity, { passive: true, capture: true }))
    window.addEventListener('storage', storage)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    check()
    return () => {
      disposed = true
      clearTimeout(expiryTimer)
      clearTimeout(syncTimer)
      events.forEach(name => window.removeEventListener(name, activity, true))
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [userId, loading, initialDeadline, onExpired])
}
