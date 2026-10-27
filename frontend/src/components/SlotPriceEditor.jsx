import { useState } from 'react'
import { useTranslation } from '../i18n/useTranslation'
import { money } from '../utils/money'
import { Button, Input, Select } from './ui'

export default function SlotPriceEditor({ slot, field, busy, onSave }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(slot.slot_pricing_mode || field.pricing_mode || 'slot')
  const [rate, setRate] = useState(slot.slot_rate ?? (field.pricing_mode === 'hour' ? field.price_per_hour : field.price_per_slot) ?? '')
  const duration = (new Date(slot.end_time) - new Date(slot.start_time)) / 3600000
  const total = mode === 'hour' ? Number(rate || 0) * duration : Number(rate || 0)
  return <form className="space-y-3 border-y border-emerald-800/50 py-4" onSubmit={event => { event.preventDefault(); onSave({ pricing_mode: mode, rate }) }}>
    <h3 className="font-semibold">{t('Edit this slot price')}</h3>
    <Select label={t('Slot pricing basis')} disabled={busy} value={mode} onChange={event => setMode(event.target.value)}><option value="slot">{t('Per slot')}</option><option value="hour">{t('Per hour')}</option></Select>
    <Input label={mode === 'hour' ? t('Slot hourly rate (BDT)') : t('Slot price (BDT)')} type="number" required min="0" max="100000" step="0.01" disabled={busy} value={rate} onChange={event => setRate(event.target.value)} />
    <p>{t('Total for this slot')}: <strong>{money(total)}</strong></p>
    <p>{t('Only this available slot changes. Requested and accepted bookings keep their agreed prices.')}</p>
    <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy}>{t('Save slot price')}</Button>{slot.slot_rate != null && <Button type="button" variant="secondary" disabled={busy} onClick={() => onSave({ use_field_price: true })}>{t('Use regular field rate')}</Button>}</div>
  </form>
}
