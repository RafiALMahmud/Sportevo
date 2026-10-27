import { useTranslation } from '../i18n/useTranslation'
import { complexRateLabel } from '../utils/fieldPricing'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { getSports } from '../api/catalog'
import Spinner from '../components/Spinner'
import Seo from '../components/Seo'
import { Card, Input, Select, Alert } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import ComplexCover from '../components/ComplexCover'

export default function Turfs() {
  const location = useLocation()
  return <ComplexResults key={location.key} />
}

function ComplexResults() {
  const [params, setParams] = useSearchParams()
  const { t } = useTranslation()
  const { user } = useAuth()
  const [turfs, setTurfs] = useState([])
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters] = useState(() => ({ search: params.get('search') || '', sport: params.get('sport_name') ? '' : params.get('sport') || '', sport_name: params.get('sport_name') || '', location: params.get('location') || '' }))
  const [search, setSearch] = useState(filters.search)
  const [sport, setSport] = useState(filters.sport_name ? '__other' : filters.sport)
  const [otherSport, setOtherSport] = useState(filters.sport_name)
  const [location, setLocation] = useState(filters.location)
  const requestedPage = Number(params.get('page') || 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [lastPage, setLastPage] = useState(1)
  const setPage = next => { const updated = new URLSearchParams(params); if (next > 1) updated.set('page', String(next)); else updated.delete('page'); setParams(updated) }

  useEffect(() => {
    getSports()
      .then(({ data }) => setSports(data.sports))
      .catch(() => {})
  }, [])

  const load = useCallback((signal) => {
    setLoading(true)
    setError('')
    api
      .get('/turfs', {
        params: { page, ...filters }, signal,
      })
      .then(({ data }) => {
        setTurfs(data.data)
        setLastPage(data.last_page)
      })
      .catch((error) => { if (error.code !== 'ERR_CANCELED') setError('Failed to load complexes.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [page, filters])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const handleSearch = (e) => {
    e.preventDefault()
    const updated = new URLSearchParams()
    for (const [key, value] of Object.entries({ search: search.trim(), sport: sport === '__other' ? '' : sport, sport_name: sport === '__other' ? otherSport.trim() : '', location: location.trim() })) {
      if (value) updated.set(key, value)
    }
    setParams(updated)
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Seo
        title={t("All Complexes")}
        description={t("Find a sports complex near you, compare prices per slot and request your preferred time.")}
        path="/turfs"
      />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("All Complexes")}</h1>
          <p className="mt-1 text-zinc-500">{t("Find the perfect sports complex and request your slot.")}</p>
        </div>
        {user?.role === 'user' && <Link
          to="/bookings"
          className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-emerald-600 hover:text-emerald-300"
        >{t("My Bookings")}</Link>}
      </div>

      <Card>
        <form onSubmit={handleSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="search"
            aria-label={t("Search by complex name")}
            maxLength={255}
            placeholder={t("Search by complex name")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">{t("All sports")}</option>
            <option value="__other">{t("Other sport…")}</option>
            {sports.map((s) => (
              <option key={s.id} value={s.slug}>
                {t(s.name)}
              </option>
            ))}
          </Select>
          {sport === '__other' && <Input aria-label={t("Other sport name")} placeholder={t("Enter game / sport name")} required maxLength={80} value={otherSport} onChange={(e) => setOtherSport(e.target.value)} />}
          <Input
            placeholder={t("Location")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button
            type="submit"
            className="btn-glow rounded-lg bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-2 text-sm font-medium text-white transition hover:from-emerald-600 hover:to-teal-600"
          >{t("Search")}</button>
        </form>
      </Card>

      {error && <Alert type="error" message={error} />}

      {loading && !turfs.length ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : !error && turfs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-zinc-400">{filters.search || filters.sport || filters.location ? t("No complexes found. Try adjusting your search.") : t("No approved complexes are available yet. Newly registered complexes appear after admin approval.")}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Link key={turf.id} to={`/turfs/${turf.id}`} className="card group overflow-hidden">
                <ComplexCover src={turf.photos?.[0]?.url} name={turf.name} />
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
                  <div className="mt-2 flex items-center justify-between text-sm"><span className="font-semibold text-emerald-400">{complexRateLabel(turf)}</span><span className="text-amber-300">★ {Number(turf.reviews_avg_rating || 0).toFixed(1)} <span className="text-zinc-500">({turf.reviews_count || 0})</span></span></div>
                  {Array.from(new Map((turf.fields?.flatMap((f) => f.sports) || turf.sports || []).map((s) => [s.id, s])).values())?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Array.from(new Map((turf.fields?.flatMap((f) => f.sports) || turf.sports || []).map((s) => [s.id, s])).values()).map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full border border-emerald-900/70 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-medium text-emerald-300"
                        >
                          {t(s.name)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3 text-sm">
                    <span className="text-zinc-500">{t("View details, photos and reviews")}</span>
                    <span className="font-medium text-emerald-500 opacity-0 transition group-hover:opacity-100">{t("View slots →")}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >{t("Previous")}</button>
              <span className="text-sm text-zinc-500">{t("Page ")}{page}{t(" of ")}{lastPage}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= lastPage || loading}
                className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >{t("Next")}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
