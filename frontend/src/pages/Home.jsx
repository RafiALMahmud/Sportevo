import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const [turfs, setTurfs] = useState([])
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('')
  const { user } = useAuth()

  const load = useCallback(() => {
    setLoading(true)
    const params = { per_page: 12 }
    if (search.trim()) params.search = search.trim()
    if (sport) params.sport = sport
    api
      .get('/turfs', { params })
      .then(({ data }) => setTurfs(data.data))
      .catch(() => setError('Failed to load complexes.'))
      .finally(() => setLoading(false))
  }, [search, sport])

  useEffect(() => {
    api
      .get('/sports')
      .then(({ data }) => setSports(data.sports))
      .catch(() => {})
    load()
  }, [load])

  const handleSearch = (e) => {
    e.preventDefault()
    load()
  }

  const actionLabel = user ? 'View slots' : 'View slots →'

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      {/* Hero */}
      <section className="relative px-4 py-20 text-center sm:px-6 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_28rem_at_50%_-12%,rgba(16,185,129,0.18),transparent_65%)]" />
        <div className="relative animate-fade-up">
          <p className="mb-4 inline-block rounded-full border border-emerald-800 bg-emerald-950/60 px-4 py-1 text-xs font-medium uppercase tracking-widest text-emerald-400">
            Multi-sport complex booking
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Book Your Perfect <span className="text-gradient">Sports Complex</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Explore complexes and facilities near you, check available time slots, and request
            your game in seconds.
          </p>

          {/* Search */}
          <form
            onSubmit={handleSearch}
            className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by complex name or location..."
              className="w-full flex-1 rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 shadow-lg shadow-black/40 transition placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60"
            />
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value)
                setTimeout(load, 0)
              }}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 shadow-lg shadow-black/40 transition hover:border-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60 sm:w-52"
            >
              <option value="">All sports</option>
              {sports.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn-glow rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:from-emerald-600 hover:to-teal-600"
            >
              Search
            </button>
          </form>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#complexes"
              className="btn-glow rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:from-emerald-600 hover:to-teal-600"
            >
              Browse Complexes
            </a>
            {!user && (
              <Link
                to="/register"
                className="rounded-xl border border-emerald-800 bg-zinc-950/60 px-6 py-3 text-sm font-semibold text-emerald-300 transition hover:-translate-y-0.5 hover:border-emerald-600 hover:bg-emerald-950/60 hover:shadow-[0_6px_24px_rgba(16,185,129,0.35)]"
              >
                Create an account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Complex listing */}
      <section id="complexes" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500">
              Facilities
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white">All Sports Complexes</h2>
          </div>
          <p className="text-sm text-zinc-500">{turfs.length} available</p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : turfs.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-zinc-500">No complexes match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Link
                key={turf.id}
                to={`/turfs/${turf.id}`}
                className="card group overflow-hidden"
              >
                <div className="flex aspect-[16/6] items-center justify-center bg-gradient-to-br from-emerald-800 via-teal-900 to-black transition group-hover:brightness-110">
                  <span className="text-4xl font-bold text-white/90">{turf.name.slice(0, 1)}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-white transition group-hover:text-emerald-400">
                      {turf.name}
                    </h3>
                    <span className="shrink-0 font-medium text-emerald-500">{actionLabel}</span>
                  </div>
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
                    <span className="text-zinc-500">${Number(turf.price_per_slot || 0).toFixed(2)} / slot</span>
                    <span className="font-medium text-emerald-500 opacity-0 transition group-hover:opacity-100">
                      View slots →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-zinc-600 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Sports Evo. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
