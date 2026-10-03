import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Input } from '../components/ui'

export default function Login() {
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
      navigate(dashboardFor(data.user.role), { replace: true })
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

  const dashboardFor = (role) => {
    if (role === 'superadmin' || role === 'admin') return '/dashboard/platform'
    if (role === 'turf') return '/dashboard/turf'
    return '/dashboard/user'
  }

  const quickFill = (email, password) => setForm({ email, password })

  return (
    <div className="flex min-h-screen bg-black">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 font-bold text-white backdrop-blur animate-pulse-glow">
            SE
          </div>
          <span className="text-2xl font-bold text-white">Sports Evo</span>
        </div>
        <div className="animate-fade-up">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Book your favorite <span className="text-emerald-300">sports complex</span> in seconds.
          </h1>
          <p className="mt-4 max-w-md text-lg text-emerald-100">
            Discover multi-sport complexes near you, view real-time availability, and request your
            slot all in one place.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {['Football', 'Cricket', 'Badminton'].map((sport) => (
            <div
              key={sport}
              className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur transition hover:-translate-y-1 hover:bg-white/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
            >
              <div className="text-lg font-semibold text-white">{sport}</div>
              <div className="text-sm text-emerald-100">Request a slot</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="mt-1 text-sm text-zinc-500">Sign in to your Sports Evo account</p>
          </div>

          {error && (
            <div className="mb-4">
              <Alert type="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-emerald-500 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-black px-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Demo accounts
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => quickFill('superadmin@sportsevo.com', 'password')}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
              >
                <span className="font-semibold text-zinc-100">Superadmin</span>
                <span className="block text-zinc-500">superadmin@sportsevo.com</span>
              </button>
              <button
                onClick={() => quickFill('user@sportsevo.com', 'password')}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
              >
                <span className="font-semibold text-zinc-100">User</span>
                <span className="block text-zinc-500">user@sportsevo.com</span>
              </button>
            </div>
            <button
              onClick={() => quickFill('manager@sportsevo.com', 'password')}
              className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
            >
              <span className="font-semibold text-zinc-100">Complex Manager</span>
              <span className="block text-zinc-500">manager@sportsevo.com</span>
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-emerald-500 hover:underline">
              Register now
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}