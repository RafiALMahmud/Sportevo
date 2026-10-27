import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

function PhotoViewer({ photos, name, initial, onClose }) {
  const { t } = useTranslation()
  const dialog = useRef(null)
  const [index, setIndex] = useState(initial)
  const move = (direction) => setIndex((current) => (current + direction + photos.length) % photos.length)
  useEffect(() => {
    const element = dialog.current
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [])
  return <dialog ref={dialog} aria-label={t("{value0} photo gallery", { value0: name })} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
  }} className="fixed inset-0 m-auto max-h-[95dvh] w-[95vw] max-w-6xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-white backdrop:bg-black/90">
    <div className="mb-3 flex items-center justify-between gap-3"><p aria-live="polite" className="text-sm">{name}{t(" · Photo ")}{index + 1}{t(" of ")}{formatNumber(photos.length)}</p><button type="button" autoFocus onClick={onClose} aria-label={t("Close photo gallery")} className="rounded-lg border border-zinc-700 px-3 py-2 hover:bg-zinc-800">{t("Close ✕")}</button></div>
    <img src={photos[index].url} alt={t("{value0} — photo {value1}", { value0: name, value1: index + 1 })} decoding="async" className="h-[60dvh] w-full object-contain" />
    {photos.length > 1 && <><div className="my-3 flex justify-between gap-3"><button type="button" onClick={() => move(-1)} aria-label={t("Previous photo")} className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-800">{t("← Previous")}</button><button type="button" onClick={() => move(1)} aria-label={t("Next photo")} className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-800">{t("Next →")}</button></div>
      <div className="flex gap-2 overflow-x-auto pb-2">{photos.map((photo, i) => <button type="button" key={photo.id || photo.url} onClick={() => setIndex(i)} aria-label={t("View photo {value0}", { value0: i + 1 })} aria-pressed={index === i} className={`shrink-0 overflow-hidden rounded-lg border-2 ${index === i ? 'border-emerald-400' : 'border-transparent'}`}><img loading="lazy" decoding="async" src={photo.url} alt="" className="h-16 w-24 object-cover" /></button>)}</div></>}
  </dialog>
}

export default function FieldGallery({ photos = [], name, compact = false }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(null)
  const photoLabel = photos.length === 1 ? t("View photo") : t("View photos ({count})", { count: photos.length })
  if (!photos.length) return compact ? null : <div className="flex h-48 items-center justify-center bg-gradient-to-br from-emerald-800 to-black text-6xl font-bold text-white/80">{name?.[0]}</div>
  return <>
    {compact ? <Button type="button" variant="secondary" onClick={() => setSelected(0)} className="min-h-11">{photoLabel}</Button> : <div className="space-y-3">
      <button type="button" onClick={() => setSelected(0)} aria-label={t("View all {value0} photos of {value1}", { value0: photos.length, value1: name })} className="relative block w-full overflow-hidden bg-zinc-900">
        <img fetchPriority="high" decoding="async" src={photos[0].url} alt={t("{value0} — cover photo", { value0: name })} className="h-64 w-full object-cover object-center sm:h-80" />
        <span className="absolute bottom-3 right-3 rounded-lg bg-black/80 px-3 py-2 text-sm text-white">{photoLabel}</span>
      </button>
      <div className="grid grid-cols-3 gap-2 px-3 sm:grid-cols-6">{photos.map((photo, i) => <button type="button" key={photo.id || photo.url} onClick={() => setSelected(i)} aria-label={t("View photo {value0} of {value1}", { value0: i + 1, value1: name })} className="overflow-hidden rounded-lg border border-zinc-800 hover:border-emerald-500"><img loading="lazy" decoding="async" src={photo.url} alt={t("{value0} — photo {value1}", { value0: name, value1: i + 1 })} className="aspect-video h-full w-full object-cover object-center" /></button>)}</div>
    </div>}
    {selected !== null && <PhotoViewer photos={photos} name={name} initial={selected} onClose={() => setSelected(null)} />}
  </>
}
