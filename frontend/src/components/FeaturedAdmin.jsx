import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { formError } from '../api/forms'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../i18n/useTranslation'
import { money } from '../utils/money'
import { featuredTime, featuredDateInput, featureStatus } from '../utils/featured'
import { Alert, Button, Card, Input, Select } from './ui'

function PaymentSettings() {
  const { t } = useTranslation()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.get('/admin/featured/payment-settings', { signal: controller.signal }).then(({ data }) => setForm({ instructions: data.instructions, ...Object.fromEntries(data.methods.map(item => [item.provider, item.number])) }))
      .catch(err => { if (err.code !== 'ERR_CANCELED') setError(formError(err)) })
    return () => controller.abort()
  }, [])
  return <Card className="space-y-4"><h2 className="text-lg font-semibold">{t('SportEvo receiving accounts')}</h2>
    <p>{t('Only superadmins can change these details. Existing payment requests keep their original receiving number.')}</p>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {form && <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('')
      try {
        const methods = ['bKash', 'Nagad', 'Card'].filter(provider => form[provider]?.trim()).map(provider => ({ provider, number: form[provider].trim() }))
        const { data } = await api.put('/admin/featured/payment-settings', { methods, instructions: form.instructions }); setMessage(data.message)
      } catch (err) { setError(formError(err)) } finally { setBusy(false) }
    }}>
      {['bKash', 'Nagad', 'Card'].map(provider => <Input key={provider} label={t('{provider} receiving number', { provider })} disabled={busy} value={form[provider] || ''} maxLength={80} onChange={event => setForm({ ...form, [provider]: event.target.value })} />)}
      <Input label={t('Payment instructions')} disabled={busy} value={form.instructions || ''} maxLength={800} onChange={event => setForm({ ...form, instructions: event.target.value })} />
      <p className="text-sm">{t('Leave a number blank to disable that payment method. Never enter a PIN, password or card security code.')}</p>
      <Button type="submit" disabled={busy}>{t('Save SportEvo payment details')}</Button>
    </form>}
  </Card>
}

function PlacementEditor({ item, busy, act }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => ({ starts_at: featuredDateInput(item.starts_at), ends_at: featuredDateInput(item.ends_at), priority: item.priority, note: '' }))
  return <Card className="space-y-3 featured-placement"><h3 className="text-lg font-semibold">{item.turf?.name || '#' + item.turf_id}</h3>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); act('put', `/admin/featured/placements/${item.id}`, { ...form, starts_at: form.starts_at + ':00+06:00', ends_at: form.ends_at + ':00+06:00' }) }}>
      <div className="featured-edit-grid"><Input label={t('Featured from')} type="datetime-local" required disabled={busy} value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} />
        <Input label={t('Featured until')} type="datetime-local" required disabled={busy} value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} />
        <Input label={t('Display order')} type="number" min={0} max={999} required disabled={busy} value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} /></div>
      <p className="text-sm">{t('Times are in Bangladesh time. Lower display-order numbers appear first.')}</p>
      <Input label={t('Reason / admin note')} minLength={2} maxLength={500} required disabled={busy} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
      <div className="map-actions"><Button type="submit" disabled={busy}>{t('Save placement')}</Button><Button type="button" variant="danger" disabled={busy || form.note.trim().length < 2} onClick={() => { if (window.confirm(t('Remove this featured placement now? Payment history will remain.'))) act('delete', `/admin/featured/placements/${item.id}`, { note: form.note }) }}>{t('Remove from homepage')}</Button></div>
    </form>
  </Card>
}

