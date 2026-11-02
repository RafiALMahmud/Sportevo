import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../i18n/useTranslation'
import LanguageToggle from './LanguageToggle'

const steps = [
  { title: 'Request a slot', status: 'Pending request', text: 'Choose a complex, field, date and available time. Sign in and send your booking request. Do not pay an advance before the owner accepts.' },
  { title: 'Owner accepts', status: 'Awaiting advance', text: 'The owner checks your request. Once accepted, the payment timer starts and My Bookings shows the amount, receiving account and deadline. If the owner rejects the request, no payment is needed.' },
  { title: 'Pay & send reference', status: 'Payment under review', text: 'Pay the advance to the account shown in My Bookings. Enter your transaction ID or payment reference there before the deadline. A reference submitted in time keeps your slot reserved while the owner reviews it.' },
  { title: 'Payment confirmed', status: 'Confirmed', text: 'The owner verifies receipt and confirms your payment. They can also confirm receipt directly after you contact them. Your booking is now confirmed. Check My Bookings for the latest status before your game.' },
]

export default function BookingGuide({ compact = false }) {
  const { t, n } = useTranslation()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(!compact)
  const id = useId()
  const current = steps[step]
  return <section className="booking-guide" aria-label={t('How booking works')}>
    <header><button type="button" className="booking-guide-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>{t('How booking works')}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button><LanguageToggle /></header>
    {open && <div id={id} className="booking-guide-body">
      <p>{t('Request → Owner accepts → Advance payment → Final confirmation')}</p>
      <nav className="booking-guide-steps" aria-label={t('Booking guide steps')}>
        {steps.map((item, index) => <button key={item.title} type="button" aria-pressed={index === step} onClick={() => setStep(index)}><span>{n(index + 1)}</span><strong>{t(item.title)}</strong></button>)}
      </nav>
      <div className="booking-guide-detail" aria-live="polite" aria-atomic="true" data-step={step + 1}><span>{t('Step {count} of 4', { count: n(step + 1) })}</span><h3>{t(current.title)}</h3><b>{t(current.status)}</b><p>{t(current.text)}</p></div>
      <div className="booking-guide-controls"><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('Previous step')}</button><button type="button" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>{t('Next step')}</button><Link to="/bookings">{t('My Bookings')}</Link></div>
      <ul className="booking-guide-notes"><li>{t('Pay within the deadline shown on your booking. Owners can choose a window from 10 minutes; the usual default is 60 minutes.')}</li><li>{t('If no payment reference is submitted before the deadline, the slot is released. Submitting a reference is not the same as final payment confirmation.')}</li><li>{t('If advance payment is turned off or waived, owner acceptance confirms the booking without the advance-payment steps.')}</li></ul>
    </div>}
  </section>
}
