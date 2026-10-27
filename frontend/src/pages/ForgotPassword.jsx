import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Seo from '../components/Seo'
import BrandLogo from '../components/BrandLogo'
import { Alert, Button, Input } from '../components/ui'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const { data } = await api.post('/forgot-password', { email })
      setMessage(data.message)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <Seo title={t("Forgot Password")} description={t("Request a reset code for your SportEvo account.")} path="/forgot-password" noIndex />
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link to="/" aria-label={t("SportEvo homepage")} className="inline-flex items-center gap-2">
            <BrandLogo />
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">{t("Forgot password?")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("We'll email you a 6-digit code to reset your password.")}</p>
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
            label={t("Email")}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} className="w-full">{t("Send reset code")}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">{t("Remembered it?")}{' '}
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">{t("Back to sign in")}</Link>
        </p>
      </div>
    </div>
  )
}
