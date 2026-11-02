import { useEffect, useId, useRef } from 'react'
import BookingGuide from './BookingGuide'
import { useTranslation } from '../i18n/useTranslation'

export default function BookingGuideDialog({ open, onClose, onContinue, returnFocus, selection }) {
  const node = useRef(null)
  const title = useId()
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    const dialog = node.current
    const trigger = returnFocus?.current || document.activeElement
    const overflow = document.body.style.overflow
    dialog.showModal(); document.body.style.overflow = 'hidden'
    return () => {
      dialog.close(); document.body.style.overflow = overflow
      if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true })
    }
  }, [open, returnFocus])
  return <dialog ref={node} className="booking-guide-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="booking-guide-dialog-content">
      <header><h2 id={title}>{t('Before your first booking')}</h2><button type="button" onClick={onClose} aria-label={t('Close booking instructions')}>{t('Close')}</button></header>
      <p>{t('Read the steps before sending your first request. No booking is sent until you choose Continue to request.')}</p>
      {selection && <p className="booking-guide-selection">{selection}</p>}
      {open && <BookingGuide />}
      <footer><button type="button" onClick={onClose}>{t('Back to slots')}</button><button type="button" className="sport-button sport-button-primary" onClick={onContinue}>{t('Continue to request')}</button></footer>
    </div>
  </dialog>
}
