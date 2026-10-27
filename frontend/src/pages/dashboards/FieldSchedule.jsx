import { formatNumber } from '../../i18n/language'
import { useTranslation } from '../../i18n/useTranslation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { formError } from '../../api/forms'
import { money } from '../../utils/money'
import { fieldRateLabel } from '../../utils/fieldPricing'
import FieldPricingInputs from '../../components/FieldPricingInputs'
import SlotGenerationForm from '../../components/SlotGenerationForm'
import SlotPriceEditor from '../../components/SlotPriceEditor'
import { FieldPlayersLabel } from '../../components/FieldPlayers'
import OwnerSection, { OwnerIcon } from '../../components/OwnerSection'
import { slotCrossesMidnight } from '../../utils/slotTime'
import BookingAdvancePanel from '../../components/BookingAdvancePanel'
import { bookingDisplayStatus, isOfflineBooking } from '../../utils/bookingStatus'
import Seo from '../../components/Seo'
import Spinner from '../../components/Spinner'
import { Alert, Button, Card, Input, Select } from '../../components/ui'

const labels = { available: 'Available', unavailable: 'Unavailable', offline_booking: 'Already booked (offline)', pending: 'Pending request', booked: 'Booked', completed: 'Completed', awaiting_payment: 'Awaiting advance', submitted: 'Payment under review' }
const today = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = type => parts.find(part => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}
const nextDate = (date, offset) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const minutes = slot => Math.round((new Date(slot.end_time) - new Date(slot.start_time)) / 60000)

