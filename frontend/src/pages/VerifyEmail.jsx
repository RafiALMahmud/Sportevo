import { useTranslation } from '../i18n/useTranslation'
import { dashboardPath } from '../utils/dashboardPath'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Seo from '../components/Seo'
import BrandLogo from '../components/BrandLogo'
import { Alert, Button, Input } from '../components/ui'

export default function VerifyEmail() {
  const { t } = useTranslation()
  const { verifyEmail, resendCode } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const email = state?.email || ''
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
        dashboardPath(role),
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

  if (!email) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <Seo title={t("Verify Email")} description={t("Enter the 6-digit code we emailed you to activate your account.")} path="/verify-email" noIndex />
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link to="/" aria-label={t("SportEvo homepage")} className="inline-flex items-center gap-2">
            <BrandLogo />
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">{t("Verify your email")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("Enter the 6-digit code we emailed to ")}<span className="text-emerald-400">{email || t("your inbox")}</span>
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
            label={t("Verification code")}
            placeholder={t("6-digit code")}
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} className="w-full">{t("Verify & continue")}</Button>
          <Button type="button" variant="secondary" onClick={handleResend} loading={resending} className="w-full">{t("Resend code")}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">{t("Already verified?")}{' '}
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">{t("Sign in")}</Link>
        </p>
      </div>
    </div>
  )
}
