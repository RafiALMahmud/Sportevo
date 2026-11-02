import { useMemo, useState } from 'react'
import ComplexMap from './ComplexMap'
import { useTranslation } from '../i18n/useTranslation'

export default function LocationPicker({ latitude = '', longitude = '', onChange, disabled = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const pinned = latitude !== '' && latitude !== null && longitude !== '' && longitude !== null
  const center = useMemo(() => pinned ? { lat: Number(latitude), lng: Number(longitude) } : null, [latitude, longitude, pinned])
  const points = useMemo(() => center ? [{ id: 'pin', name: t('Your complex'), latitude: center.lat, longitude: center.lng }] : [], [center, t])
  return <div className="location-picker">
    <h3>{t('Complex map pin')}</h3><p>{t('Choose the exact entrance so customers can find your complex. Existing address search still works without a pin.')}</p>
    <input type="hidden" name="latitude" value={latitude ?? ''} /><input type="hidden" name="longitude" value={longitude ?? ''} />
    <div className="map-actions"><button type="button" disabled={disabled} onClick={() => { setOpened(true); setOpen(!open) }}>{t(open ? 'Hide map' : 'Choose on map')}</button>{pinned && <button type="button" disabled={disabled} onClick={() => onChange({ latitude: '', longitude: '' })}>{t('Clear pin')}</button>}</div>
    {pinned && <p className="map-pin-status">{t('Map pin saved in this form. Save your details to apply it.')}</p>}
    {opened && <div hidden={!open}><p>{t('Tap the map to place the pin. Drag the pin to adjust it.')}</p><div className={disabled ? 'map-disabled' : ''}><ComplexMap label="Complex location map" center={center} points={points} onPoint={point => { if (!disabled) onChange({ latitude: point.lat, longitude: point.lng }) }} /></div></div>}
    <details><summary>{t('Enter coordinates manually')}</summary><div className="coordinate-inputs">
      <label>{t('Latitude')}<input aria-label={t('Latitude')} type="number" min="-90" max="90" step="any" disabled={disabled} value={latitude ?? ''} onChange={e => onChange({ latitude: e.target.value, longitude })} /></label>
      <label>{t('Longitude')}<input aria-label={t('Longitude')} type="number" min="-180" max="180" step="any" disabled={disabled} value={longitude ?? ''} onChange={e => onChange({ latitude, longitude: e.target.value })} /></label>
    </div></details>
  </div>
}
