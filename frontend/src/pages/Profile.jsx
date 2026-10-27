import { useTranslation } from '../i18n/useTranslation'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { formError } from '../api/forms'
import { useAuth } from '../context/AuthContext'
import DeleteAccountCard from '../components/DeleteAccountCard'
import Seo from '../components/Seo'
import Spinner from '../components/Spinner'
import { Alert, Button, Card, Input } from '../components/ui'

const roles = { user: 'Customer', turf: 'Complex owner', admin: 'Admin', superadmin: 'Superadmin' }

function ComplexProfile() {
  const { t } = useTranslation()
  const [turf, setTurf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const load = async () => {
    const { data } = await api.get('/dashboard/turf')
    setTurf(data.turf)
  }
  useEffect(() => {
    const controller = new AbortController()
    api.get('/dashboard/turf', { signal: controller.signal }).then(({ data }) => setTurf(data.turf))
      .catch((e) => { if (e.code !== 'ERR_CANCELED' && e.response?.status !== 404) setError(formError(e, 'Unable to load complex details.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const save = async (method, url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try { const { data } = await api[method](url, payload); await load(); setMessage(data.message) }
    catch (e) { setError(formError(e)) }
    finally { setBusy(false) }
  }
  if (loading) return <Spinner />
  return <div className="space-y-4">
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {!turf ? <Card><h2 className="text-lg font-semibold">{t("Your sports complex")}</h2><p className="mt-2 text-zinc-400">{t("Create your complex and its first field, including photos, from your dashboard.")}</p><Link to="/dashboard/turf" className="mt-3 inline-block text-emerald-400">{t("Create complex & first field →")}</Link></Card>
      : turf.deleted_at ? <Card><h2 className="text-lg font-semibold">{turf.name}{t(" · archived")}</h2><p className="mt-2 text-zinc-400">{t("Your complex history is retained. Contact an admin to manage this owner account.")}</p></Card> : <>
        <Card><h2 className="text-lg font-semibold">{t("Complex details")}</h2><p className="mt-1 text-sm text-zinc-400">{t("These contact details belong to your sports complex.")}</p><form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); save('put', '/my-turf', Object.fromEntries(new FormData(e.currentTarget))) }}>
          {['name', 'email', 'phone', 'location'].map((key) => <Input key={key + (turf[key] || '')} name={key} label={key === 'name' ? t("Complex name") : key.charAt(0).toUpperCase() + key.slice(1)} defaultValue={turf[key] || ''} required={key !== 'phone'} type={key === 'email' ? 'email' : 'text'} disabled={busy} />)}<Button loading={busy} type="submit">{t("Save complex details")}</Button>
        </form></Card>
        <Card><h2 className="text-lg font-semibold">{t("Request complex deletion")}</h2><p className="my-2 text-sm text-zinc-400">{t("Only admins can delete a complex and manage its owner account. Resolve open bookings first. Booking, wallet and activity history is retained.")}</p>
          {turf.deletion_request && <p className="mb-3 text-amber-300">{t("Request status: ")}{t(turf.deletion_request.status)}</p>}
          {(!turf.deletion_request || turf.deletion_request.status === 'rejected') && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (confirm(t("Send a complex deletion request to admins?"))) save('post', `/turfs/${turf.id}/deletion-request`, { reason }) }}><Input label={t("Reason")} required maxLength={1500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /><Button loading={busy} variant="danger" type="submit">{t("Request deletion")}</Button></form>}
        </Card>
      </>}
  </div>
}

export default function Profile() {
  const { t } = useTranslation()
  const { user, updateProfile } = useAuth()
  const [form, setForm] = useState(() => ({ name: user.name, phone: user.phone || '' }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { const data = await updateProfile(form); setMessage(data.message) }
    catch (e) { setError(formError(e, 'Unable to save profile.')) }
    finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <Seo title={t("My Profile")} path="/profile" noIndex />
    <div><h1 className="text-2xl font-bold text-white">{t("My profile")}</h1><p className="mt-1 text-zinc-400">{t("Your account details and settings.")}</p></div>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    <Card><h2 className="text-lg font-semibold">{t("Account details")}</h2><p className="mt-1 text-sm text-emerald-400">{t(roles[user.role])}</p><form onSubmit={submit} className="mt-4 space-y-4">
      <Input label={t("Full name")} aria-label={t("Full name")} required minLength={2} maxLength={255} value={form.name} disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label={t("Email")} type="email" value={user.email} disabled /><p className="text-xs text-zinc-400">{t("Your verified email is used for sign-in and notifications.")}</p>
      <Input label={t("Phone")} aria-label={t("Phone")} type="tel" required minLength={7} maxLength={20} value={form.phone} disabled={busy} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <Button type="submit" loading={busy}>{t("Save profile")}</Button>
    </form></Card>
    {user.role === 'turf' ? <ComplexProfile /> : <DeleteAccountCard />}
  </div>
}
