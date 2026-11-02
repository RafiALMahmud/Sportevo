import { Link } from 'react-router-dom'
import BookingGuide from '../components/BookingGuide'
import Seo from '../components/Seo'
import { useTranslation } from '../i18n/useTranslation'

export default function HowToBook() {
  const { t } = useTranslation()
  return <div className="mx-auto max-w-5xl space-y-6">
    <Seo title={t('How to book')} description={t('Learn the booking, advance payment and confirmation steps before requesting a slot.')} path="/how-to-book" />
    <h1 className="text-3xl font-bold">{t('How to book')}</h1>
    <p>{t('Learn the booking, advance payment and confirmation steps before requesting a slot.')}</p>
    <BookingGuide />
    <Link to="/turfs" className="owner-schedule-link">{t('Browse all complexes')}</Link>
  </div>
}
