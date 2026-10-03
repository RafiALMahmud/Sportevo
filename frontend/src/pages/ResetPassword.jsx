import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { Alert, Button, Input } from '../components/ui'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [form, setForm] = useState({
    email: state?.email || '',
    code: '',
    password: '',
    password_confirmation: '',
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const { data } = await api.post('/reset-password', form)
      setMessage(data.message)
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : 'Reset failed.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-800 font-bold text-white">
              SE
            </span>
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">Reset your password</h2>
          <p className="mt-1 text-sm text-zinc-500">Enter the code and your new password.</p>
        </div>

        {error && (
          <div className="mb-4">
            <Alert type="error" message={error} />
          </div>
        )}
        {message && (
          <div className="mb-4">
            <Alert type="success" message={message} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-lg shadow-black/40">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="6-digit code"
            placeholder="Code from your email"
            inputMode="numeric"
            maxLength={6}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label="New password"
            type="password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            placeholder="Repeat password"
            value={form.password_confirmation}
            onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Reset password
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}