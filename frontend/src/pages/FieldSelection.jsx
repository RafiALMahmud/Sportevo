import { useTranslation } from '../i18n/useTranslation'
import { fieldRateLabel } from '../utils/fieldPricing'
import { FieldPlayersLabel } from '../components/FieldPlayers'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import ComplexCover from '../components/ComplexCover'
import Seo from '../components/Seo'
import Spinner from '../components/Spinner'
import { Alert } from '../components/ui'

export default function FieldSelection() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [turf, setTurf] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setTurf(null); setError('')
    api.get(`/turfs/${id}`, { signal: controller.signal }).then(({ data }) => setTurf(data.turf))
      .catch((e) => { if (e.code !== 'ERR_CANCELED') setError('Unable to load this complex.') })
    return () => controller.abort()
  }, [id])
  if (error) return <Alert message={error} />
  if (!turf) return <div className="flex justify-center py-20"><Spinner /></div>
  return <div className="space-y-6">
    <Seo title={t("Choose a field - {value0}", { value0: turf.name })} path={`/turfs/${id}`} />
    <Link to="/turfs" className="text-emerald-400">{t("Back to complexes")}</Link>
    <div><h1 className="text-2xl font-bold text-white">{turf.name}</h1><p className="text-zinc-400">{turf.location}</p><h2 className="mt-4 text-lg font-semibold text-white">{t("Choose your field")}</h2><p className="text-zinc-400">{t("Select a field to see all its photos and available booking slots.")}</p></div>
    {!turf.fields?.length && <p className="text-zinc-400">{t("No fields are available in this complex yet.")}</p>}
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{turf.fields?.map((field) => <Link key={field.id} to={`/turfs/${id}/fields/${field.id}`} className="card overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-500">
      <ComplexCover src={field.photos?.[0]?.url} name={field.name} />
      <div className="space-y-2 p-5"><h3 className="text-lg font-semibold text-white">{field.name}</h3><p className="text-sm text-zinc-400">{field.sports?.map((sport) => t(sport.name)).join(', ')}</p><FieldPlayersLabel value={field.players_per_side} /><p className="text-emerald-400">{fieldRateLabel(field)}</p><span className="inline-block text-sm text-emerald-400">{t("View photos & slots →")}</span></div>
    </Link>)}</div>
  </div>
}
