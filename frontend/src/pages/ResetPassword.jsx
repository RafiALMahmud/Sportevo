import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/client'
import Seo from '../components/Seo'
import BrandLogo from '../components/BrandLogo'
import { Alert, Button, Input } from '../components/ui'

export default function ResetPassword() {
  const { t } = useTranslation()
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
      <Seo title={t("Reset Password")} description={t("Set a new password for your SportEvo account.")} path="/reset-password" noIndex />
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <Link to="/" aria-label={t("SportEvo homepage")} className="inline-flex items-center gap-2">
            <BrandLogo />
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">{t("Reset your password")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("Enter the code and your new password.")}</p>
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
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t("6-digit code")}
            placeholder={t("Code from your email")}
            inputMode="numeric"
            maxLength={6}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label={t("New password")}
            type="password"
            placeholder={t("At least 6 characters")}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Input
            label={t("Confirm new password")}
            type="password"
            placeholder={t("Repeat password")}
            value={form.password_confirmation}
            onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
            required
          />
          <Button type="submit" loading={loading} className="w-full">{t("Reset password")}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">{t("Back to sign in")}</Link>
        </p>
      </div>
    </div>
  )
}
