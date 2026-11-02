import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from '../i18n/useTranslation'
import { currentPosition } from '../utils/google'
import { complexRateLabel } from '../utils/fieldPricing'
import { getSports } from '../api/catalog'
import api from '../api/client'
import ComplexMap from '../components/ComplexMap'
import Seo from '../components/Seo'
import { Alert, Input, Select } from '../components/ui'

const geoKeys = ['lat', 'lng', 'radius_km', 'north', 'south', 'east', 'west']
export default function MapSearch() {
  const { t, locale } = useTranslation()
  const [params, setParams] = useSearchParams()
  const query = params.toString()
  const searchInUrl = params.get('search') || ''
  const sportInUrl = params.get('sport') || ''
  const otherInUrl = params.get('sport_name') || ''
  const locationInUrl = params.get('location') || ''
  const [search, setSearch] = useState(params.get('search') || '')
  const [sport, setSport] = useState(params.get('sport_name') ? '__other' : params.get('sport') || '')
  const [other, setOther] = useState(params.get('sport_name') || '')
  const [location, setLocation] = useState(params.get('location') || '')
  const [radius, setRadius] = useState(params.get('radius_km') || '10')
  const [sports, setSports] = useState([])
  const [rows, setRows] = useState([])
  const [pins, setPins] = useState([])
  const [selected, setSelected] = useState(null)
  const [lastPage, setLastPage] = useState(1)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [mapError, setMapError] = useState('')
  const [view, setView] = useState('map')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const center = useMemo(() => params.has('lat') && params.has('lng') ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')) } : null, [params])
  const bounds = useMemo(() => params.has('north') ? Object.fromEntries(['north', 'south', 'west', 'east'].map(key => [key, Number(params.get(key))])) : null, [params])
  const initialNear = useRef(params.get('near') === '1')
  useEffect(() => { getSports().then(({ data }) => setSports(data.sports)).catch(() => {}) }, [])
  useEffect(() => {
    setSearch(searchInUrl); setLocation(locationInUrl)
    setSport(otherInUrl ? '__other' : sportInUrl); setOther(otherInUrl)
  }, [searchInUrl, locationInUrl, sportInUrl, otherInUrl])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setSelected(null)
    api.get('/turfs?' + query, { signal: controller.signal }).then(({ data }) => { setRows(data.data); setLastPage(data.last_page) })
      .catch(e => { if (e.code !== 'ERR_CANCELED') { setRows([]); setError(e.response?.data?.message || 'Failed to load complexes.') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    const mapParams = new URLSearchParams(query); mapParams.delete('page')
    setMapError('')
    api.get('/turfs/map?' + mapParams, { signal: controller.signal }).then(({ data }) => { setPins(data.data); setTruncated(data.truncated) })
      .catch(e => { if (e.code !== 'ERR_CANCELED') { setPins([]); setMapError('Unable to load map pins. List search is still available.') } })
    return () => controller.abort()
  }, [query])
  const spatial = useCallback(values => {
    setParams(current => {
      const next = new URLSearchParams(current)
      geoKeys.forEach(key => next.delete(key)); next.delete('page'); next.delete('near')
      Object.entries(values).forEach(([key, value]) => next.set(key, String(value)))
      return next
    })
  }, [setParams])
  const locate = useCallback(async () => {
    setLocating(true); setError('')
    try { const position = await currentPosition(); spatial({ ...position, radius_km: radius }) }
    catch (e) { setError(e.message) }
    finally { setLocating(false) }
  }, [radius, spatial])
  useEffect(() => {
    if (!initialNear.current) return
    const timer = window.setTimeout(() => { initialNear.current = false; locate() }, 0)
    return () => window.clearTimeout(timer)
  }, [locate])
  return <div className="map-search-page">
    <Seo title={t('Find complexes on the map')} path="/explore" />
    <h1>{t('Find your next game nearby')}</h1><p>{t('Explore approved complexes across Bangladesh. Choose your location or search an area on the map.')}</p>
    <form className="map-search-form" onSubmit={event => {
      event.preventDefault(); const next = new URLSearchParams(params); next.delete('page')
      for (const key of ['search', 'sport', 'sport_name', 'location']) next.delete(key)
      Object.entries({ search: search.trim(), sport: sport === '__other' ? '' : sport, sport_name: sport === '__other' ? other.trim() : '', location: location.trim() }).forEach(([key, value]) => { if (value) next.set(key, value) })
      setParams(next)
    }}>
      <Input aria-label={t('Search by complex name')} placeholder={t('Search by complex name')} value={search} maxLength={255} onChange={e => setSearch(e.target.value)} />
      <Select aria-label={t('Sports')} value={sport} onChange={e => setSport(e.target.value)}><option value="">{t('All sports')}</option><option value="__other">{t('Other sport…')}</option>{sports.map(item => <option key={item.id} value={item.slug}>{t(item.name)}</option>)}</Select>
      {sport === '__other' && <Input aria-label={t('Other sport name')} placeholder={t('Enter game / sport name')} required maxLength={80} value={other} onChange={e => setOther(e.target.value)} />}
      <Input aria-label={t('Location')} placeholder={t('Location')} value={location} maxLength={255} onChange={e => setLocation(e.target.value)} /><button type="submit">{t('Search')}</button>
    </form>
    <div className="map-actions"><button type="button" onClick={locate} disabled={locating}>{t(locating ? 'Finding your location…' : 'Near me')}</button>
      <Select label={t('Search radius')} value={radius} onChange={e => { setRadius(e.target.value); if (center) spatial({ ...center, radius_km: e.target.value }) }}>{[5, 10, 25, 50, 100].map(km => <option key={km} value={km}>{t('{count} km', { count: km })}</option>)}</Select>
      <button type="button" onClick={() => spatial({})}>{t('All Bangladesh')}</button>
      <button type="button" aria-pressed={view === 'map'} onClick={() => setView(view === 'map' ? 'list' : 'map')}>{t(view === 'map' ? 'Show list only' : 'Show map')}</button><Link to="/turfs">{t('All complexes')}</Link>
    </div>
    {center && <p>{t('Sorted by approximate straight-line distance. Your location is used for this search only.')}</p>}
    {error && <Alert message={error} />}
    <div className={view === 'map' ? 'map-results-layout' : ''}>
      <div className="map-panel" hidden={view !== 'map'}><ComplexMap center={center} bounds={bounds} points={pins} onArea={bounds => spatial(bounds)} onPoint={position => spatial({ ...position, radius_km: radius })} onSelect={setSelected} />
        <p className="map-help">{t('Tap a pin to view a complex. Tap elsewhere to search nearby, or move the map and choose Search this area.')}</p>
        {selected && <div className="map-selected-complex"><strong>{selected.name}</strong><p>{selected.location}</p><p>{complexRateLabel(selected)}</p><Link to={'/turfs/' + selected.id}>{t('View fields')}</Link></div>}
        {mapError && <Alert message={mapError} />}{truncated && <p>{t('Showing up to 300 pins. Zoom in and search this area for more detail.')}</p>}
      </div>
      <div className="map-results" aria-busy={loading}>
        {loading && <p role="status">{t('Loading…')}</p>}
        {!loading && !rows.length && <p>{t('No complexes found. Try adjusting your search.')}</p>}
        {rows.map(turf => <Link className="map-complex-card" to={'/turfs/' + turf.id} key={turf.id}><h2>{turf.name}</h2><p>{turf.location}</p><strong>{complexRateLabel(turf)}</strong>{turf.distance_km != null && <span>{t('{count} km away', { count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(turf.distance_km) })}</span>}<span>{t('View fields')}</span></Link>)}
        {lastPage > 1 && <div className="map-actions">{[-1, 1].map(direction => <button type="button" key={direction} disabled={loading || (direction < 0 ? page <= 1 : page >= lastPage)} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + direction)); setParams(next) }}>{t(direction < 0 ? 'Previous' : 'Next')}</button>)}</div>}
      </div>
    </div>
  </div>
}
