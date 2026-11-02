import { useTranslation } from '../i18n/useTranslation'
import { useEffect, useRef, useState } from 'react'
import football from '../assets/sports/football-r9.webp'
import cricket from '../assets/sports/cricket-ponting.webp'
import tennis from '../assets/sports/tennis-federer.webp'
import basketball from '../assets/sports/basketball-kobe.webp'
import footballCard from '../assets/sports/football-card.webp'
import cricketCard from '../assets/sports/cricket-card.webp'
import tennisCard from '../assets/sports/tennis-card.webp'
import basketballCard from '../assets/sports/basketball-card.webp'

const sportCards = [
  { title: 'Football', image: footballCard, alt: 'Football and boots on a floodlit turf' },
  { title: 'Cricket', image: cricketCard, alt: 'Cricket ball, bat and stumps under emerald lighting' },
  { title: 'Tennis', image: tennisCard, alt: 'Tennis balls and racket on a neon-lit court' },
  { title: 'Basketball', image: basketballCard, alt: 'Basketball on an indoor court with a hoop behind it' },
]

const sports = [
  { id: 'football', title: 'Football', note: 'Bring your squad. Own the pitch.', image: football, alt: 'Artistic portrait of Ronaldo Nazário controlling a football under emerald and coral lights' },
  { id: 'cricket', title: 'Cricket', note: 'Every over is a new opportunity.', image: cricket, alt: 'Artistic portrait of Ricky Ponting playing a cricket stroke in a teal kit under cinematic lights' },
  { id: 'tennis', title: 'Tennis', note: 'Find your rhythm. Make your next serve.', image: tennis, alt: 'Artistic portrait of Roger Federer with a tennis racket under emerald and coral lights' },
  { id: 'basketball', title: 'Basketball', note: 'Your team. Your court. Your next shot.', image: basketball, alt: 'Artistic portrait of Kobe Bryant dribbling beside a visible basketball hoop and net under emerald and coral lights' },
]

export default function SportsShowcase() {
  const { t } = useTranslation()
  const host = useRef(null)
  const gesture = useRef(null)
  const [slide, setSlide] = useState({ index: 0, previous: null, revision: 0 })
  const [visible, setVisible] = useState(false)
  const [awake, setAwake] = useState(!document.hidden)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [saveData, setSaveData] = useState(() => !!navigator.connection?.saveData)
  const sport = sports[slide.index]
  const moving = visible && awake && !reduced && !saveData
  const changeSport = direction => {
    setSlide(current => ({
      index: (current.index + direction + sports.length) % sports.length,
      previous: reduced || saveData ? null : current.index,
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
    const timer = window.setTimeout(() => setSlide(current => ({ index: (current.index + 1) % sports.length, previous: current.index, revision: current.revision + 1 })), 7000)
    return () => window.clearTimeout(timer)
  }, [moving, slide.index, slide.revision])
  useEffect(() => {
    if (slide.previous === null) return
    const timer = window.setTimeout(() => setSlide(current => ({ ...current, previous: null })), 1100)
    return () => window.clearTimeout(timer)
  }, [slide.revision, slide.previous])
  useEffect(() => {
    if (!visible || navigator.connection?.saveData) return
    const next = new Image()
    next.src = sports[(slide.index + 1) % sports.length].image
  }, [visible, slide.index])
  return <section ref={host} className="sports-showcase cinematic-showcase" aria-label={t("Sport spotlight")} aria-roledescription="carousel" aria-keyshortcuts="ArrowLeft ArrowRight" aria-describedby="sports-navigation-hint" tabIndex={0} onKeyDown={handleKeyDown} onTouchStart={startSwipe} onTouchEnd={finishSwipe} onTouchCancel={() => { gesture.current = null }}>
    <span id="sports-navigation-hint" className="sr-only">{t("Swipe left or right to change sports. Use the left and right arrow keys when this carousel is focused.")}</span>
    <div className="showcase-info"><p className="sport-section-label">{t("A FIELD FOR EVERY GAME")}</p><h3>{t(sport.title)}</h3><p>{t(sport.note)}</p><span className="showcase-note">{t("Explore the sports available on SportEvo.")}</span>
      <div className="sport-filmstrip" data-moving={moving} aria-label={t("Sports image gallery")}>
        <div className="sport-filmstrip-track">{[false, true].map(duplicate => <div className="sport-filmstrip-group" key={String(duplicate)} aria-hidden={duplicate || undefined}>
          {sportCards.map(card => <figure key={card.title} className="sport-image-card" data-active={card.title === sport.title}><img src={card.image} alt={duplicate ? '' : t(card.alt)} loading="lazy" decoding="async" width="640" height="427" /><figcaption>{t(card.title)}</figcaption></figure>)}
        </div>)}</div>
      </div>
    </div>
    <figure className={`showcase-scene cinematic-scene ${moving ? 'cinematic-moving' : ''}`} data-sport={sport.id} aria-label={t(sport.title) + ' ' + t('cinematic artwork')}>
      {slide.previous !== null && <div className="artwork-exit" key={'exit-' + slide.revision} aria-hidden="true"><img src={sports[slide.previous].image} alt="" draggable={false} /></div>}
      <div className="artwork-entry" key={slide.revision}><img className="artwork-image" src={sport.image} alt={t(sport.alt)} loading="lazy" decoding="async" width="1000" height="1000" draggable={false} /></div>
      <div className="cinematic-vignette" aria-hidden="true" />
      <figcaption className="showcase-scene-label">{t(sport.title.toUpperCase())}</figcaption>
    </figure>
  </section>
}
