import { useTranslation } from '../i18n/useTranslation'
import { Input } from './ui'

export function FieldPlayersInput({ value, onChange, disabled = false }) {
  const { t } = useTranslation()
  return <div className="space-y-2"><Input label={t('Players per side (optional)')} type="number" min="1" max="100" step="1" disabled={disabled} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={t('For example: 5, 7 or 11')} /><p className="text-sm text-zinc-400">{t('Enter the number on one team. Leave blank if it does not apply.')}</p></div>
}

export function FieldPlayersLabel({ value }) {
  const { t } = useTranslation()
  return value == null || value === '' ? null : <p className="text-sm text-emerald-400">{t('{count} players per side', { count: Number(value) })}</p>
}
