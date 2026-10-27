import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Seo from '../components/Seo'
import BrandLogo from '../components/BrandLogo'
import { Alert, Button, Input, Select } from '../components/ui'

export default function Register() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    role: 'user',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await register(form)
      navigate('/verify-email', { state: { email: data.user.email } })
    } catch (err) {
      const msg = err.response?.data?.message
      const errors = err.response?.data?.errors
      setError(
        msg ||
          (errors ? Object.values(errors).flat()[0] : 'Registration failed. Please try again.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <Seo title={t("Create Account")} description={t("Create a SportEvo account to request and manage your bookings.")} path="/register" noIndex />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" aria-label={t("SportEvo homepage")} className="inline-flex items-center gap-2">
            <BrandLogo />
          </Link>
          <h2 className="mt-4 text-2xl font-bold text-white">{t("Create your account")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("Join SportEvo today")}</p>
        </div>

        {error && (
          <div className="mb-4">
            <Alert type="error" message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm">
          <Input
            label={t("Full Name")}
            placeholder={t("John Doe")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t("Email")}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t("Phone")}
            type="tel"
            required
            minLength={7}
            maxLength={20}
            placeholder="01XXXXXXXXX"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label={t("Password")}
            type="password"
            placeholder={t("At least 8 characters")}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Input
            label={t("Confirm Password")}
            type="password"
            placeholder={t("Repeat password")}
            value={form.password_confirmation}
            onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
            required
          />
          <Select
            label={t("Account type")}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="user">{t("User")}</option>
            <option value="turf">{t("Sports complex owner")}</option>
          </Select>
          <Button type="submit" loading={loading} className="w-full">{t("Create account")}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">{t("Already have an account?")}{' '}
          <Link to="/login" className="font-medium text-emerald-500 hover:underline">{t("Sign in")}</Link>
        </p>
      </div>
    </div>
  )
}