export default function FieldSchedule() {
  const { t, locale, n } = useTranslation()
  const selection = useRef(null)
  const [params, setParams] = useSearchParams()
  const [turf, setTurf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [schedule, setSchedule] = useState({ key: '', slots: [], revision: -1 })
  const [selectedId, setSelectedId] = useState(null)
  const [deletingMode, setDeletingMode] = useState(false)
  const [deleteIds, setDeleteIds] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [blockType, setBlockType] = useState('unavailable')
  const [generationOpen, setGenerationOpen] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [priceDraft, setPriceDraft] = useState(null)
  const [generation, setGeneration] = useState({ start_time: '06:00', end_time: '23:00', slot_duration: 60, peak_only: false, peak_enabled: false, peak_start: '18:00', peak_end: '23:00', peak_pricing_mode: '', peak_rate: '' })
  const [clockNow, setClockNow] = useState(Date.now)
  const [timezone, setTimezone] = useState('Asia/Dhaka')
  const requestedField = params.get('field_id')
  const fields = [...(turf?.fields || [])].sort((left, right) => left.id - right.id)
  const field = fields.find(item => String(item.id) === requestedField) || fields[0]
  const fieldId = field?.id
  const turfId = turf?.id
  const date = validDate(params.get('date')) ? params.get('date') : today()
  const key = `${fieldId}|${date}`
  const slots = schedule.key === key ? schedule.slots : []
  const loadingSlots = schedule.key !== key || schedule.revision !== refresh
  const activeSlots = slots.filter(slot => labels[slot.status])
  const chosen = slots.find(slot => slot.id === selectedId)
  const deletionChanged = deleteIds.some(id => !slots.some(slot => slot.id === id && slot.can_delete))
  const time = value => new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value))
  const dateLabel = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00Z`))
  const priceForm = priceDraft || { pricing_mode: field?.pricing_mode || 'slot', price_per_slot: field?.price_per_slot ?? '', price_per_hour: field?.price_per_hour ?? '' }
  const loadTurf = useCallback(async signal => {
    try { const { data } = await api.get('/my-turf', { signal }); setTurf(data.turf) }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(formError(err, 'Unable to load your complex.')) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    api.get('/my-turf', { signal: controller.signal }).then(({ data }) => setTurf(data.turf))
      .catch(err => { if (err.code !== 'ERR_CANCELED') setError(formError(err, 'Unable to load your complex.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!turfId || !fieldId) return
    const controller = new AbortController()
    api.get(`/turfs/${turfId}/schedule`, { params: { field_id: fieldId, date }, signal: controller.signal })
      .then(({ data }) => { setSchedule({ key: `${fieldId}|${date}`, slots: data.bookings, revision: refresh }); setTimezone(data.timezone || 'Asia/Dhaka') })
      .catch(err => { if (err.code !== 'ERR_CANCELED') { setSchedule({ key: `${fieldId}|${date}`, slots: [], revision: refresh }); setError(formError(err, 'Unable to load the field schedule.')) } })
    return () => controller.abort()
  }, [turfId, fieldId, date, refresh])
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) { setClockNow(Date.now()); setRefresh(value => value + 1) } }, 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (selectedId !== null && window.matchMedia('(max-width: 899px)').matches) {
      selection.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
  }, [selectedId])
  const changeView = updates => {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([name, value]) => next.set(name, String(value)))
    setParams(next, { replace: true }); setSelectedId(null); setDeletingMode(false); setDeleteIds([]); setReason(''); setBlockType('unavailable'); setError(''); setMessage(''); setPriceDraft(null)
  }
  const act = async (method, url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { data } = await (method === 'delete' ? api.delete(url, { data: payload }) : api[method](url, payload))
      setMessage(data.message || 'Saved.'); setSelectedId(null); setReason('')
      await loadTurf(); setRefresh(value => value + 1)
      return true
    } catch (err) { setError(formError(err)); return false }
    finally { setBusy(false) }
  }
  const removeSlots = async ids => {
    if (!ids.length || !window.confirm(t('Delete {count} selected available slots? This cannot be undone.', { count: n(ids.length) }))) return
    if (await act('delete', `/turfs/${turfId}/slots`, { field_id: fieldId, slot_ids: ids })) {
      setSchedule(current => ({ ...current, slots: current.slots.filter(slot => !ids.includes(slot.id)) }))
      setDeleteIds([]); setDeletingMode(false)
    }
  }
  if (loading) return <Spinner />
  if (!turf) return <div className="space-y-4"><h1 className="text-2xl font-semibold">{t("Field schedule")}</h1>{error && <Alert message={error} />}<p>{t("No active complex is registered on this account.")}</p><Link className="owner-schedule-link" to="/dashboard/turf">{t("Go to owner dashboard")}</Link></div>
  return <div className="field-schedule-page">
    <Seo title={t("Field schedule & slots")} path="/dashboard/turf/schedule" noIndex />
    <header className="schedule-heading"><div><p className="sport-section-label">{t("YOUR FIELDS. YOUR SCHEDULE.")}</p><h1>{turf.name}</h1><p>{t("Choose a field and date. Tap a time to make changes.")}</p></div>
    </header>
    <div className="owner-quick-actions">
      <button type="button" disabled={!field || busy} onClick={() => setGenerationOpen(value => !value)} aria-expanded={generationOpen} aria-controls="schedule-generation"><OwnerIcon name="calendar" /><span><strong>{generationOpen ? t('Close slot creator') : t('Create slots')}</strong><small>{t('Add times and prices')}</small></span></button>
      <button type="button" disabled={!field || busy} onClick={() => document.getElementById('owner-time-slots')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}><OwnerIcon name="price" /><span><strong>{t('Change a slot')}</strong><small>{t('Choose a time below')}</small></span></button>
      <Link to="/dashboard/turf"><OwnerIcon name="field" /><span><strong>{t('Manage fields & complex')}</strong><small>{t('Photos, payments and settings')}</small></span></Link>
    </div>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {!field ? <Card><p>{t("Add a field from your dashboard to start creating slots.")}</p></Card> : <>
      <div className="schedule-toolbar">
        <Select label={t("Select field")} aria-label={t("Select field")} disabled={busy} value={fieldId} onChange={event => changeView({ field_id: event.target.value })}>{fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <div className="schedule-date"><label htmlFor="schedule-date">{t("Booking date")}</label><div><Button variant="secondary" aria-label={t("Previous day")} disabled={busy} onClick={() => changeView({ date: nextDate(date, -1) })}>←</Button><input id="schedule-date" type="date" value={date} disabled={busy} onChange={event => { if (event.target.value) changeView({ date: event.target.value }) }} /><Button variant="secondary" aria-label={t("Next day")} disabled={busy} onClick={() => changeView({ date: nextDate(date, 1) })}>→</Button></div><span>{dateLabel} · {timezone}</span></div>
        <div className="schedule-rate"><span>{t("Field rate")}</span><strong>{fieldRateLabel(field)}</strong><button type="button" disabled={busy} onClick={() => setPricingOpen(value => !value)} aria-expanded={pricingOpen} aria-controls="schedule-pricing">{pricingOpen ? t("Close pricing") : t("Edit pricing")}</button></div>
      </div>
      <FieldPlayersLabel value={field.players_per_side} />
      <div className="schedule-delete-toolbar">
        <Button variant="secondary" disabled={busy || loadingSlots} aria-pressed={deletingMode} onClick={() => { setDeletingMode(value => !value); setSelectedId(null); setDeleteIds([]) }}>{deletingMode ? t('Cancel selection') : t('Select slots to delete')}</Button>
        {deletingMode && <><Button variant="secondary" disabled={busy} onClick={() => setDeleteIds(activeSlots.filter(slot => slot.can_delete).slice(0, 200).map(slot => slot.id))}>{t('Select all available slots')}</Button><Button variant="danger" disabled={busy || !deleteIds.length || deletionChanged} onClick={() => removeSlots(deleteIds)}>{t('Delete selected ({count})', { count: n(deleteIds.length) })}</Button></>}
        {deletingMode && <p>{t('Select available slots to remove, including past unused slots. Booked slots cannot be deleted.')}</p>}
        {deletingMode && deletionChanged && <p role="status">{t('A selected slot is no longer available. Deselect it or start a new selection.')}</p>}
      </div>
      {pricingOpen && <Card><form id="schedule-pricing" className="space-y-3" onSubmit={async event => { event.preventDefault(); if (await act('put', `/turfs/${turfId}/fields/${fieldId}`, { name: field.name, sports: field.sports.map(sport => sport.id), ...priceForm })) { setPriceDraft(null); setPricingOpen(false) } }}><h2 className="font-semibold">{t("Pricing · ")}{field.name}</h2><FieldPricingInputs form={priceForm} onChange={setPriceDraft} disabled={busy} /><p className="text-sm text-zinc-400">{t("Regular field prices apply to open slots without a custom rate. Peak and custom slot rates stay unchanged, as do existing booking quotes.")}</p><Button type="submit" loading={busy}>{t("Save field pricing")}</Button></form></Card>}
      {generationOpen && <Card><SlotGenerationForm field={field} dateLabel={dateLabel} timezone={timezone} form={generation} onChange={setGeneration} busy={busy} onGenerate={values => act('post', `/turfs/${turfId}/slots`, { ...values, date, field_id: fieldId })} /></Card>}
      <div className="schedule-summary" aria-label={t("Schedule totals")}><span><i data-status="available" />{formatNumber(activeSlots.filter(slot => slot.status === 'available').length)}{t(" available")}</span><span><i data-status="booked" />{formatNumber(activeSlots.filter(slot => ['pending', 'booked'].includes(slot.status)).length)}{t(" reserved / pending")}</span><span><i data-status="offline_booking" />{t("{count} offline bookings", { count: n(activeSlots.filter(isOfflineBooking).length) })}</span><span><i data-status="unavailable" />{formatNumber(activeSlots.filter(slot => slot.status === 'unavailable' && !isOfflineBooking(slot)).length)}{t(" unavailable")}</span>{loadingSlots && <span>{t("Refreshing…")}</span>}</div>
      <div className="schedule-layout"><section id="owner-time-slots" aria-label={t("{value0} time slots", { value0: field.name })} className="schedule-slot-grid" aria-busy={loadingSlots}>
        {!activeSlots.length && <div className="schedule-empty">{loadingSlots ? <Spinner /> : <><h2>{t("No slots for this date")}</h2><p>{t("Choose another date or generate slots for ")}{field.name}.</p><Button onClick={() => setGenerationOpen(true)}>{t("Generate slots")}</Button></>}</div>}
        {activeSlots.map(slot => <button type="button" key={slot.id} className="schedule-slot" data-status={isOfflineBooking(slot) ? 'offline_booking' : slot.status} data-delete-selected={deletingMode && deleteIds.includes(slot.id)} disabled={busy || (deletingMode && !slot.can_delete && !deleteIds.includes(slot.id))} aria-pressed={deletingMode ? deleteIds.includes(slot.id) : chosen?.id === slot.id} onClick={() => { if (deletingMode) { setDeleteIds(ids => ids.includes(slot.id) ? ids.filter(id => id !== slot.id) : ids.length < 200 ? [...ids, slot.id] : ids); return }; setSelectedId(slot.id); setReason(slot.unavailable_reason || ''); setBlockType(slot.unavailable_type || 'unavailable'); setMessage('') }}>
          {deletingMode && <span className="schedule-delete-marker">{deleteIds.includes(slot.id) ? t('Selected for deletion') : slot.can_delete ? t('Tap to select') : t('Protected booking')}</span>}
          <strong>{time(slot.start_time)} – {time(slot.end_time)}</strong><span>{n(minutes(slot))}{t(" minutes")}</span><b>{money(slot.price)}</b><span className="schedule-status">{slot.status === 'booked' && slot.user && !['awaiting_payment', 'submitted'].includes(slot.advance_status) ? t("Booked by {value0}", { value0: slot.user.name }) : t(labels[bookingDisplayStatus(slot)])}</span>
          {slot.is_peak && <span className="schedule-status">{t('Peak hours')}</span>}{slotCrossesMidnight(slot, timezone) && <span>{t('Ends next day')}</span>}
        </button>)}
      </section><aside ref={selection} className="schedule-selection" data-selected={Boolean(chosen)} aria-label={t("Selected slot details")} aria-live="polite"><p className="sport-section-label">{t("SELECTED SLOT")}</p><h2>{field.name}</h2><p>{dateLabel}</p>
        {!chosen || deletingMode ? <p className="schedule-selection-hint">{deletingMode ? t('Tap the available slots you want to delete, then choose Delete selected.') : t("Choose a time slot to view details and manage its availability.")}</p> : <div className="space-y-4"><div><strong>{time(chosen.start_time)} – {time(chosen.end_time)}</strong><p>{n(minutes(chosen))}{t(" minutes · ")}{money(chosen.price)}</p><span className="schedule-status" data-status={bookingDisplayStatus(chosen)}>{t(labels[bookingDisplayStatus(chosen)] || chosen.status)}</span></div>
          {chosen.can_delete && <Button variant="danger" disabled={busy} onClick={() => removeSlots([chosen.id])}>{t('Delete this slot')}</Button>}
          {chosen.user && <div className="schedule-contact"><strong>{chosen.user.name}</strong><p>{chosen.user.email}</p><p>{chosen.user.phone || t("No phone supplied")}</p></div>}
          <BookingAdvancePanel key={chosen.id} booking={chosen} manager onChange={() => setRefresh(value => value + 1)} />
          {chosen.status === 'available' && new Date(chosen.start_time).getTime() > clockNow && <OwnerSection key={`price-${chosen.id}`} title="Change slot price" hint="Set a price just for this time" icon="price"><SlotPriceEditor key={chosen.id} slot={chosen} field={field} busy={busy} onSave={payload => act('patch', `/turfs/${turfId}/slots/${chosen.id}/price`, payload)} /></OwnerSection>}
          {chosen.status === 'pending' && <><p>{t("Customer contact details are revealed after acceptance.")}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => act('post', `/bookings/${chosen.id}/accept`)}>{t("Accept request")}</Button><Button variant="danger" disabled={busy} onClick={() => act('post', `/bookings/${chosen.id}/reject`)}>{t("Reject request")}</Button></div></>}
          {['available', 'unavailable'].includes(chosen.status) && new Date(chosen.start_time).getTime() > clockNow && <OwnerSection key={`status-${chosen.id}`} title="Book offline or close slot" hint="For phone bookings or maintenance" icon="calendar"><form className="space-y-3" onSubmit={event => { event.preventDefault(); act('patch', `/turfs/${turfId}/slots/${chosen.id}/availability`, { available: false, unavailable_type: blockType, reason: reason.trim() }) }}>
            <Select label={t("Slot status")} aria-label={t("Slot status")} disabled={busy} value={blockType} onChange={event => { setBlockType(event.target.value); setReason('') }}><option value="unavailable">{t("Unavailable")}</option><option value="offline_booking">{t("Already booked (offline)")}</option></Select>
            <Input label={blockType === 'offline_booking' ? t("Offline booking note (optional)") : t("Unavailable reason")} aria-label={blockType === 'offline_booking' ? t("Offline booking note (optional)") : t("Unavailable reason")} placeholder={blockType === 'offline_booking' ? t("Booked by phone or in person") : t("Maintenance or other closure")} required={blockType !== 'offline_booking'} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} />
            <p>{t("Keep customer contact details out of this reason.")}</p>
            {blockType === 'offline_booking' && <p>{t("Shown as already booked to customers. Offline payments are managed directly by you.")}</p>}
            <Button variant="secondary" type="submit" loading={busy} disabled={chosen.status === 'unavailable' && (chosen.unavailable_type || 'unavailable') === blockType}>{blockType === 'offline_booking' ? t("Mark already booked (offline)") : t("Mark unavailable")}</Button>
          </form></OwnerSection>}
          {chosen.status === 'unavailable' && <>{chosen.unavailable_reason && <p>{chosen.unavailable_reason}</p>}{new Date(chosen.start_time).getTime() > clockNow && <Button disabled={busy} onClick={() => act('patch', `/turfs/${turfId}/slots/${chosen.id}/availability`, { available: true })}>{t("Reopen slot")}</Button>}</>}
          {chosen.cancellation_request && <p>{t("Cancellation: ")}{t(chosen.cancellation_request.owner_status)}. <Link to="/dashboard/turf">{t("Manage on dashboard")}</Link></p>}
          {chosen.status === 'booked' && (!chosen.advance_required || chosen.advance_status === 'confirmed') && new Date(chosen.end_time).getTime() <= clockNow && chosen.cancellation_request?.owner_status !== 'pending' && <Button disabled={busy} onClick={() => act('post', `/bookings/${chosen.id}/complete`)}>{t("Mark completed")}</Button>}
        </div>}
      </aside></div>
      {slots.some(slot => ['rejected', 'cancelled'].includes(slot.status)) && <details className="schedule-history"><summary>{t("Rejected & cancelled requests")}</summary>{slots.filter(slot => ['rejected', 'cancelled'].includes(slot.status)).map(slot => <p key={slot.id}>{time(slot.start_time)} – {time(slot.end_time)} · {t(slot.status)} · {money(slot.price)}</p>)}</details>}
    </>}
  </div>
}
