import { useTranslation } from '../i18n/useTranslation'
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import football from '../assets/sports/sculptures/football.webp'
import cricket from '../assets/sports/sculptures/cricket.webp'
import tennis from '../assets/sports/sculptures/tennis.webp'
import basketball from '../assets/sports/sculptures/basketball.webp'

const SportSculptures = lazy(() => import('./SportSculptures'))

const sports = [
  { id: 'football', title: 'Football', note: 'Bring your squad. Own the pitch.', image: football, alt: '3D football and goal on an emerald display stage' },
  { id: 'cricket', title: 'Cricket', note: 'Every over is a new opportunity.', image: cricket, alt: '3D cricket bat, ball and wicket on an emerald display stage' },
  { id: 'tennis', title: 'Tennis', note: 'Find your rhythm. Make your next serve.', image: tennis, alt: '3D tennis racket and ball on an emerald display stage' },
  { id: 'basketball', title: 'Basketball', note: 'Your team. Your court. Your next shot.', image: basketball, alt: '3D basketball, hoop and woven net on an emerald display stage' },
]

class SculptureBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? null : this.props.children }
}

function SculptureScene({ sport, visible, awake, reduced, saveData }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [activated, setActivated] = useState(false)
  const markReady = useCallback(() => setReady(true), [])
  const markFailed = useCallback(() => setFailed(true), [])
  useEffect(() => {
    if (!visible || !awake || saveData || reduced) return
    // Wait until the section is nearby; never put WebGL on the initial page's critical path.
    const timer = window.setTimeout(() => setActivated(true), 120)
    return () => window.clearTimeout(timer)
  }, [visible, awake, saveData, reduced])
  const enabled = activated && !failed && !saveData && !reduced
  return <figure className="showcase-scene sculpture-scene" role="img" aria-label={sport.alt} data-sport={sport.id} data-ready={ready && enabled}>
    <div className="sculpture-poster" aria-hidden="true"><img src={sport.image} alt="" width="800" height="800" loading="lazy" decoding="async" /></div>
    <SculptureBoundary onFailure={markFailed}><Suspense fallback={null}>{enabled && <SportSculptures sport={sport.id} playing={visible && awake} onReady={markReady} onFailure={markFailed} />}</Suspense></SculptureBoundary>
    <div className="sculpture-orbit" aria-hidden="true" />
    <figcaption className="showcase-scene-label" aria-hidden="true">{sport.title}</figcaption>
  </figure>
}

export default function SportsShowcase() {
  const { t } = useTranslation()
  const host = useRef(null)
  const gesture = useRef(null)
  const [slide, setSlide] = useState({ index: 0, revision: 0 })
  const [visible, setVisible] = useState(false)
  const [awake, setAwake] = useState(!document.hidden)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [saveData, setSaveData] = useState(() => !!navigator.connection?.saveData)
  const sport = sports[slide.index]
  const moving = visible && awake && !reduced && !saveData
  const changeSport = direction => {
    setSlide(current => ({
      index: (current.index + direction + sports.length) % sports.length,
      revision: current.revision + 1,
    }))
  }
  const handleKeyDown = event => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    changeSport(event.key === 'ArrowRight' ? 1 : -1)
  }
  const startSwipe = event => {
    gesture.current = null
    // Keep the reduced-motion filmstrip's native horizontal scrolling.
    if (event.touches.length !== 1 || (reduced && event.target.closest('.sport-filmstrip'))) return
    const touch = event.touches[0]
    gesture.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier }
  }
  const finishSwipe = event => {
    const start = gesture.current
    gesture.current = null
    if (!start) return
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id)
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) changeSport(dx < 0 ? 1 : -1)
  }
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(motion.matches)
    const visibility = () => setAwake(!document.hidden)
    const connection = () => setSaveData(!!navigator.connection?.saveData)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(host.current)
    motion.addEventListener('change', update); document.addEventListener('visibilitychange', visibility)
    navigator.connection?.addEventListener('change', connection)
    return () => { observer.disconnect(); motion.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); navigator.connection?.removeEventListener('change', connection) }
  }, [])
  useEffect(() => {
    if (!moving) return
    const timer = window.setTimeout(() => setSlide(current => ({ index: (current.index + 1) % sports.length, revision: current.revision + 1 })), 7000)
    return () => window.clearTimeout(timer)
  }, [moving, slide.index, slide.revision])
  useEffect(() => {
    if (!visible || navigator.connection?.saveData) return
    const next = new Image()
    next.src = sports[(slide.index + 1) % sports.length].image
  }, [visible, slide.index])
  return <section ref={host} className="sports-showcase cinematic-showcase sculpture-showcase" aria-label={t("Sport spotlight")} aria-roledescription="carousel" aria-keyshortcuts="ArrowLeft ArrowRight" aria-describedby="sports-navigation-hint" tabIndex={0} onKeyDown={handleKeyDown} onTouchStart={startSwipe} onTouchEnd={finishSwipe} onTouchCancel={() => { gesture.current = null }}>
    <span id="sports-navigation-hint" className="sr-only">{t("Swipe left or right to change sports. Use the left and right arrow keys when this carousel is focused.")}</span>
    <div className="showcase-info"><p className="sport-section-label">{t("A FIELD FOR EVERY GAME")}</p><h3>{t(sport.title)}</h3><p>{t(sport.note)}</p><span className="showcase-note">{t("Explore the sports available on SportEvo.")}</span>
      <div className="sport-filmstrip" data-moving={moving} aria-label={t("Sports image gallery")}>
        <div className="sport-filmstrip-track">{[false, true].map(duplicate => <div className="sport-filmstrip-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>
          {sports.map(card => <figure key={card.title} className="sport-image-card" data-active={card.title === sport.title}><img src={card.image} alt={duplicate ? '' : t(card.alt)} loading="lazy" decoding="async" width="800" height="800" /><figcaption>{t(card.title)}</figcaption></figure>)}
        </div>)}</div>
      </div>
    </div>
    <SculptureScene sport={{ ...sport, title: t(sport.title), alt: t(sport.alt) }} visible={visible} awake={awake} reduced={reduced} saveData={saveData} />
  </section>
}
