import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Input } from '../components/ui'

export default function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [email, setEmail] = useState(state?.email || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await verifyEmail(email, code)
      const role = data.user.role
      navigate(
        role === 'superadmin' || role === 'admin' ? '/dashboard/platform' : role === 'turf' ? '/dashboard/turf' : '/dashboard/user',
        { replace: true }
      )
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : 'Verification failed.')
      )
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError('')
    setMessage('')
    try {
      const data = await resendCode(email)
      setMessage(data.message)
    } catch {
      setError('Could not resend the code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-800 font-bold text-white animate-pulse-glow">
              SE
            </span>
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">Verify your email</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Enter the 6-digit code we emailed to <span className="text-emerald-400">{email || 'your inbox'}</span>
          </p>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Verification code"
            placeholder="6-digit code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Verify &amp; continue
          </Button>
          <Button type="button" variant="secondary" onClick={handleResend} loading={resending} className="w-full">
            Resend code
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already verified?{' '}
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}