import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useTranslation } from '../../i18n/useTranslation'
import AdvancePaymentSettings, { AdvancePaymentInbox } from '../../components/AdvancePaymentSettings'
import Seo from '../../components/Seo'
import Spinner from '../../components/Spinner'
import { Alert } from '../../components/ui'

export default function AdvancePayments() {
  const { t } = useTranslation()
  const [turf, setTurf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.get('/my-turf', { signal: controller.signal }).then(({ data }) => setTurf(data.turf))
      .catch(err => { if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Unable to load your complex.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  if (loading) return <Spinner />
  return <div className="mx-auto max-w-4xl space-y-6"><Seo title={t('Advance payments')} path="/dashboard/turf/payments" noIndex />
    <Link to="/dashboard/turf" className="text-emerald-400">{t('← Owner dashboard')}</Link><h1 className="text-2xl font-bold">{t('Advance payments')}</h1>
    {error && <Alert message={error} />}
    {turf ? <><h2 className="text-lg">{turf.name}</h2><AdvancePaymentInbox turfId={turf.id} /><AdvancePaymentSettings turfId={turf.id} /></> : <p>{t('Register your complex before setting up advance payments.')}</p>}
  </div>
}
