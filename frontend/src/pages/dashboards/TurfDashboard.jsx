import { useEffect, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/Badge'
import StatCard from '../../components/StatCard'
import Spinner from '../../components/Spinner'
import { Alert, Button, Card, Input } from '../../components/ui'

function formatTime(dt) {
  return new Date(dt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dt) {
  return new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TurfDashboard() {
  const [data, setData] = useState(null)
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showRegister, setShowRegister] = useState(false)
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', location: '', price_per_slot: '', sports: [] })
  const [registerError, setRegisterError] = useState('')
  const [registering, setRegistering] = useState(false)
  const [message, setMessage] = useState('')

  const [showSlots, setShowSlots] = useState(false)
  const [slotForm, setSlotForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    start_time: '09:00',
    end_time: '18:00',
    slot_duration: 60,
  })
  const [slotError, setSlotError] = useState('')
  const [generating, setGenerating] = useState(false)

  const [actionError, setActionError] = useState('')
  const [editingPrice, setEditingPrice] = useState(false)
  const [price, setPrice] = useState('')
  const [photoFiles, setPhotoFiles] = useState(null)

  useEffect(() => {
    api
      .get('/sports')
      .then(({ data }) => setSports(data.sports))
      .catch(() => {})
  }, [])

  const loadDashboard = () => {
    setLoading(true)
    setError('')
    api
      .get('/dashboard/turf')
      .then(({ data }) => setData(data))
      .catch((e) => {
        if (e.response?.status === 404) {
          setData({ turf: null })
        } else {
          setError('Failed to load dashboard.')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const toggleSport = (id) => {
    setRegisterForm((f) => ({
      ...f,
      sports: f.sports.includes(id) ? f.sports.filter((s) => s !== id) : [...f.sports, id],
    }))
  }

  const handleRegisterTurf = async (e) => {
    e.preventDefault()
    setRegisterError('')
    setRegistering(true)
    try {
      const { data } = await api.post('/turfs', registerForm)
      setMessage(data.message)
      setShowRegister(false)
      setRegisterForm({ name: '', email: '', phone: '', location: '', price_per_slot: '', sports: [] })
      loadDashboard()
    } catch (err) {
      const errors = err.response?.data?.errors
      setRegisterError(
        err.response?.data?.message || (errors ? Object.values(errors).flat()[0] : 'Registration failed.')
      )
    } finally {
      setRegistering(false)
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    setSlotError('')
    setGenerating(true)
    try {
      const { data } = await api.post(`/turfs/${data.turf.id}/slots`, slotForm)
      setMessage(data.message)
      setShowSlots(false)
      loadDashboard()
    } catch (err) {
      const errors = err.response?.data?.errors
      setSlotError(
        err.response?.data?.message || (errors ? Object.values(errors).flat()[0] : 'Generation failed.')
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleAccept = async (bookingId) => {
    setActionError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/accept`)
      setMessage(data.message)
      loadDashboard()
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to accept request.')
    }
  }

  const handleReject = async (bookingId) => {
    setActionError('')
    try {
      const { data } = await api.post(`/bookings/${bookingId}/reject`)
      setMessage(data.message)
      loadDashboard()
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to reject request.')
    }
  }

  const handleComplete = async (bookingId) => {
    setActionError('')
    try {
      await api.post(`/bookings/${bookingId}/complete`)
      loadDashboard()
    } catch {
      setActionError('Failed to complete booking.')
    }
  }

  const savePrice = async () => {
    try { const { data: response } = await api.put('/my-turf', { price_per_slot: price }); setMessage(response.message); setEditingPrice(false); loadDashboard() }
    catch (err) { setActionError(err.response?.data?.message || 'Could not update price.') }
  }

  const uploadPhotos = async () => {
    if (!photoFiles?.length) return
    const form = new FormData()
    Array.from(photoFiles).forEach((file) => form.append('photos[]', file))
    try { const { data: response } = await api.post(`/turfs/${data.turf.id}/photos`, form); setMessage(response.message); setPhotoFiles(null); loadDashboard() }
    catch (err) { setActionError(err.response?.data?.message || 'Could not upload photos.') }
  }

  const deletePhoto = async (photoId) => {
    try { await api.delete(`/turfs/${data.turf.id}/photos/${photoId}`); setMessage('Photo deleted.'); loadDashboard() }
    catch { setActionError('Could not delete photo.') }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!data || !data.turf) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-white">Complex Dashboard</h1>
          <p className="mt-1 text-zinc-500">You haven't registered a complex yet.</p>
        </div>

        {message && <Alert type="success" message={message} />}

        {!showRegister ? (
          <Card className="p-12 text-center">
            <h2 className="text-lg font-medium text-white">Register your sports complex</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Add your facility details and start accepting bookings once approved by an admin.
            </p>
            <Button onClick={() => setShowRegister(true)} className="btn-glow mt-6">
              Register Complex
            </Button>
          </Card>
        ) : (
          <form
            onSubmit={handleRegisterTurf}
            className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-lg shadow-black/40"
          >
            <h2 className="text-lg font-semibold text-white">Register your sports complex</h2>
            {registerError && <Alert type="error" message={registerError} />}
            <Input
              label="Complex Name"
              placeholder="e.g. Green Arena Sports Complex"
              value={registerForm.name}
              onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="complex@example.com"
              value={registerForm.email}
              onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
              required
            />
            <Input
              label="Phone"
              placeholder="+1 555 555 5555"
              value={registerForm.phone}
              onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
            />
            <Input
              label="Location"
              placeholder="Full address"
              value={registerForm.location}
              onChange={(e) => setRegisterForm({ ...registerForm, location: e.target.value })}
              required
            />
            <Input label="Price per slot" type="number" min="0" step="0.01" value={registerForm.price_per_slot} onChange={(e) => setRegisterForm({ ...registerForm, price_per_slot: e.target.value })} required />

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Sports offered <span className="text-zinc-500">(choose at least one)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sports.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleSport(s.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      registerForm.sports.includes(s.id)
                        ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.3)]'
                        : 'border-zinc-700 bg-zinc-950/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                        registerForm.sports.includes(s.id) ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-zinc-600'
                      }`}
                    >
                      {registerForm.sports.includes(s.id) ? '✓' : ''}
                    </span>
                    {s.name}
                  </button>
                ))}
              </div>
              {registerForm.sports.length === 0 && (
                <p className="mt-1 text-xs text-zinc-500">Select at least one sport.</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={registering} disabled={registerForm.sports.length === 0}>
                Submit for approval
              </Button>
              <Button variant="secondary" onClick={() => setShowRegister(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    )
  }

  const turf = data.turf
  const approvalStatus = turf.is_approved ? 'approved' : 'pending'

  return (
    <div className="space-y-8 animate-fade-up">
      {!turf.is_approved && (
        <Alert
          type="info"
          message="Your complex is pending admin approval. You can manage details and generate slots, but users won't see it until approved."
        />
      )}
      {message && <Alert type="success" message={message} />}
      {actionError && <Alert type="error" message={actionError} />}
      {error && <Alert type="error" message={error} />}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">{turf.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <span>{turf.location}</span>
            <Badge status={approvalStatus} />
            {turf.sports?.map((s) => (
              <span key={s.id} className="rounded-full border border-emerald-900/70 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                {s.name}
              </span>
            ))}
          </div>
        </div>
        <Button onClick={() => setShowSlots(!showSlots)}>
          {showSlots ? 'Close' : 'Generate Slots'}
        </Button>
      </div>

      {showSlots && (
        <form
          onSubmit={handleGenerate}
          className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-lg shadow-black/40 sm:grid-cols-2 lg:grid-cols-5"
        >
          {slotError && (
            <div className="sm:col-span-2 lg:col-span-5">
              <Alert type="error" message={slotError} />
            </div>
          )}
          <Input
            label="Date"
            type="date"
            value={slotForm.date}
            onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })}
            required
          />
          <Input
            label="Start Time"
            type="time"
            value={slotForm.start_time}
            onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
            required
          />
          <Input
            label="End Time"
            type="time"
            value={slotForm.end_time}
            onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })}
            required
          />
          <Input
            label="Slot Duration (min)"
            type="number"
            min="15"
            max="240"
            step="15"
            value={slotForm.slot_duration}
            onChange={(e) => setSlotForm({ ...slotForm, slot_duration: e.target.value })}
            required
          />
          <div className="flex items-end">
            <Button type="submit" loading={generating} className="w-full">
              Generate
            </Button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending Requests" value={data.stats.pendingRequests} accent="amber" />
        <StatCard label="Booked Today" value={data.stats.todayBookings} accent="blue" />
        <StatCard label="Available Today" value={data.stats.availableToday} accent="emerald" />
        <StatCard label="Completed" value={data.stats.completed} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-white">Price &amp; wallet</h2>
          <div className="mt-3 flex items-center justify-between"><div><div className="text-2xl font-bold text-emerald-400">${Number(turf.price_per_slot || 0).toFixed(2)}</div><div className="text-xs text-zinc-500">price per slot · {Number(turf.commission_rate || 0).toFixed(2)}% platform commission</div></div><Button variant="secondary" onClick={() => { setPrice(turf.price_per_slot || ''); setEditingPrice(!editingPrice) }}>Edit price</Button></div>
          {editingPrice && <div className="mt-3 flex gap-2"><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /><Button onClick={savePrice}>Save</Button></div>}
          <div className="mt-5 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3"><div className="text-xs text-zinc-400">Outstanding amount owed to Sports Evo</div><div className="text-2xl font-bold text-amber-300">${Number(data.wallet?.balance || 0).toFixed(2)}</div></div>
        </Card>
        <Card><h2 className="text-lg font-semibold text-white">Complex photos</h2><p className="mt-1 text-sm text-zinc-500">Upload JPG, PNG or WebP images.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setPhotoFiles(e.target.files)} className="text-sm text-zinc-400" /><Button onClick={uploadPhotos}>Upload</Button></div><div className="mt-4 grid grid-cols-4 gap-2">{turf.photos?.map((photo) => <div key={photo.id} className="relative"><img src={photo.url} alt="Complex" className="h-16 w-full rounded object-cover" /><button onClick={() => deletePhoto(photo.id)} className="absolute right-1 top-1 rounded bg-black/80 px-1 text-xs text-rose-300">×</button></div>)}</div></Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Booking Requests{" "}
            <span className="text-sm font-normal text-zinc-500">({data.requests.length} awaiting approval)</span>
          </h2>
          {data.requests.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No pending booking requests.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.requests.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 shadow-sm transition hover:border-amber-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {formatTime(b.start_time)} – {formatTime(b.end_time)} · {formatDate(b.start_time)}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">Customer details are protected until you accept.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={b.status} />
                    <Button
                      className="!px-3 !py-1.5 text-xs"
                      onClick={() => handleAccept(b.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 text-xs"
                      onClick={() => handleReject(b.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Today's Schedule</h2>
          {data.todaysBookings.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No slots for today. Generate slots to get started.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.todaysBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 transition hover:border-zinc-600"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-28 text-sm font-medium text-white">
                      {formatTime(b.start_time)} – {formatTime(b.end_time)}
                    </div>
                    <div className="text-sm text-zinc-400">
                      {b.status === 'available' ? (
                        'Open slot'
                      ) : b.status === 'pending' ? (
                        <span className="text-xs text-amber-300">Customer details protected · request pending</span>
                      ) : (
                        <>
                          <span className="font-medium text-zinc-200">{b.user?.name || 'N/A'}</span>
                          <span className="text-xs text-zinc-500"> · {b.user?.email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={b.status} />
                    {b.status === 'booked' && (
                      <Button
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => handleComplete(b.id)}
                      >
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Upcoming Bookings</h2>
        {data.upcoming.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-zinc-500">No upcoming bookings.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.upcoming.map((b) => (
              <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 transition hover:border-emerald-700">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white">
                    {formatDate(b.start_time)} · {formatTime(b.start_time)} – {formatTime(b.end_time)}
                  </div>
                  <Badge status={b.status} />
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {b.user?.name || 'N/A'} · {b.user?.email}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
