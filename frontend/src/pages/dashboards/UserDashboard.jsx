import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'
import StatCard from '../../components/StatCard'
import Spinner from '../../components/Spinner'
import { Alert, Card } from '../../components/ui'

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function UserDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/dashboard/user')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="text-2xl font-bold text-white">Welcome back, {user.name}!</h1>
        <p className="mt-1 text-zinc-500">Here's your booking overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Bookings" value={data.stats.totalBookings} accent="blue" />
        <StatCard label="Pending Requests" value={data.stats.pendingRequests} accent="amber" />
        <StatCard label="Completed" value={data.stats.completed} accent="emerald" />
        <StatCard label="Upcoming" value={data.upcoming.length} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Pending Requests</h2>
          {data.requests.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No pending booking requests.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.requests.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 transition hover:-translate-y-0.5 hover:border-amber-700"
                >
                  <div className="font-medium text-white">{b.turf.name}</div>
                  <div className="mt-1 text-xs text-zinc-400">{formatDate(b.start_time)}</div>
                  <div className="mt-2">
                    <Badge status={b.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Upcoming Bookings</h2>
            <Link to="/turfs" className="text-sm font-medium text-emerald-500 hover:underline">
              Book a complex →
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No upcoming bookings.</p>
              <Link
                to="/turfs"
                className="btn-glow mt-3 inline-block rounded-lg bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:from-emerald-600 hover:to-teal-600"
              >
                Browse complexes
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.upcoming.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-emerald-700"
                >
                  <div>
                    <div className="font-medium text-white">{b.turf.name}</div>
                    <div className="text-sm text-zinc-500">{b.turf.location}</div>
                    <div className="mt-1 text-xs text-zinc-400">{formatDate(b.start_time)}</div>
                  </div>
                  <Badge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-white">Booking History</h2>
          {data.past.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No past bookings yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.past.slice(0, 8).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-zinc-600"
                >
                  <div>
                    <div className="font-medium text-white">{b.turf.name}</div>
                    <div className="mt-1 text-xs text-zinc-400">{formatDate(b.start_time)}</div>
                  </div>
                  <Badge status={b.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}