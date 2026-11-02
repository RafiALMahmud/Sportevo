import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from '../i18n/useTranslation'

const bdBounds = [[20.3, 88], [26.7, 92.8]]
const noPoints = []
export default function ComplexMap({ points = noPoints, center, bounds, onPoint, onArea, onSelect, label = 'Sports complexes map' }) {
  const { t } = useTranslation()
  const host = useRef(null)
  const callbacks = useRef(null)
  useEffect(() => { callbacks.current = { onPoint, onArea, onSelect } }, [onPoint, onArea, onSelect])
  const [engine, setEngine] = useState(null)
  const [error, setError] = useState('')
  const [tilesFailed, setTilesFailed] = useState(false)
  const draggable = !!onPoint && !onSelect
  useEffect(() => {
    let active = true, instance, observer
    import('leaflet').then(module => {
      if (!active || !host.current) return
      const L = module.default || module
      instance = L.map(host.current, { center: [23.7, 90.3], zoom: 7, minZoom: 5, maxZoom: 19,
        scrollWheelZoom: false, maxBounds: [[19.5, 87], [27.5, 94]], maxBoundsViscosity: 0.8 })
      instance.fitBounds(bdBounds)
      const tiles = L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, keepBuffer: 1, updateWhenIdle: true,
        attribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(instance)
      let failures = 0
      tiles.on('tileerror', () => { if (active && ++failures >= 4) setTilesFailed(true) })
      tiles.on('tileload', () => { failures = 0; if (active) setTilesFailed(false) })
      instance.on('click', event => callbacks.current.onPoint?.({ lat: event.latlng.lat, lng: event.latlng.lng }))
      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
      observer.observe(host.current)
      setEngine({ L, map: instance })
    }).catch(() => { if (active) setError('Unable to load the map. You can still use the list.') })
    return () => { active = false; observer?.disconnect(); instance?.remove() }
  }, [])
  useEffect(() => { if (engine && center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) engine.map.setView([center.lat, center.lng], 12) }, [engine, center])
  useEffect(() => { if (engine && bounds) engine.map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]]) }, [engine, bounds])
  useEffect(() => {
    if (!engine) return
    const { L, map } = engine
    const icon = L.divIcon({ className: 'sportevo-map-marker', html: '<span></span>', iconSize: [28, 36], iconAnchor: [14, 34] })
    const markers = points.filter(point => point.latitude !== null && point.longitude !== null && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))).map(point => {
      const marker = L.marker([Number(point.latitude), Number(point.longitude)], { icon, title: point.name || t('Selected location'), draggable }).addTo(map)
      marker.on('click', () => callbacks.current.onSelect?.(point))
      marker.on('dragend', () => { const point = marker.getLatLng(); callbacks.current.onPoint?.({ lat: point.lat, lng: point.lng }) })
      return marker
    })
    return () => markers.forEach(marker => marker.remove())
  }, [engine, points, draggable, t])
  return <div className="map-shell">
    {error ? <p className="map-error" role="status">{t(error)}</p> : <><div ref={host} className="complex-map" role="region" aria-label={t(label)} />{!engine && <p className="map-loading" role="status">{t('Loading map…')}</p>}
      {onArea && engine && <button type="button" className="map-area-button" onClick={() => {
        const bounds = engine.map.getBounds()
        callbacks.current.onArea?.({ north: bounds.getNorth(), south: bounds.getSouth(), west: bounds.getWest(), east: bounds.getEast() })
      }}>{t('Search this area')}</button>}</>}
    {tilesFailed && <p className="map-tile-status" role="status">{t('Map tiles are unavailable. You can still select pins or use the list.')}</p>}
  </div>
}
