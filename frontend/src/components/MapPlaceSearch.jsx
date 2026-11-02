import { useEffect, useId, useRef, useState } from 'react'
import api from '../api/client'
import { useTranslation } from '../i18n/useTranslation'

export default function MapPlaceSearch({ onSelect, disabled = false }) {
  const { t } = useTranslation()
  const id = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  async function search() {
    if (disabled || loading || query.trim().length < 3) return
    const controller = new AbortController()
    request.current?.abort(); request.current = controller
    setLoading(true); setResults([]); setMessage('')
    try {
      const { data } = await api.get('/locations/search', { params: { q: query.trim() }, signal: controller.signal })
      if (!controller.signal.aborted) {
        setResults(data.data)
        setMessage(data.data.length ? 'Choose a result to move the map.' : 'No places found. Try another name or choose a point on the map.')
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.response?.status === 429
        ? 'Place search is busy. Please try again in a few seconds.'
        : 'Place search is unavailable. You can still choose a point on the map.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  return <div className="map-place-search" role="search" aria-label={t('Search on map')}>
    <label htmlFor={id}>{t('Search on map')}</label>
    <div className="map-place-search-row">
      <input id={id} type="search" autoComplete="off" maxLength={200} disabled={disabled}
        placeholder={t('Search an area or place in Bangladesh')} value={query}
        onChange={event => { request.current?.abort(); setLoading(false); setQuery(event.target.value); setResults([]); setMessage('') }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); search() } }} />
      <button type="button" disabled={disabled || loading || query.trim().length < 3} onClick={search}>{t(loading ? 'Searching places...' : 'Find place')}</button>
    </div>
    {message && <p role="status">{t(message)}</p>}
    {results.length > 0 && <ul aria-label={t('Places found')}>{results.map((place, index) => <li key={index}>
      <button type="button" disabled={disabled} onClick={() => {
        onSelect(place); setQuery(place.name); setResults([]); setMessage('Map moved to the selected place. Adjust the pin or map if needed.')
      }}>{place.name}</button>
    </li>)}</ul>}
    <small>{t('Place search:')} <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></small>
  </div>
}
