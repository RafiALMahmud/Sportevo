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
  const { t, language } = useTranslation()
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [compact, setCompact] = useState(true)
  const searchToggle = useRef(null)
  const header = useRef(null)
  const toggle = useRef(null)
  const inner = useRef(null)
  const brand = useRef(null)
  const navigation = useRef(null)
  const controls = useRef(null)
  const location = useLocation()
  useEffect(() => {
    let active = true
    const measure = () => {
      if (!active || !inner.current || !navigation.current) return
      const style = getComputedStyle(inner.current)
      const available = inner.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const menuWidth = toggle.current.getBoundingClientRect().width
      const controlsGap = parseFloat(getComputedStyle(controls.current).columnGap) || 0
      const fullControls = controls.current.getBoundingClientRect().width - (menuWidth ? menuWidth + controlsGap : 0)
      const needed = brand.current.getBoundingClientRect().width + navigation.current.scrollWidth + fullControls + 40
      const nextCompact = !window.matchMedia('(min-width: 1280px)').matches || needed > available
      setCompact(nextCompact)
      if (!nextCompact) setOpen(false)
    }
    const observer = new ResizeObserver(measure)
    for (const node of [inner.current, brand.current, navigation.current, controls.current]) observer.observe(node)
    const frame = requestAnimationFrame(measure)
    document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [language, user?.role, user?.name, loading])
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
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
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
  const dashboard = dashboardPath(user?.role, user?.needs_complex_registration)
  const items = [
    { to: '/', label: 'Home' }, { to: '/turfs', label: 'All Complexes' },
    ...(user ? [{ to: dashboard, label: 'Dashboard' }] : []),
    ...(user?.role === 'user' ? [{ to: '/bookings', label: 'My Bookings' }] : []),
    { to: '/profile', label: 'My Profile' }, { to: '/how-to-book', label: 'How to book' },
  ]
  const links = items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'} className="sport-nav-link">{t(item.label)}</NavLink>)
  const accountButtons = loading ? <span className="text-sm text-zinc-500">{t("Loading…")}</span> : user ? <button type="button" onClick={async () => { await logout(); setOpen(false); navigate('/login') }} className="rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-950">{t("Logout")}</button>
    : <><Link to="/login" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-600 hover:bg-zinc-900">{t("Login")}</Link><Link to="/register" className="sport-button sport-button-primary">{t("Sign Up")}</Link></>
  return <header ref={header} data-nav-compact={compact} onClick={(event) => { if (event.target.closest('a')) setOpen(false) }} className="sport-navbar sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/95 md:bg-zinc-950/80 md:backdrop-blur-md">
    <div className="sport-topbar"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><span>{t("FIND YOUR FIELD. PLAY YOUR GAME.")}</span><a href="mailto:sportevobd@gmail.com">sportevobd@gmail.com</a></div></div>
    <div ref={inner} className="sport-nav-inner mx-auto px-4 sm:px-6 lg:px-8">
      <Link ref={brand} to="/" aria-label={t("Go to home page")} className="sport-brand"><BrandLogo /><span className="sport-wordmark">Sport<span className="sport-brand-accent">Evo</span></span></Link>
      <div className="sport-nav-middle" aria-hidden={compact} inert={compact}>
        <nav ref={navigation} aria-label={t("Primary")} className="sport-nav-links">{links}{!user && <a href="/#faq" className="sport-nav-link">{t("FAQ")}</a>}</nav>
      </div>
      <div ref={controls} className="sport-nav-controls">
        <div className="sport-nav-tools">
        <button ref={searchToggle} type="button" title={t('Search complexes')} aria-label={t('Search complexes')} aria-expanded={searchOpen} aria-controls="navbar-complex-search" onClick={() => { setOpen(false); setSearchOpen(value => !value) }} className="navbar-search-toggle hidden h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 xl:flex"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        <LanguageToggle /><ThemeToggle />
        </div>
        <div className="sport-account-desktop hidden items-center gap-2 xl:flex">{user && <Link to="/profile" title={user.name} className="sport-account-name hidden 2xl:block">{user.name}</Link>}{accountButtons}</div>
        <button ref={toggle} type="button" aria-label={open ? t("Close navigation menu") : t("Open navigation menu")} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => { setSearchOpen(false); setOpen(!open) }} className="sport-menu-toggle items-center justify-center rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
        </button>
      </div>
    </div>
    {searchOpen && <div id="navbar-complex-search" className="navbar-search-panel hidden px-4 pb-4 sm:px-6 lg:px-8 xl:block"><NavbarSearch initialSearch={searchValue} onSearch={search} autoFocus /></div>}
    <nav id="mobile-navigation" aria-label={t("Primary mobile")} className={`${open ? 'flex' : 'hidden'} sport-mobile-navigation absolute left-0 right-0 top-full flex-col gap-1 overflow-y-auto border-b border-zinc-700 bg-zinc-950 p-4 shadow-xl`}>
      <NavbarSearch initialSearch={searchValue} onSearch={search} />
      {links}
      {!user && <a href="/#faq" className="rounded-lg px-3 py-2 text-sm text-zinc-400">{t("FAQ")}</a>}
      <div className="sport-mobile-account mt-2 flex flex-col gap-2 border-t border-zinc-800 pt-3">{accountButtons}</div>
    </nav>
  </header>
}
