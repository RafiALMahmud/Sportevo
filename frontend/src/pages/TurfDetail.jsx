import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import { Alert, Button, Card, Input } from '../components/ui'

const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value || 0))

const REVIEWABLE = ['booked', 'completed']

export default function TurfDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [turf, setTurf] = useState(null)
  const [slots, setSlots] = useState([])
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
  const loadSlots = useCallback(async () => {
    try { const { data } = await api.get(`/turfs/${id}/slots`, { params: { date } }); setSlots(data.slots) } catch { setSlots([]) }
  }, [date, id])
  useEffect(() => { loadTurf() }, [loadTurf])
  useEffect(() => { if (turf) loadSlots() }, [turf, loadSlots])

  // Only customers who actually played here can review.
  useEffect(() => {
    if (!user || user.role !== 'user') return
    api
      .get('/bookings')
      .then(({ data }) => {
        const all = [...(data.upcoming || []), ...(data.past || [])]
        setReviewable(
          all
            .filter((b) => Number(b.turf_id) === Number(id) && REVIEWABLE.includes(b.status))
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
    setError(''); setMessage('')
    try { const { data } = await api.post('/bookings', { turf_id: turf.id, start_time: slot.start_time, end_time: slot.end_time }); setMessage(data.message); loadSlots() }
    catch (err) { setError(err.response?.data?.message || 'Could not send your request.') }
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

  const canReview = user?.role === 'user' && reviewable.length > 0

  return <div className="space-y-7 animate-fade-up">
    <Link to="/turfs" className="text-sm font-medium text-emerald-500 hover:underline">← Back to complexes</Link>
    {error && <Alert type="error" message={error} />}{message && <Alert type="success" message={message} />}
    <Card className="overflow-hidden !p-0">
      {turf.photos?.length ? <img src={turf.photos[0].url} alt={turf.name} className="h-64 w-full object-cover" /> : <div className="flex h-48 items-center justify-center bg-gradient-to-br from-emerald-800 to-black text-6xl font-bold text-white/80">{turf.name[0]}</div>}
      <div className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><h1 className="text-2xl font-bold text-white">{turf.name}</h1><p className="mt-1 text-zinc-400">{turf.location}</p>
        <div className="mt-3 flex flex-wrap gap-2">{turf.sports?.map((s) => <span key={s.id} className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300">{s.name}</span>)}</div></div>
        <div className="text-right"><div className="text-xl font-bold text-emerald-400">{money(turf.price_per_slot)}</div><div className="text-xs text-zinc-500">per slot</div><div className="mt-2 text-sm text-amber-300">★ {Number(turf.reviews_avg_rating || 0).toFixed(1)} <span className="text-zinc-500">({turf.reviews_count || 0} reviews)</span></div></div></div>
        {turf.photos?.length > 1 && <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{turf.photos.slice(1).map((photo) => <img key={photo.id} src={photo.url} alt="Complex" className="h-20 w-full rounded-lg object-cover" />)}</div>}</div>
    </Card>
    <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold text-white">Available slots</h2><p className="text-sm text-zinc-500">Your contact details stay private until the owner accepts.</p></div><div className="w-full sm:w-52"><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{slots.map((slot) => <div key={slot.id} className="rounded-lg border border-zinc-800 p-3 text-center"><div className="mb-2 text-sm text-white">{new Date(slot.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(slot.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><Button className="w-full !px-2 !py-1.5 text-xs" onClick={() => requestSlot(slot)}>Request {money(turf.price_per_slot)}</Button></div>)}</div>
      {!slots.length && <p className="mt-5 text-center text-zinc-500">No available slots on this date.</p>}</Card>
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Reviews</h2>

      {canReview && (
        <form onSubmit={submitReview} className="space-y-3">
          <Card>
            <h3 className="text-sm font-semibold text-white">
              {existingReview ? 'Update your review' : 'Leave a review'}
            </h3>
            {reviewError && <div className="mt-2"><Alert type="error" message={reviewError} /></div>}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-300">Booking</label>
                <select
                  value={reviewForm.booking_id}
                  onChange={(e) => setReviewForm({ ...reviewForm, booking_id: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60"
                  required
                >
                  <option value="">Select a booking</option>
                  {reviewable.map((b) => (
                    <option key={b.id} value={b.id}>
                      {new Date(b.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-zinc-300">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                      className={`text-2xl transition ${n <= reviewForm.rating ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-600'}`}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-1 flex items-end">
                <Button type="submit" loading={submittingReview} className="w-full">Submit review</Button>
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-zinc-300">Comment</label>
              <textarea
                rows={3}
                placeholder="How was the turf? (optional)"
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
        <Card><p className="text-zinc-500">No reviews yet.</p></Card>
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
