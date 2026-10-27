import axios from 'axios'

export const AUTH_SESSION_EXPIRED = 'sportevo:session-expired'

const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'

const api = axios.create({
  baseURL: '/api',
  // Cookies (HttpOnly session + XSRF token) drive authentication now;
  // nothing credential-like is ever read from JavaScript storage.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  ...(demoMode ? { adapter: async (config) => (await import('./mock')).default(config) } : {}),
})

let csrfReady = false
let csrfPending

function hasXsrfCookie() {
  return document.cookie.split(';').some((c) => c.trim().startsWith('XSRF-TOKEN='))
}

async function ensureCsrfCookie(force = false) {
  if (demoMode || (!force && (csrfReady || hasXsrfCookie()))) return
  csrfPending ||= api.get('/sanctum/csrf-cookie')
  try { await csrfPending; csrfReady = true } finally { csrfPending = undefined }
}

api.interceptors.request.use(async (config) => {
  if (config.data instanceof FormData) config.headers.delete('Content-Type')
  const method = (config.method || 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method)) {
    await ensureCsrfCookie()
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const config = error.config

    // Session expired / missing CSRF token: refresh the CSRF cookie once and retry.
    if (status === 419 && config && !config.__csrfRetried) {
      config.__csrfRetried = true
      csrfReady = false
      try {
        await ensureCsrfCookie(true)
        return api.request(config)
      } catch {
        /* fall through */
      }
    }

    if (status === 401) {
      try { localStorage.removeItem('user') } catch { /* Storage can be unavailable. */ }
      // Clear stale authentication without moving visitors off public pages.
      // ProtectedRoute handles login redirects for private pages.
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED))
    }
    return Promise.reject(error)
  }
)

export default api
