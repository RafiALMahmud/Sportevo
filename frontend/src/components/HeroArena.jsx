import { useTranslation } from '../i18n/useTranslation'
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import arenaPoster from '../assets/hero-arena-poster.webp'

const ArenaCanvas = lazy(() => import('./ArenaCanvas'))

function ArenaPoster() {
  return <div className="arena-poster"><img src={arenaPoster} alt="" width="735" height="551" decoding="async" fetchPriority="high" /></div>
}

class ArenaBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <ArenaPoster /> : this.props.children }
}

export default function HeroArena() {
  const { t } = useTranslation()
  const host = useRef(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const connection = navigator.connection
    let idle
    let visible = false
    const cancel = () => { if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else window.clearTimeout(idle) }
    const update = () => {
      cancel()
      const eligible = !connection?.saveData
      if (!eligible) { setEnabled(false); return }
      if (visible && !document.hidden) {
        const activate = () => setEnabled(true)
        if (window.requestIdleCallback) idle = window.requestIdleCallback(activate, { timeout: 1800 })
        else idle = window.setTimeout(activate, 400)
      }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update() })
    observer.observe(host.current)
    connection?.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); connection?.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); cancel() }
  }, [])
  return <div className="hero-arena" ref={host} aria-hidden="true">
    <div className="arena-orbit arena-orbit-one" /><div className="arena-orbit arena-orbit-two" />
    <ArenaBoundary><Suspense fallback={<ArenaPoster />}>{enabled ? <ArenaCanvas onFailure={() => setEnabled(false)} /> : <ArenaPoster />}</Suspense></ArenaBoundary>
    <span className="arena-caption">{t("A NEW PERSPECTIVE ON PLAY")}</span>
  </div>
}
