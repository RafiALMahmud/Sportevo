import { useTranslation } from '../i18n/useTranslation'
import { slotCrossesMidnight } from '../utils/slotTime'
import { FieldPlayersLabel } from '../components/FieldPlayers'
import { money } from '../utils/money'
import { fieldRate } from '../utils/fieldPricing'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Seo from '../components/Seo'
import FieldGallery from '../components/FieldGallery'
import Badge from '../components/Badge'
import { Alert, Button, Card, Input } from '../components/ui'


const REVIEWABLE = ['booked', 'completed']

export default function TurfDetail() {
  const { t, locale } = useTranslation()
  const { id, selectedFieldId } = useParams()
  const { user } = useAuth()
  const [turf, setTurf] = useState(null)
  const [slots, setSlots] = useState([])
  const fieldId = selectedFieldId || ''
  const [refreshSlots, setRefreshSlots] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const field = turf?.fields?.find((f) => String(f.id) === String(fieldId))
  const photos = field?.photos || []
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [reviewable, setReviewable] = useState([])
  const [reviewForm, setReviewForm] = useState({ booking_id: '', rating: 5, comment: '' })
  const [reviewError, setReviewError] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const loadTurf = useCallback(async () => {
    try { const { data } = await api.get(`/turfs/${id}`); setTurf(data.turf) } catch { setError('Complex not found.') } finally { setLoading(false) }
  }, [id])
  const loadSlots = useCallback(async (signal) => {
    if (!fieldId) return
    try { const { data } = await api.get(`/turfs/${id}/slots`, { params: { date, field_id: fieldId }, signal }); setSlots(data.slots) } catch (e) { if (e.code !== 'ERR_CANCELED') { setSlots([]); setError(e.response?.data?.message || 'Unable to load slots.') } }
  }, [date, id, fieldId])
  useEffect(() => { loadTurf() }, [loadTurf])
  useEffect(() => { const controller = new AbortController(); loadSlots(controller.signal); return () => controller.abort() }, [loadSlots, refreshSlots])
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setRefreshSlots(value => value + 1) }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Only customers who actually played here can review.
  useEffect(() => {
    if (!user || user.role !== 'user') return
    api
      .get('/bookings')
      .then(({ data }) => {
        const all = [...(data.upcoming || []), ...(data.past || [])]
        setReviewable(
          all
            .filter((b) => Number(b.turf_id) === Number(id) && REVIEWABLE.includes(b.status) && (!b.advance_required || b.advance_status === 'confirmed') && new Date(b.end_time) <= new Date())
            .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
        )
      })
      .catch(() => setReviewable([]))
  }, [user, id])

  const existingReview = useMemo(
    () => turf?.reviews?.find((r) => r.user_id === user?.id || r.user?.id === user?.id),
    [turf, user]
  )

  const requestSlot = async (slot) => {
    if (user?.role !== 'user') return
    setRequesting(true)
    setError(''); setMessage('')
    try { const { data } = await api.post('/bookings', { turf_id: turf.id, field_id: slot.field_id, start_time: slot.start_time, end_time: slot.end_time }); setMessage(data.message); setSlots(current => current.map(item => item.id === slot.id ? { ...item, status: 'pending', display_status: 'in_process', can_request: false } : item)); setRefreshSlots((n) => n + 1) }
    catch (err) { setError(err.response?.data?.message || 'Could not send your request.') }
    finally { setRequesting(false) }
  }

  const submitReview = async (e) => {
    e.preventDefault()
    setReviewError('')
    if (!reviewForm.booking_id) {
      setReviewError('Choose the booking you want to review.')
      return
    }
    setSubmittingReview(true)
    try {
      const { data } = await api.post(`/turfs/${turf.id}/reviews`, {
        booking_id: Number(reviewForm.booking_id),
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment,
      })
      setMessage(data.message)
      setReviewForm({ booking_id: '', rating: 5, comment: '' })
      loadTurf()
    } catch (err) {
      const errors = err.response?.data?.errors
      setReviewError(err.response?.data?.message || (errors ? Object.values(errors).flat()[0] : 'Could not save your review.'))
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!turf) return <Alert type="error" message={error || 'Complex not found.'} />
  if (!field) return <div className="space-y-3"><Alert message="This field is not available in this complex." /><Link to={`/turfs/${id}`} className="text-emerald-400">{t("Choose another field")}</Link></div>

  const canReview = user?.role === 'user' && reviewable.length > 0

  return <div className="space-y-7 animate-fade-up">
    <Seo
      title={`${field.name} - ${turf.name}`}
      description={t("{value0} — {value1}. View prices, photos, reviews and available time slots, then request your game.", { value0: turf.name, value1: turf.location })}
      path={`/turfs/${turf.id}/fields/${fieldId}`}
      type="article"
    />
    <nav aria-label={t("Field navigation")} className="flex flex-col items-start gap-3">
      <Link to="/turfs" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-500 transition hover:bg-emerald-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6 6-6-6 6-6" /></svg>{t("All complexes")}</Link>
      <Link to={`/turfs/${id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-emerald-500 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">{t("Change field")}</Link>
    </nav>
    {error && <Alert type="error" message={error} />}{message && <Alert type="success" message={message} />}
    <h2 className="text-xl font-semibold text-white">{field.name}</h2>
    <FieldPlayersLabel value={field.players_per_side} />
    <Card className="overflow-hidden !p-0">
      <FieldGallery key={fieldId} photos={photos} name={field?.name || turf.name} />
      <div className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><h1 className="text-2xl font-bold text-white">{turf.name}</h1><p className="mt-1 text-zinc-400">{turf.location}</p>
        <div className="mt-3 flex flex-wrap gap-2">{field?.sports?.map((s) => <span key={s.id} className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">{t(s.name)}</span>)}</div></div>
        <div className="text-right"><div className="text-xl font-bold text-emerald-400">{money(fieldRate(field))}</div><div className="text-xs text-zinc-500">{t("per ")}{field?.pricing_mode === 'hour' ? t("hour") : t("slot")}</div><div className="mt-2 text-sm text-amber-300">★ {Number(turf.reviews_avg_rating || 0).toFixed(1)} <span className="text-zinc-500">({turf.reviews_count || 0}{t(" reviews)")}</span></div></div></div>
        </div>
    </Card>
    <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold text-white">{t("Field schedule")}</h2><p className="text-sm text-zinc-500">{t("Your contact details stay private until the owner accepts.")}</p><p className="mt-2 text-sm text-zinc-400">{t('Slots stay visible: available, in process or already booked.')}</p></div><div className="w-full sm:w-52"><Input label={t("Date")} type="date" value={date} disabled={requesting} onChange={(e) => { setSlots([]); setDate(e.target.value) }} /></div></div>
      {turf.advance_enabled && <p className="mt-3 text-sm text-emerald-300">{t('Configured advance')}: {money(turf.advance_amount)} · {t('Configured payment window')}: {t('{count} minutes', { count: turf.advance_window_minutes })}. {t('The final advance never exceeds your slot price. Pay only after acceptance.')}</p>}
      {!user && <p className="mt-3 text-sm text-zinc-400"><Link to="/login" className="text-emerald-400 underline">{t("Sign in as a customer")}</Link>{t(" to request a slot.")}</p>}
      {user && user.role !== 'user' && <p className="mt-3 text-sm text-zinc-400">{t("Booking requests require a customer account.")}</p>}
      {user?.role === 'user' && !user.phone && <p className="mt-3 text-sm text-amber-300">{t('A phone number is required to book.')} <Link className="underline" to="/profile">{t('Add your phone in My Profile')}</Link></p>}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{slots.map(slot => <div key={slot.id} className="public-slot space-y-3 rounded-lg border border-zinc-700 p-3 text-center" data-status={slot.display_status || slot.status}>
        <div className="text-sm font-semibold">{new Date(slot.start_time).toLocaleTimeString(locale, { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' })} – {new Date(slot.end_time).toLocaleTimeString(locale, { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' })}</div>
        {slotCrossesMidnight(slot) && <p className="text-xs text-zinc-400">{t('Ends next day')}</p>}{slot.is_peak && <p className="text-xs text-emerald-300">{t('Peak hours')}</p>}
        <p className="text-sm text-emerald-300">{money(slot.price ?? field?.price_per_slot)}</p><Badge status={slot.display_status || slot.status} />
        {turf.advance_enabled && slot.status === 'available' && <p className="text-xs text-zinc-400">{t('Advance payment')}: {money(Math.min(Number(turf.advance_amount), Number(slot.price ?? field?.price_per_slot)))}</p>}
        {user?.role === 'user' && slot.status === 'available' && slot.can_request !== false && <Button className="w-full !px-2 !py-1.5 text-xs" disabled={requesting || !user.phone} onClick={() => requestSlot(slot)}>{t('Request slot')}</Button>}
      </div>)}</div>
      {!slots.length && <p className="mt-5 text-center text-zinc-500">{t("No slots for this date")}</p>}</Card>
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{t("Reviews")}</h2>

      {canReview && (
        <form onSubmit={submitReview} className="space-y-3">
          <Card>
            <h3 className="text-sm font-semibold text-white">
              {existingReview ? t("Update your review") : t("Leave a review")}
            </h3>
            {reviewError && <div className="mt-2"><Alert type="error" message={reviewError} /></div>}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-300">{t("Booking")}</label>
                <select
                  value={reviewForm.booking_id}
                  onChange={(e) => setReviewForm({ ...reviewForm, booking_id: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60"
                  required
                >
                  <option value="">{t("Select a booking")}</option>
                  {reviewable.map((b) => (
                    <option key={b.id} value={b.id}>
                      {new Date(b.start_time).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-300">{t("Rating")}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                      className={`text-2xl transition ${n <= reviewForm.rating ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-600'}`}
                      aria-label={t("{value0} star{value1}", { value0: n, value1: n > 1 ? 's' : '' })}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-1 flex items-end">
                <Button type="submit" loading={submittingReview} className="w-full">{t("Submit review")}</Button>
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-zinc-300">{t("Comment")}</label>
              <textarea
                rows={3}
                placeholder={t("How was the turf? (optional)")}
                value={reviewForm.comment}
                maxLength={1500}
                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60"
              />
            </div>
          </Card>
        </form>
      )}

      {!turf.reviews?.length ? (
        <Card><p className="text-zinc-500">{t("No reviews yet.")}</p></Card>
      ) : (
        <div className="space-y-3">
          {turf.reviews.map((review) => (
            <Card key={review.id}>
              <div className="flex justify-between">
                <strong className="text-white">{review.user?.name}</strong>
                <span className="text-amber-300">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
              </div>
              {review.comment && <p className="mt-2 text-sm text-zinc-400">{review.comment}</p>}
            </Card>
          ))}
        </div>
      )}
    </section>
  </div>
}
