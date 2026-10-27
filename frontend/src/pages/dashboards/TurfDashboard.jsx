import { useTranslation } from '../../i18n/useTranslation'
import { money } from '../../utils/money'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { formError, withPhotos } from '../../api/forms'
import PhotoPicker from '../../components/PhotoPicker'
import FieldPricingInputs from '../../components/FieldPricingInputs'
import { FieldPlayersInput } from '../../components/FieldPlayers'
import AdvancePaymentInputs from '../../components/AdvancePaymentInputs'
import { fieldRateLabel } from '../../utils/fieldPricing'
import FieldGallery from '../../components/FieldGallery'
import SportChoices from '../../components/SportChoices'
import { getSports } from '../../api/catalog'
import Badge from '../../components/Badge'
import Spinner from '../../components/Spinner'
import Seo from '../../components/Seo'
import WorkflowPanel from '../../components/WorkflowPanel'
import OwnerSection, { OwnerIcon } from '../../components/OwnerSection'
import { bookingDisplayStatus } from '../../utils/bookingStatus'
import { Alert, Button, Card, Input, Select } from '../../components/ui'

const emptyField = { name: '', pricing_mode: 'slot', price_per_slot: '', price_per_hour: '', sports: [], players_per_side: '' }

export default function TurfDashboard() {
  const { t, locale } = useTranslation()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [sports, setSports] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState('')
  const [fieldForm, setFieldForm] = useState(emptyField)
  const [newField, setNewField] = useState(emptyField)
  const [complexDraft, setComplexForm] = useState({ name: '', email: null, phone: null, location: '', field_name: 'Main field', pricing_mode: 'slot', price_per_slot: '', price_per_hour: '', sports: [], advance_enabled: true, advance_amount: 500, advance_window_minutes: 60, payment_provider: 'bKash', payment_number: '' })
  const complexForm = { ...complexDraft, email: complexDraft.email ?? user?.email ?? '', phone: complexDraft.phone ?? user?.phone ?? '' }
  const [photos, setPhotos] = useState([])
  const [complexPhotos, setComplexPhotos] = useState([])
  const [newFieldPhotos, setNewFieldPhotos] = useState([])
  const turf = data?.turf
  const field = turf?.fields?.find((f) => String(f.id) === String(selected))
  const load = useCallback(async () => {
    try {
      const { data: result } = await api.get('/dashboard/turf')
      setData(result)
      setSelected((current) => result.turf?.fields.some((f) => String(f.id) === String(current)) ? current : String(result.turf?.fields[0]?.id || ''))
    } catch (e) { if (e.response?.status === 404) setData({ turf: null }); else setError(e.response?.data?.message || 'Unable to load dashboard.') }
  }, [])
  useEffect(() => { load(); getSports().then(({ data: r }) => setSports(r.sports)).catch(() => setError('Could not load sports.')) }, [load])
  useEffect(() => { if (field) setFieldForm({ name: field.name, pricing_mode: field.pricing_mode || 'slot', price_per_slot: field.price_per_slot, price_per_hour: field.price_per_hour ?? '', players_per_side: field.players_per_side ?? '', sports: field.sports.map((s) => s.id) }) }, [field])
  const act = async (method, url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try { const { data: result } = await api[method](url, payload); setMessage(result.message || 'Saved.'); await load(); getSports(true).then(({ data: catalog }) => setSports(catalog.sports)).catch(() => {}); return true }
    catch (e) { setError(formError(e)); return false }
    finally { setBusy(false) }
  }
  const sportChoices = (form, setter) => <SportChoices sports={sports} form={form} onChange={setter} />
  const fieldInputs = (form, setter) => <><Input label={t("Field / facility name")} required value={form.name} onChange={(e) => setter({ ...form, name: e.target.value })} /><FieldPlayersInput value={form.players_per_side} onChange={value => setter({ ...form, players_per_side: value })} disabled={busy} /><FieldPricingInputs form={form} onChange={setter} />{sportChoices(form, setter)}</>
  const bookingCard = (b) => <div key={b.id} className="my-2 rounded-lg border border-zinc-800 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{b.field?.name || t("Main field")} · {new Date(b.start_time).toLocaleString(locale)} – {new Date(b.end_time).toLocaleTimeString(locale)}</strong><Badge status={bookingDisplayStatus(b)} /></div>
    {b.user ? <p className="my-2">{b.user.name} · {b.user.email} · {b.user.phone || t("No phone supplied")}</p> : !['available', 'unavailable'].includes(b.status) && <p className="my-2 text-zinc-400">{t("Customer contact details are hidden until acceptance.")}</p>}
    {b.status === 'unavailable' && <p className="my-2 text-orange-300">{t("Unavailable: ")}{b.unavailable_reason || t("Blocked by owner")}</p>}
    {b.price != null && <p>{t("Quoted price ")}{money(b.price)}{t(" · Commission ")}{b.commission_rate}% {b.commission_amount != null && '(' + money(b.commission_amount) + ')'}</p>}
    {b.cancellation_request && <p className="text-amber-300">{t("Cancellation: ")}{t(b.cancellation_request.owner_status)}</p>}
    <div className="mt-2 flex gap-2">{b.status === 'pending' && <><Button disabled={busy} onClick={() => act('post', '/bookings/' + b.id + '/accept')}>{t("Accept")}</Button><Button disabled={busy} variant="danger" onClick={() => act('post', '/bookings/' + b.id + '/reject')}>{t("Reject")}</Button></>}
      {b.status === 'booked' && (!b.advance_required || b.advance_status === 'confirmed') && new Date(b.end_time) <= new Date() && b.cancellation_request?.owner_status !== 'pending' && <Button disabled={busy} onClick={() => act('post', '/bookings/' + b.id + '/complete')}>{t("Mark completed")}</Button>}</div>
  </div>
  if (!data) return error ? <Alert message={error} /> : <Spinner />
  if (turf?.deleted_at) return <div className="space-y-4"><Link to="/reports" className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">{t("Report an issue to admin")}</Link><h1 className="text-2xl text-white">{turf.name}{t(" · archived")}</h1><Alert type="info" message="An admin deleted this complex. Its history and wallet remain available. Use a new owner account for another complex." /><Card><h2>{t("Platform commission: ")}{turf.commission_rate}%</h2><p>{t("Wallet owed: ")}{money(data.wallet?.balance)}{t(" (negative balance is credit).")}</p>{data.wallet?.entries?.map((w) => <p key={w.id}>{t(w.type)} · {money(w.amount)} · {w.note}</p>)}{data.wallet?.refunds?.map((w) => <p key={'r' + w.id}>{t("Commission reversal · booking #")}{w.booking_id} · {money(w.amount)}</p>)}</Card></div>
  return <div className="owner-management space-y-6">
    <Seo title={t("Complex owner dashboard")} path="/dashboard/turf" noIndex />
    <Link to="/reports" className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">{t("Report an issue to admin")}</Link>
    <h1 className="text-2xl font-bold text-white">{turf?.name || t("Register your sports complex")}</h1>
    {turf && <><p className="owner-page-hint">{t('Open only the section you need. Your bookings stay on the schedule page.')}</p><div className="owner-quick-actions">
      <Link to={`/dashboard/turf/schedule?field_id=${selected}`}><OwnerIcon name="calendar" /><span><strong>{t('Slots & bookings')}</strong><small>{t('Create slots or change a time')}</small></span></Link>
      <Link to="/dashboard/turf/payments"><OwnerIcon name="price" /><span><strong>{t('Advance payments')}</strong><small>{t('Check payments and payment numbers')}</small></span></Link>
      <Link to="/profile"><OwnerIcon name="settings" /><span><strong>{t('Complex contact details')}</strong><small>{t('Name, phone and address')}</small></span></Link>
    </div></>}
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {!turf ? <Card><p className="mb-4 text-zinc-400">{t("One owner account can register one complex. Your first field is created automatically. An archived complex cannot be replaced on the same account.")}</p>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await act('post', '/turfs', withPhotos(complexForm, complexPhotos))) setComplexPhotos([]) }}>
        {Object.entries({ name: 'Complex name', email: 'Contact email', phone: 'Contact phone', location: 'Complex location', field_name: 'First field name' }).map(([key, label]) => <Input key={key} label={t(label)} required type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={complexForm[key]} onChange={(e) => setComplexForm({ ...complexForm, [key]: e.target.value })} />)}
        <FieldPlayersInput value={complexForm.players_per_side} onChange={value => setComplexForm({ ...complexForm, players_per_side: value })} disabled={busy} />
        <FieldPricingInputs form={complexForm} onChange={setComplexForm} />
        <AdvancePaymentInputs form={complexForm} onChange={setComplexForm} disabled={busy} />
        {sportChoices(complexForm, setComplexForm)}<PhotoPicker files={complexPhotos} onChange={setComplexPhotos} disabled={busy} label={t("First field photos (optional)")} /><Button type="submit" loading={busy}>{t("Register complex")}</Button>
      </form></Card> : <>
      {!turf.is_approved && <Alert type="info" message="Your complex is awaiting admin approval. You can prepare its fields and schedules." />}
      <Card><h2 className="text-lg font-semibold">{t("Pending requests · all fields")}</h2>{!data.requests.length && <p className="mt-3 text-zinc-400">{t("No pending requests.")}</p>}{data.requests.map(bookingCard)}</Card>
      <OwnerSection title="Platform balance" hint="See what you owe SportEvo" icon="price">
        <div><h2 className="text-lg font-semibold">{t("Commission & wallet")}</h2><p className="mt-2 text-2xl text-emerald-300">{Number(turf.commission_rate)}{t("% platform commission")}</p><p className="text-sm text-zinc-400">{t('Commission is recorded after the required advance is confirmed or waived. Bookings without an advance follow normal acceptance.')}</p><p className="mt-4 text-2xl text-amber-300">{money(data.wallet?.balance)}</p><p className="text-sm">{t("Outstanding owed to SportEvo (a negative balance is credit).")}</p>
          <details className="mt-3"><summary className="cursor-pointer">{t("Recent wallet activity")}</summary>{data.wallet?.entries?.map((w) => <p key={w.id} className="mt-2 text-sm">{t(w.type)} · {money(w.amount)} · {w.note}</p>)}{data.wallet?.refunds?.map((w) => <p key={'r' + w.id} className="mt-2 text-sm text-emerald-300">{t("Commission reversal · booking #")}{w.booking_id} · {money(w.amount)}</p>)}</details>
        </div>
      </OwnerSection>
      <OwnerSection title="Edit fields & photos" hint="Change a field name, regular price or photos" icon="field"><Select label={t("Manage field")} disabled={busy} value={selected} onChange={(e) => { setSelected(e.target.value); setPhotos([]) }}>{turf.fields.map((f) => <option key={f.id} value={f.id}>{f.name} · {fieldRateLabel(f)}</option>)}</Select>
        {field && <div className="mt-4 grid gap-5 md:grid-cols-2"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act('put', '/turfs/' + turf.id + '/fields/' + field.id, fieldForm) }}>{fieldInputs(fieldForm, setFieldForm)}<Button type="submit" loading={busy}>{t("Save field")}</Button><p className="text-xs text-zinc-400">{t("Price changes do not alter existing booking quotes.")}</p></form>
          <div><h3 className="mb-2 font-semibold">{field.name}{t(" photos")}</h3><PhotoPicker key={selected} files={photos} onChange={setPhotos} disabled={busy} remaining={24 - field.photos.length} label={t("Add field photos")} />
            <div className="field-photo-actions">
              <FieldGallery key={field.id} photos={field.photos} name={field.name} compact />
              <Button className="min-h-11" loading={busy} disabled={!photos.length} onClick={async () => { if (await act('post', '/turfs/' + turf.id + '/photos', withPhotos({ field_id: field.id }, photos))) setPhotos([]) }}>{t("Upload photos")}</Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">{field.photos.map((photo) => <div key={photo.id}><img loading="lazy" decoding="async" src={photo.url} alt={field.name} className="h-24 w-full rounded object-cover" /><button disabled={busy} className="text-xs text-rose-300" onClick={() => { if (confirm(t("Delete this photo?"))) act('delete', '/turfs/' + turf.id + '/photos/' + photo.id) }}>{t("Delete photo")}</button></div>)}</div>
          </div></div>}
      </OwnerSection>
      <OwnerSection title="Add another field" hint="Register a new field or court" icon="field"><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await act('post', '/turfs/' + turf.id + '/fields', withPhotos(newField, newFieldPhotos))) { setNewField(emptyField); setNewFieldPhotos([]) } }}>{fieldInputs(newField, setNewField)}<PhotoPicker files={newFieldPhotos} onChange={setNewFieldPhotos} disabled={busy} /><Button loading={busy} type="submit">{t("Create field")}</Button></form>
      </OwnerSection>
      <OwnerSection title="Cancellations & reviews" hint="Reply to cancellation requests and manage reviews" icon="calendar"><WorkflowPanel onChange={load} /></OwnerSection>
      <OwnerSection title="Booking notifications" hint="Choose whether to receive booking emails" icon="settings"><label className="flex items-center gap-3"><input type="checkbox" checked={turf.booking_request_emails !== false} disabled={busy} onChange={(e) => act('put', '/my-turf', { booking_request_emails: e.target.checked })} />{t("Email me when a booking request is sent")}</label><p className="mt-3 text-sm text-zinc-400">{t("The platform emails your account and complex contact address when they differ.")}</p></OwnerSection>
      <Link to="/profile" className="inline-block text-sm text-emerald-400">{t("Manage your profile & complex details →")}</Link>
    </>}
  </div>
}
