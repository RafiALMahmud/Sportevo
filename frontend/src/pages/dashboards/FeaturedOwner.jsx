import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { formError } from '../../api/forms'
import { useTranslation } from '../../i18n/useTranslation'
import { money } from '../../utils/money'
import { featuredTime, featureStatus } from '../../utils/featured'
import { Alert, Button, Card, Input, Select } from '../../components/ui'
import Spinner from '../../components/Spinner'
import Seo from '../../components/Seo'

export default function FeaturedOwner() {
  const { t, n, locale } = useTranslation()
  const [data, setData] = useState(null)
  const [days, setDays] = useState(15)
  const [provider, setProvider] = useState('')
  const [references, setReferences] = useState({})
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async signal => {
    try { const response = await api.get('/featured/owner', { params: { page }, signal }); setData(response.data) }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(formError(err)) }
  }, [page])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const act = async (url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try { const result = await api.post(url, payload); setMessage(result.data.message); await load() }
    catch (err) { setError(formError(err)) }
    finally { setBusy(false) }
  }
  if (!data) return error ? <Alert message={error} /> : <Spinner />
  const methods = data.payment.methods
  const method = methods.find(item => item.provider === provider) || methods[0]
  const placement = data.placement
  const active = placement?.is_enabled && new Date(placement.ends_at) > new Date()
  const open = data.requests.data.some(item => ['awaiting_payment', 'submitted'].includes(item.status))
  return <div className="featured-panel mx-auto max-w-4xl space-y-6">
    <Seo title={t('Feature your complex')} path="/dashboard/turf/featured" noIndex />
    <Link to="/dashboard/turf/schedule" className="map-text-button">{t('Slots & bookings')}</Link>
    <h1 className="text-2xl font-bold">{t('Feature your complex')}</h1>
    <p>{t('Show your complex on the SportEvo homepage. Choose a package, pay SportEvo, and send your transaction ID for review.')}</p>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {!data.turf ? <Card><p>{t('Register your complex first.')}</p><Link to="/dashboard/turf">{t('Manage your complex')}</Link></Card> : <>
      <Card className="space-y-3"><h2 className="text-xl font-semibold">{data.turf.name}</h2>
        {active ? <p>{t('Featured until')}: <strong>{featuredTime(placement.ends_at, locale)}</strong></p> : <p>{t('Your complex is not currently featured.')}</p>}
        <p>{t('The paid period starts after admin approval. Renewals extend your existing expiry date.')}</p>
        <p>{t('Featured places reserved')}: {n(data.occupied)} / {n(data.capacity)}</p>
      </Card>
      {!data.turf.is_approved && <Alert type="info" message="Your complex must be approved before requesting a featured placement." />}
      {!methods.length && <Alert type="info" message="SportEvo payment details are not configured yet. Contact SportEvo before paying." />}
      <Card className="space-y-4"><h2 className="text-lg font-semibold">{t('1. Choose your package')}</h2>
        <div className="featured-plans">{data.plans.map(plan => <button type="button" key={plan.days} aria-pressed={days === plan.days} onClick={() => setDays(plan.days)} disabled={busy}>
          <strong>{t('{count} days', { count: n(plan.days) })}</strong><span>{money(plan.amount)}</span>
        </button>)}</div>
        <Select label={t('Payment method')} disabled={busy || !methods.length} value={method?.provider || ''} onChange={event => setProvider(event.target.value)}>
          {!methods.length && <option value="">{t('Not configured')}</option>}{methods.map(item => <option key={item.provider} value={item.provider}>{item.provider}</option>)}
        </Select>
        {data.payment.instructions && <p className="whitespace-pre-wrap">{data.payment.instructions}</p>}
        <p className="text-sm">{t('Create a request before paying. Use the receiving number shown on that request.')}</p>
        <Button disabled={busy || open || !data.turf.is_approved || !method} onClick={() => act('/featured/requests', { days, provider: method.provider })}>{t('Create featured request')}</Button>
        {open && <p>{t('You already have an open request. Complete or cancel it below.')}</p>}
      </Card>
      <section className="space-y-4"><h2 className="text-xl font-semibold">{t('2. Payment & request history')}</h2>
        {!data.requests.data.length && <p>{t('No featured requests yet.')}</p>}
        {data.requests.data.map(item => <Card key={item.id} className="space-y-3 featured-request">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">#{n(item.id)} · {t('{count} days', { count: n(item.days) })} · {money(item.amount)}</h3><strong>{t(featureStatus[item.status])}</strong></div>
          <p>{t('Pay SportEvo using')}: {item.provider} · <strong className="break-all">{item.receiver_number}</strong></p>
          {item.payment_reference && <p>{t('Transaction ID / reference')}: <span className="break-all">{item.payment_reference}</span></p>}
          {item.decision_note && <p>{t('Admin note')}: {item.decision_note}</p>}
          {item.status === 'approved' && <p>{featuredTime(item.starts_at, locale)} — {featuredTime(item.ends_at, locale)}</p>}
          {['awaiting_payment', 'submitted'].includes(item.status) && <form className="space-y-3" onSubmit={event => { event.preventDefault(); act(`/featured/requests/${item.id}/reference`, { reference: references[item.id] ?? item.payment_reference ?? '' }) }}>
            <Input label={t('Transaction ID / reference')} required minLength={2} maxLength={160} disabled={busy} value={references[item.id] ?? item.payment_reference ?? ''} onChange={event => setReferences({ ...references, [item.id]: event.target.value })} />
            <Button type="submit" disabled={busy}>{t('Send payment reference')}</Button>
          </form>}
          {item.status === 'awaiting_payment' && !item.payment_reference && <Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm(t('Cancel this unpaid featured request?'))) act(`/featured/requests/${item.id}/cancel`) }}>{t('Cancel unpaid request')}</Button>}
        </Card>)}
        {data.requests.last_page > 1 && <div className="map-actions"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button><span>{n(page)} / {n(data.requests.last_page)}</span><Button variant="secondary" disabled={page >= data.requests.last_page} onClick={() => setPage(page + 1)}>{t('Next')}</Button></div>}
      </section>
    </>}
  </div>
}
