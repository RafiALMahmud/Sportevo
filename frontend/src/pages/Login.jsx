import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/dashboardPath'
import Seo from '../components/Seo'
import BrandLogo from '../components/BrandLogo'
import { Alert, Button, Input } from '../components/ui'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(form.email, form.password)
      navigate(dashboardPath(data.user.role), { replace: true })
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.email) {
        navigate('/verify-email', { state: { email: err.response.data.email } })
        return
      }
      setError(err.response?.data?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const quickFill = (email, password) => setForm({ email, password })
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'

  return (
    <div className="flex min-h-screen bg-black">
      <Seo title={t("Sign In")} description={t("Sign in to SportEvo to book sports complexes near you.")} path="/login" noIndex />
      <div className="auth-feature-panel hidden flex-1 flex-col justify-between p-12 lg:flex">
        <Link to="/" aria-label={t("SportEvo homepage")} className="flex w-fit items-center gap-3 rounded-xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <BrandLogo />
          <span className="auth-feature-brand text-2xl font-bold">SportEvo</span>
        </Link>
        <div className="animate-fade-up">
          <h1 className="auth-feature-title text-4xl font-bold leading-tight">{t("Book your favorite ")}<span className="auth-feature-accent">{t("sports complex")}</span>{t(" in seconds.")}</h1>
          <p className="auth-feature-copy mt-4 max-w-md text-lg">{t("Discover multi-sport complexes near you, view real-time availability, and request your slot all in one place.")}</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {['Football', 'Cricket', 'Badminton'].map((sport) => (
            <div
              key={sport}
              className="auth-feature-card rounded-xl border p-4 backdrop-blur transition hover:-translate-y-1"
            >
              <div className="auth-feature-sport text-lg font-semibold">{t(sport)}</div>
              <div className="auth-feature-copy text-sm">{t("Request a slot")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 text-center">
            <Link to="/" aria-label={t("SportEvo homepage")} className="mb-5 inline-flex items-center gap-2 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:hidden">
              <BrandLogo />
              <span className="text-lg font-bold text-white">SportEvo</span>
            </Link>
            <h2 className="text-2xl font-bold text-white">{t("Welcome back")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("Sign in to your SportEvo account")}</p>
          </div>

          {error && (
            <div className="mb-4">
              <Alert type="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t("Email")}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label={t("Password")}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-emerald-500 hover:underline">{t("Forgot password?")}</Link>
            </div>
            <Button type="submit" loading={loading} className="w-full">{t("Sign in")}</Button>
          </form>

          {demoMode && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-black px-3 text-xs font-medium uppercase tracking-wide text-zinc-500">{t("Demo accounts")}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => quickFill('superadmin@sportsevo.com', 'password')}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
              >
                <span className="font-semibold text-zinc-100">{t("Superadmin")}</span>
                <span className="block text-zinc-500">superadmin@sportsevo.com</span>
              </button>
              <button
                onClick={() => quickFill('user@sportsevo.com', 'password')}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
              >
                <span className="font-semibold text-zinc-100">{t("User")}</span>
                <span className="block text-zinc-500">user@sportsevo.com</span>
              </button>
            </div>
            <button
              onClick={() => quickFill('manager@sportsevo.com', 'password')}
              className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
            >
              <span className="font-semibold text-zinc-100">{t("Complex Manager")}</span>
              <span className="block text-zinc-500">manager@sportsevo.com</span>
            </button>
          </div>
          )}

          <p className="mt-6 text-center text-sm text-zinc-500">{t("Don't have an account?")}{' '}
            <Link to="/register" className="font-medium text-emerald-500 hover:underline">{t("Register now")}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