export default function FeaturedAdmin({ onChange }) {
  const { t, n, locale } = useTranslation()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviews, setReviews] = useState({})
  const [search, setSearch] = useState('')
  const [complexes, setComplexes] = useState([])
  const [grant, setGrant] = useState({ turf_id: '', days: 15, priority: 100, note: '' })
  const load = useCallback(async signal => {
    try { const response = await api.get('/admin/featured', { params: { status, page }, signal }); setData(response.data) }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(formError(err)) }
  }, [status, page])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const act = async (method, url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await (method === 'delete' ? api.delete(url, { data: payload }) : api[method](url, payload))
      setMessage(result.data.message); await load(); onChange?.()
    } catch (err) { setError(formError(err)) }
    finally { setBusy(false) }
  }
  return <div className="featured-panel space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">{t('Homepage featured complexes')}</h2><Button variant="secondary" onClick={() => load()} disabled={busy}>{t('Refresh')}</Button></div>
    <p>{t('Review payments, add complexes directly, change dates or order, and remove placements whenever needed. Payment history is retained.')}</p>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {user?.role === 'superadmin' && <PaymentSettings />}
    {data && <>
      <p>{t('Featured places reserved')}: {n(data.occupied)} / {n(data.capacity)}</p>
      <Card className="space-y-4"><h3 className="font-semibold">{t('Add a complex directly')}</h3><p>{t('Direct admin placements do not record a payment. Use the request approval below to confirm an owner payment.')}</p>
        <form className="featured-find-complex" onSubmit={async event => {
          event.preventDefault(); setError('')
          try { const response = await api.get('/admin/turfs', { params: { search, status: 'approved', per_page: 50 } }); setComplexes(response.data.data.filter(item => !item.deleted_at)) }
          catch (err) { setError(formError(err)) }
        }}><Input label={t('Search by complex name')} value={search} onChange={event => setSearch(event.target.value)} maxLength={255} /><Button type="submit" variant="secondary">{t('Search')}</Button></form>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); act('post', '/admin/featured/placements', grant) }}>
          <Select label={t('Select complex')} required disabled={busy} value={grant.turf_id} onChange={event => setGrant({ ...grant, turf_id: event.target.value })}><option value="">{t('Search and choose a complex')}</option>{complexes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
          <Select label={t('Featured duration')} value={grant.days} disabled={busy} onChange={event => setGrant({ ...grant, days: event.target.value })}>{data.plans.map(plan => <option key={plan.days} value={plan.days}>{t('{count} days', { count: n(plan.days) })}</option>)}</Select>
          <Input label={t('Display order')} type="number" min={0} max={999} required value={grant.priority} disabled={busy} onChange={event => setGrant({ ...grant, priority: event.target.value })} />
          <Input label={t('Reason / admin note')} required minLength={2} maxLength={500} disabled={busy} value={grant.note} onChange={event => setGrant({ ...grant, note: event.target.value })} />
          <Button type="submit" disabled={busy || !grant.turf_id}>{t('Add featured placement')}</Button>
        </form>
      </Card>
      <section className="space-y-3"><h3 className="text-lg font-semibold">{t('Manage featured placements')}</h3>{!data.placements.length && <p>{t('No active featured placements.')}</p>}
        {data.placements.map(item => <PlacementEditor key={item.id + '|' + item.updated_at} item={item} busy={busy} act={act} />)}
      </section>
      <section className="space-y-4"><h3 className="text-lg font-semibold">{t('Featured payment requests')}</h3>
        <Select label={t('Request status')} value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}>{['open', 'awaiting_payment', 'submitted', 'approved', 'rejected', 'cancelled'].map(value => <option key={value} value={value}>{t(value === 'open' ? 'Open requests' : featureStatus[value])}</option>)}</Select>
        {!data.requests.data.length && <p>{t('No featured requests found.')}</p>}
        {data.requests.data.map(item => {
          const review = reviews[item.id] || { note: '', payment_received: false }
          return <Card key={item.id} className="space-y-3 featured-request"><h4 className="font-semibold">#{n(item.id)} · {item.turf?.name} · {t(featureStatus[item.status])}</h4>
            <p>{item.owner?.name} · {item.owner?.email}</p><p>{t('{count} days', { count: n(item.days) })} · {money(item.amount)} · {item.provider}</p>
            <p>{t('Receiving number')}: <span className="break-all">{item.receiver_number}</span></p>
            <p>{t('Transaction ID / reference')}: <strong className="break-all">{item.payment_reference || t('Not submitted')}</strong></p>
            {item.decision_note && <p>{t('Admin note')}: {item.decision_note}</p>}
            {item.starts_at && <p>{featuredTime(item.starts_at, locale)} — {featuredTime(item.ends_at, locale)}</p>}
            {['awaiting_payment', 'submitted'].includes(item.status) && <div className="space-y-3">
              <label className="featured-receipt"><input type="checkbox" disabled={busy} checked={review.payment_received} onChange={event => setReviews({ ...reviews, [item.id]: { ...review, payment_received: event.target.checked } })} />{t('I verified that SportEvo received this payment.')}</label>
              <Input label={t('Reason / admin note')} maxLength={500} disabled={busy} value={review.note} onChange={event => setReviews({ ...reviews, [item.id]: { ...review, note: event.target.value } })} />
              <div className="map-actions"><Button disabled={busy || !review.payment_received} onClick={() => act('post', `/admin/featured/requests/${item.id}/approve`, review)}>{t('Confirm payment & feature')}</Button>
                <Button variant="danger" disabled={busy || review.note.trim().length < 2} onClick={() => { if (window.confirm(t('Reject this request? Resolve any received payment with the owner separately.'))) act('post', `/admin/featured/requests/${item.id}/reject`, { note: review.note }) }}>{t('Reject request')}</Button></div>
            </div>}
          </Card>
        })}
        {data.requests.last_page > 1 && <div className="map-actions"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button><span>{n(page)} / {n(data.requests.last_page)}</span><Button variant="secondary" disabled={page >= data.requests.last_page} onClick={() => setPage(page + 1)}>{t('Next')}</Button></div>}
      </section>
    </>}
  </div>
}
