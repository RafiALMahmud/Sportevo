import { useEffect, useState } from 'react'
import api from '../api/client'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { Alert, Card } from '../components/ui'

function formatDT(dt) {
  return new Date(dt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MyBookings() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = () => {
    setLoading(true)
    api
      .get('/bookings')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load bookings.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const cancel = async (id) => {
    if (!confirm('Cancel this booking?')) return
    try {
      const { data } = await api.post(`/bookings/${id}/cancel`)
      setMessage(data.message)
      setError('')
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel booking.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return <Alert type="error" message={error} />
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-white">My Bookings</h1>
        <p className="mt-1 text-zinc-500">View and manage your reservations and requests.</p>
      </div>

      {message && <Alert type="success" message={message} />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Requests{" "}
            <span className="text-sm font-normal text-zinc-500">
              ({data.requests?.length || 0} awaiting approval)
            </span>
          </h2>
          {(data.requests?.length || 0) === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No pending requests.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.requests.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-700"
                >
                  <div>
                    <div className="font-medium text-white">{b.turf?.name}</div>
                    <div className="text-xs text-zinc-500">{b.turf?.location}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {formatDT(b.start_time)} — {formatDT(b.end_time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={b.status} />
                    <button
                      onClick={() => cancel(b.id)}
                      className="rounded-lg border border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:-translate-y-0.5 hover:bg-rose-950/40"
                    >
                      Cancel request
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Upcoming</h2>
          {data.upcoming.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No upcoming bookings.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.upcoming.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-700"
                >
                  <div>
                    <div className="font-medium text-white">{b.turf?.name}</div>
                    <div className="text-sm text-zinc-500">{b.turf?.location}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {formatDT(b.start_time)} — {formatDT(b.end_time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={b.status} />
                    {b.status === 'booked' && (
                      <button
                        onClick={() => cancel(b.id)}
                        className="rounded-lg border border-rose-800 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:-translate-y-0.5 hover:bg-rose-950/40"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Past / History</h2>
          {data.past.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No booking history.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.past.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-zinc-600"
                >
                  <div>
                    <div className="font-medium text-white">{b.turf?.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {formatDT(b.start_time)} — {formatDT(b.end_time)}
                    </div>
                  </div>
                  <div className="mt-2">
                    <Badge status={b.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}