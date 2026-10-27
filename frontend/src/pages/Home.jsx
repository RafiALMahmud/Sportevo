import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import HeroArena from '../components/HeroArena'
import ContactForm from '../components/ContactForm'
import SportsShowcase from '../components/SportsShowcase'
import SiteFooter from '../components/SiteFooter'
import { complexRateLabel } from '../utils/fieldPricing'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { getSports } from '../api/catalog'
import Spinner from '../components/Spinner'
import Seo from '../components/Seo'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import ComplexCover from '../components/ComplexCover'

export default function Home() {
  const { t } = useTranslation()
  const [turfs, setTurfs] = useState([])
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('')
  const [otherSport, setOtherSport] = useState('')
  const [filters, setFilters] = useState({ search: '', sport: '' })
  const [ownTurf, setOwnTurf] = useState(null)
  const { user } = useAuth()

  const load = useCallback((signal) => {
    setLoading(true)
    setError('')
    const params = { per_page: 12 }
    if (filters.search.trim()) params.search = filters.search.trim()
    if (filters.sport) params.sport = filters.sport
    if (filters.sport_name) params.sport_name = filters.sport_name
    api
      .get('/turfs', { params, signal })
      .then(({ data }) => setTurfs(data.data))
      .catch((error) => { if (error.code !== 'ERR_CANCELED') setError('Failed to load complexes.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [filters])

  useEffect(() => {
    getSports()
      .then(({ data }) => setSports(data.sports))
      .catch(() => {})
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  useEffect(() => {
    if (user?.role !== 'turf') return
    const controller = new AbortController()
    api.get('/my-turf', { signal: controller.signal }).then(({ data }) => setOwnTurf(data.turf)).catch(() => {})
    return () => controller.abort()
  }, [user?.role])

  const handleSearch = (e) => {
    e.preventDefault()
    setFilters({ search, sport: sport === '__other' ? '' : sport, sport_name: sport === '__other' ? otherSport.trim() : '' })
  }

  const actionLabel = user ? 'View slots' : 'View slots →'

  return (
    <div className="sportevo-home min-h-screen bg-black text-zinc-200">
      <Seo
        title={t("Book Your Perfect Sports Complex")}
        description={t("Discover sports complexes across Bangladesh. Explore fields, compare taka prices and request your next game with SportEvo.")}
        path="/"
      />
      <Navbar />
      <main>
      <section className="sport-hero">
        <div className="sport-hero-shade" />
        <div className="sport-hero-content mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="sport-eyebrow"><span />{t(" YOUR NEXT GAME STARTS HERE")}</p>
          <h1>{t("Your game.")}<br /><em>{t("A new dimension.")}</em></h1>
          <p className="sport-hero-description">{t("Bring your team. Find your field. Discover sports complexes across Bangladesh and make time for the game you love.")}</p>
          <div className="sport-hero-actions">
            <a href="#complexes" className="sport-button sport-button-primary">{t("Find a field ")}<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" /></svg></a>
            <Link to="/turfs" className="sport-button sport-button-secondary">{t("Explore complexes")}</Link>
          </div>
          <div className="sport-hero-details"><span>{t("Football, cricket & more")}</span><span>{t("Prices in BDT")}</span><span>{t("Choose your time slot")}</span></div>
        </div>
        <HeroArena />
        <div className="sport-hero-bottom mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><span>{t("THE GAME IS CALLING.")}</span><a href="#complexes">{t("EXPLORE BELOW ")}<span aria-hidden="true">&#8595;</span></a></div>
      </section>
      <div className="sport-ribbon"><span>{t("YOUR TEAM.")}</span><span>{t("YOUR FIELD.")}</span><span>{t("YOUR GAME.")}</span><span>{t("SportEvo.")}</span></div>
      {/* Complex listing */}
      <section id="complexes" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {user?.role === 'turf' && ownTurf && !ownTurf.is_approved && <div className="mb-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">{t("Your complex, ")}<strong>{ownTurf.name}</strong>{t(", is awaiting admin approval. It will appear here once approved. ")}<Link to="/dashboard/turf" className="underline">{t("Manage your complex")}</Link></div>}
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500">{t("EXPLORE & PLAY")}</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-5xl">{t("Find your next playground.")}</h2><p className="mt-3 text-zinc-400">{t("Explore fields, compare prices and choose your next game.")}</p>
          </div>
          <p className="text-sm text-zinc-500">{formatNumber(turfs.length)}{t(" available")}</p>
        </div>

        <SportsShowcase />
          <form
            onSubmit={handleSearch}
            className="venue-search grid gap-3 md:grid-cols-[1fr_220px_auto]"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("Search complexes")} placeholder={t("Search complexes...")}
              className="w-full flex-1 rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 shadow-lg shadow-black/40 transition placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60"
            />
            <select
              aria-label={t("Sport type")}
              value={sport}
              onChange={(e) => {
                setSport(e.target.value)
                setFilters({ search, sport: e.target.value === '__other' ? '' : e.target.value, sport_name: '' })
              }}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 shadow-lg shadow-black/40 transition hover:border-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-900/60 sm:w-52"
            >
              <option value="">{t("All sports")}</option>
              <option value="__other">{t("Other sport…")}</option>
              {sports.map((s) => (
                <option key={s.id} value={s.slug}>
                  {t(s.name)}
                </option>
              ))}
            </select>
            {sport === '__other' && <input aria-label={t("Other sport name")} placeholder={t("Enter game / sport name")} required maxLength={80} value={otherSport} onChange={(e) => setOtherSport(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 sm:w-52" />}
            <button
              type="submit"
              className="sport-button sport-button-primary"
            >{t("Search")}</button>
          </form>

        {error && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading && !turfs.length ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : !error && turfs.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-zinc-400">{filters.search || filters.sport || filters.sport_name ? t("No complexes match your search.") : t("No approved complexes are available yet. Newly registered complexes appear after admin approval.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((turf) => (
              <Link
                key={turf.id}
                to={`/turfs/${turf.id}`}
                className="card group overflow-hidden"
              >
                <ComplexCover src={turf.photos?.[0]?.url} name={turf.name} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-white transition group-hover:text-emerald-400">
                      {turf.name}
                    </h3>
                    <span className="shrink-0 font-medium text-emerald-500">{t(actionLabel)}</span>
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
                    <span className="text-zinc-500">{complexRateLabel(turf)}</span>
                    <span className="font-medium text-emerald-500 opacity-0 transition group-hover:opacity-100">{t("View slots →")}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section id="how-it-works" className="sport-how mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="sport-section-label">{t("LESS PLANNING. MORE PLAYING.")}</p><h2>{t("Your next match, in three moves.")}</h2>
        <div className="sport-steps">{[
          ['01', 'Find your field', 'Browse complexes and select the sport you want to play. See field photos and prices before choosing.'],
          ['02', 'Choose your moment', 'Pick your field, date and available time slot. Sign in to send your booking request.'],
          ['03', 'Get ready to play', "Track the owner's response in My Bookings. Once accepted, bring your team and enjoy your game."],
        ].map(([number, title, description]) => <article key={number}><span>{formatNumber(number)}</span><h3>{t(title)}</h3><p>{t(description)}</p></article>)}</div>
      </section>
      <section className="sport-owner mx-auto max-w-7xl"><div><p className="sport-section-label">{t("FOR COMPLEX OWNERS")}</p><h2>{t("Your field.")}<br />{t("A bigger audience.")}</h2><p>{t("Put your complex on SportEvo. Add your fields and photos, manage your schedule and receive booking requests in one place.")}</p></div><Link to={user?.role === 'turf' ? '/dashboard/turf' : user ? '/profile' : '/register'} className="sport-button sport-button-primary">{user?.role === 'turf' ? t("Manage your complex") : user ? t("My profile") : t("Join SportEvo")} <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M7 7h10v10" /></svg></Link></section>
      <section id="faq" className="sport-faq mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div><p className="sport-section-label">{t("BEFORE YOU PLAY")}</p><h2>{t("A few things to know.")}</h2><p>{t("Simple answers for your next booking.")}</p></div><div>{[
        ['How do I book a field?', 'Select a complex, choose a field, then pick a date and an available slot. Sign in and send your request. Your booking is confirmed when the owner accepts it.'],
        ['Can I find different sports?', 'Yes. Use the sport filter to browse available games. Select Other sport and enter a game name to search for something different.'],
        ['What currency are prices in?', 'All field prices, booking quotes and balances are in Bangladeshi taka (BDT).'],
        ['How can I report an issue?', 'Sign in and use Report an issue from your dashboard. You can track the admin response on your reports page.'],
      ].map(([question, answer]) => <details key={question}><summary>{t(question)}<span aria-hidden="true">+</span></summary><p>{t(answer)}</p></details>)}</div></section>
      <ContactForm />
      </main>
      <SiteFooter />
    </div>
  )
}
