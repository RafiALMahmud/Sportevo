import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { formError } from '../api/forms'
import { useTranslation } from '../i18n/useTranslation'
import AdvancePaymentInputs from './AdvancePaymentInputs'
import BookingAdvancePanel from './BookingAdvancePanel'
import { Alert, Button, Card } from './ui'

export default function AdvancePaymentSettings({ turfId }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.get(`/turfs/${turfId}/advance-settings`, { signal: controller.signal }).then(({ data }) => setForm(data.settings))
      .catch(err => { if (err.code !== 'ERR_CANCELED') setError(formError(err)) })
    return () => controller.abort()
  }, [turfId])
  const save = async payload => {
    setBusy(true); setError(''); setMessage('')
    try { const { data } = await api.put(`/turfs/${turfId}/advance-settings`, payload); setForm(data.settings); setMessage(data.message) }
    catch (err) { setError(formError(err)) }
    finally { setBusy(false) }
  }
  return <Card className="space-y-4">
    <h2 className="text-lg font-semibold">{t('Advance payment settings')}</h2>
    <p className="text-sm text-zinc-400">{t('Payments go directly to your selected account. Check receipt before confirming a booking. Settings apply to new requests; existing requests keep their terms.')}</p>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {!form ? <p>{t('Loading…')}</p> : <>
      {!form.payment_number && <Alert type="info" message="Add your receiving payment number to finish setting up advance payments." />}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); save(form) }}><AdvancePaymentInputs form={form} onChange={setForm} disabled={busy} /><Button type="submit" loading={busy}>{t('Save advance settings')}</Button></form>
      {form.advance_enabled && <Button variant="secondary" disabled={busy} onClick={() => save({ advance_enabled: false })}>{t('Turn off advances for new requests')}</Button>}
    </>}
  </Card>
}

export function AdvancePaymentInbox({ turfId }) {
  const { t, locale } = useTranslation()
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/turfs/${turfId}/advance-bookings`, { params: { page } })
      if (page > (data.last_page || 1)) { setPage(data.last_page || 1); return }
      setResult(data); setError('')
    }
    catch (err) { setError(formError(err)) }
  }, [turfId, page])
  useEffect(() => {
    load()
    const timer = setInterval(() => { if (!document.hidden) load() }, 30000)
    return () => clearInterval(timer)
  }, [load])
  return <Card className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t('Advance payments to review')}</h2><Button variant="secondary" onClick={load}>{t('Refresh')}</Button></div>
    {error && <Alert message={error} />}
    {!result ? <p>{t('Loading…')}</p> : !result.data.length ? <p className="text-zinc-400">{t('No advance payments are awaiting action.')}</p> : result.data.map(booking => <div className="space-y-3 rounded-xl border border-zinc-700 p-4" key={booking.id}>
      <h3 className="font-semibold">{booking.field?.name} · #{booking.id}</h3><p className="text-sm">{new Date(booking.start_time).toLocaleString(locale)}</p>
      {booking.user && <p className="break-words text-sm text-zinc-400">{booking.user.name} · {booking.user.email} · {booking.user.phone}</p>}
      <BookingAdvancePanel booking={booking} manager onChange={load} />
    </div>)}
    {result?.last_page > 1 && <div className="flex items-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{t('Previous')}</Button><span>{page} / {result.last_page}</span><Button variant="secondary" disabled={page >= result.last_page} onClick={() => setPage(value => value + 1)}>{t('Next')}</Button></div>}
  </Card>
}

export function AdvancePaymentAdminTools({ turfId }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return <details className="mt-3" onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium text-emerald-400">{t('Manage advance payments')}</summary>
    {open && <div className="mt-3 space-y-4"><AdvancePaymentSettings turfId={turfId} /><AdvancePaymentInbox turfId={turfId} /></div>}
  </details>
}
