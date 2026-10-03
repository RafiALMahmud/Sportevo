import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Spinner from '../components/Spinner'
import { Card, Input, Select, Alert } from '../components/ui'

export default function Turfs() {
  const [turfs, setTurfs] = useState([])
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('')
  const [location, setLocation] = useState('')
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)

  useEffect(() => {
    api
      .get('/sports')
      .then(({ data }) => setSports(data.sports))
      .catch(() => {})
  }, [])

  const load = (pageNum = 1, params = {}) => {
    setLoading(true)
    setError('')
    api
      .get('/turfs', {
        params: { page: pageNum, ...params },
      })
      .then(({ data }) => {
        setTurfs(data.data)
        setLastPage(data.last_page)
        setPage(data.current_page)
      })
      .catch(() => setError('Failed to load complexes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1, { search, sport, location })
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    load(1, { search, sport, location })
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Browse Complexes</h1>
          <p className="mt-1 text-zinc-500">Find the perfect sports complex and request your slot.</p>
        </div>
        <Link
          to="/bookings"
          className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-emerald-600 hover:text-emerald-300"
        >
          My Bookings
        </Link>
      </div>

      <Card>
        <form onSubmit={handleSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search by complex name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button
            type="submit"
            className="btn-glow rounded-lg bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-2 text-sm font-medium text-white transition hover:from-emerald-600 hover:to-teal-600"
          >
            Search
          </button>
        </form>
      </Card>

      {error && <Alert type="error" message={error} />}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : turfs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-zinc-500">No complexes found. Try adjusting your search.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Link key={turf.id} to={`/turfs/${turf.id}`} className="card group overflow-hidden">
                {turf.photos?.length ? (
                  <img src={turf.photos[0].url} alt={turf.name} className="aspect-[16/6] w-full object-cover transition group-hover:brightness-110" />
                ) : (
                  <div className="flex aspect-[16/6] items-center justify-center bg-gradient-to-br from-emerald-600 via-teal-800 to-black transition group-hover:brightness-110"><span className="text-4xl font-bold text-white/90">{turf.name.slice(0, 1)}</span></div>
                )}
                <div className="p-5">
                  <h2 className="text-lg font-semibold text-white transition group-hover:text-emerald-400">
                    {turf.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-zinc-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {turf.location}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-sm"><span className="font-semibold text-emerald-400">${Number(turf.price_per_slot || 0).toFixed(2)} / slot</span><span className="text-amber-300">★ {Number(turf.reviews_avg_rating || 0).toFixed(1)} <span className="text-zinc-500">({turf.reviews_count || 0})</span></span></div>
                  {turf.sports?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {turf.sports.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full border border-emerald-900/70 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-medium text-emerald-300"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3 text-sm">
                    <span className="text-zinc-500">View details, photos and reviews</span>
                    <span className="font-medium text-emerald-500 opacity-0 transition group-hover:opacity-100">
                      View slots →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => load(page - 1, { search, sport, location })}
                disabled={page <= 1}
                className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-zinc-500">
                Page {page} of {lastPage}
              </span>
              <button
                onClick={() => load(page + 1, { search, sport, location })}
                disabled={page >= lastPage}
                className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
