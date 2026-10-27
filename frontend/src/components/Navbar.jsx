import { useTranslation } from '../i18n/useTranslation'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import BrandLogo from './BrandLogo'
import NavbarSearch from './NavbarSearch'
import { dashboardPath } from '../utils/dashboardPath'

export default function Navbar() {
  const location = useLocation()
  return <Navigation key={location.key} />
}

function Navigation() {
  const { t } = useTranslation()
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchToggle = useRef(null)
  const header = useRef(null)
  const toggle = useRef(null)
  const location = useLocation()
  useEffect(() => {
    const element = header.current
    const measure = () => element.style.setProperty('--navigation-height', `${element.getBoundingClientRect().height}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!header.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    const desktop = window.matchMedia('(min-width: 1280px)')
    const resize = (event) => { if (event.matches) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    desktop.addEventListener('change', resize)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); desktop.removeEventListener('change', resize) }
  }, [open])
  useEffect(() => {
    if (!searchOpen) return
    const outside = event => { if (!header.current?.contains(event.target)) setSearchOpen(false) }
    const escape = event => { if (event.key === 'Escape') { setSearchOpen(false); searchToggle.current?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [searchOpen])
  const search = query => {
    const params = new URLSearchParams()
    if (query) params.set('search', query)
    setOpen(false); setSearchOpen(false)
    navigate(`/turfs${params.size ? `?${params}` : ''}`)
  }
  const searchValue = new URLSearchParams(location.search).get('search') || ''
  const dashboard = dashboardPath(user?.role)
  const items = [
    { to: '/', label: 'Home' }, { to: '/turfs', label: 'All Complexes' },
    ...(user ? [{ to: dashboard, label: 'Dashboard' }] : []),
    ...(user?.role === 'user' ? [{ to: '/bookings', label: 'My Bookings' }] : []),
    { to: '/profile', label: 'My Profile' }, { to: '/#contact', label: 'Contact', anchor: true },
  ]
  const links = items.map((item) => item.anchor ? <a key={item.to} href={item.to} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white">{t(item.label)}</a> : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-emerald-950 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>{t(item.label)}</NavLink>)
  const accountButtons = loading ? <span className="text-sm text-zinc-500">{t("Loading…")}</span> : user ? <button type="button" onClick={async () => { await logout(); setOpen(false); navigate('/login') }} className="rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-950">{t("Logout")}</button>
    : <><Link to="/login" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-600 hover:bg-zinc-900">{t("Login")}</Link><Link to="/register" className="sport-button sport-button-primary">{t("Sign Up")}</Link></>
  return <header ref={header} onClick={(event) => { if (event.target.closest('a')) setOpen(false) }} className="sport-navbar sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/95 md:bg-zinc-950/80 md:backdrop-blur-md">
    <div className="sport-topbar"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><span>{t("FIND YOUR FIELD. PLAY YOUR GAME.")}</span><a href="mailto:sportevobd@gmail.com">sportevobd@gmail.com</a></div></div>
    <div className="sport-nav-inner mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link to="/" aria-label={t("Go to home page")} className="sport-brand flex shrink-0 items-center gap-3 rounded-lg py-1"><BrandLogo /><span className="sport-wordmark text-lg font-semibold text-white">Sport<span className="sport-brand-accent">Evo</span></span></Link>
        <button type="button" aria-label={t("Go back")} onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} className="hidden rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900">{t("Back")}</button>
        <nav aria-label={t("Primary")} className="sport-nav-links hidden items-center gap-1 xl:flex">{links}{!user && <><a href="/#how-it-works" className="whitespace-nowrap px-3 py-2 text-sm font-medium">{t("How it works")}</a><a href="/#faq" className="px-3 py-2 text-sm font-medium">{t("FAQ")}</a></>}</nav>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button ref={searchToggle} type="button" title={t('Search complexes')} aria-label={t('Search complexes')} aria-expanded={searchOpen} aria-controls="navbar-complex-search" onClick={() => setSearchOpen(value => !value)} className="navbar-search-toggle hidden h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 xl:flex"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        <LanguageToggle /><ThemeToggle />
        <div className="hidden items-center gap-2 xl:flex">{user && <Link to="/profile" className="hidden max-w-[140px] truncate rounded-lg px-2 py-1 text-sm text-white hover:bg-zinc-900 2xl:block">{user.name}</Link>}{accountButtons}</div>
        <button ref={toggle} type="button" aria-label={open ? t("Close navigation menu") : t("Open navigation menu")} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 xl:hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
        </button>
      </div>
    </div>
    {searchOpen && <div id="navbar-complex-search" className="navbar-search-panel hidden px-4 pb-4 sm:px-6 lg:px-8 xl:block"><NavbarSearch initialSearch={searchValue} onSearch={search} autoFocus /></div>}
    <nav id="mobile-navigation" aria-label={t("Primary mobile")} className={`${open ? 'flex' : 'hidden'} sport-mobile-navigation absolute left-0 right-0 top-full flex-col gap-1 overflow-y-auto border-b border-zinc-700 bg-zinc-950 p-4 shadow-xl xl:hidden`}>
      <NavbarSearch initialSearch={searchValue} onSearch={search} />
      {links}
      {!user && <><a href="/#how-it-works" className="rounded-lg px-3 py-2 text-sm text-zinc-400">{t("How it works")}</a><a href="/#faq" className="rounded-lg px-3 py-2 text-sm text-zinc-400">{t("FAQ")}</a></>}
      <div className="mt-2 flex flex-col gap-2 border-t border-zinc-800 pt-3">{accountButtons}</div>
    </nav>
  </header>
}
