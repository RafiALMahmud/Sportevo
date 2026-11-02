import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n/useTranslation'

const mobileQuery = '(max-width: 899px)'
const subscribe = callback => {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const isMobile = () => window.matchMedia(mobileQuery).matches

export default function SlotEditorPanel({ open, onClose, busy, children }) {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => false)
  const dialog = useRef(null)
  const title = useId()
  const { t } = useTranslation()
  useEffect(() => {
    if (!mobile || !open) return
    const node = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    node.showModal(); document.body.style.overflow = 'hidden'
    return () => {
      node.close(); document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [mobile, open])
  if (!mobile) return <aside className="schedule-selection" data-selected={open} aria-label={t('Selected slot details')} aria-live="polite">{children}</aside>
  return <dialog ref={dialog} className="schedule-slot-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="schedule-selection" data-selected={open}>
      <header className="schedule-dialog-heading"><h2 id={title}>{t('Slot details')}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={t('Close slot editor')}>{t('Close')}</button></header>
      {children}
    </div>
  </dialog>
}
