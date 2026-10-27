import { useTranslation } from '../i18n/useTranslation'
import { money } from '../utils/money'
import { Button, Input, Select } from './ui'

export default function SlotGenerationForm({ field, dateLabel, timezone, form, onChange, busy, onGenerate }) {
  const { t, n } = useTranslation()
  const set = (key, value) => onChange({ ...form, [key]: value })
  const peakMode = form.peak_pricing_mode || field.pricing_mode || 'slot'
  const peakOnly = Boolean(form.peak_only)
  const peakEnabled = peakOnly || form.peak_enabled
  const quote = (mode, rate) => mode === 'hour' ? Number(rate || 0) * Number(form.slot_duration || 0) / 60 : Number(rate || 0)
  const normalQuote = quote(field.pricing_mode, field.pricing_mode === 'hour' ? field.price_per_hour : field.price_per_slot)
  const start = peakOnly ? form.peak_start : form.start_time
  const end = peakOnly ? form.peak_end : form.end_time
  const overnight = end && start && end < start
  const submit = event => {
    event.preventDefault()
    const values = { ...form, peak_only: peakOnly, peak_enabled: Boolean(peakEnabled), peak_pricing_mode: peakMode }
    if (peakOnly) { delete values.start_time; delete values.end_time }
    onGenerate(values)
  }
  return <form id="schedule-generation" className="space-y-4" onSubmit={submit}>
    <div><h2 className="font-semibold">{t('Generate slots · ')}{field.name}</h2><p className="text-sm text-zinc-400">{dateLabel} · {timezone}{t('. Existing slots will not be overwritten.')}</p></div>
    <label className="flex items-center gap-3 text-base font-semibold"><input type="checkbox" disabled={busy} checked={peakOnly} onChange={event => set('peak_only', event.target.checked)} />{t('Generate peak-hour slots only')}</label>
    {peakOnly && <p className="text-sm text-zinc-400">{t('Choose the peak start, end and rate below. Only slots within that window will be created.')}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {!peakOnly && <Input label={t('Start time')} type="time" required disabled={busy} value={form.start_time} onChange={event => set('start_time', event.target.value)} />}
      {!peakOnly && <Input label={t('End time')} type="time" required disabled={busy} value={form.end_time} onChange={event => set('end_time', event.target.value)} />}
      <Input label={t('Minutes per slot')} type="number" min="15" max="240" required disabled={busy} value={form.slot_duration} onChange={event => set('slot_duration', event.target.value)} />
    </div>
    <p className="text-sm text-zinc-400">{t('An end time earlier than the start continues into the next day. Use 00:00 for midnight.')}</p>
    {overnight && <p className="text-sm text-emerald-300">{t('Overnight schedule: ends on the following calendar day. Slots after midnight appear under that new date.')}</p>}
    {!peakOnly && <p className="text-sm text-emerald-300">{t('Regular slot total')}: {money(normalQuote)} · {t('{count} minutes', { count: n(form.slot_duration || 0) })}</p>}
    {!peakOnly && <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" disabled={busy} checked={form.peak_enabled} onChange={event => set('peak_enabled', event.target.checked)} />{t('Use peak-hour pricing')}</label>}
    {peakEnabled && <div className="space-y-3 rounded-xl border border-emerald-800/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t('Peak starts')} type="time" required disabled={busy} value={form.peak_start} onChange={event => set('peak_start', event.target.value)} />
        <Input label={t('Peak ends')} type="time" required disabled={busy} value={form.peak_end} onChange={event => set('peak_end', event.target.value)} />
        <Select label={t('Peak pricing basis')} disabled={busy} value={peakMode} onChange={event => set('peak_pricing_mode', event.target.value)}><option value="slot">{t('Per slot')}</option><option value="hour">{t('Per hour')}</option></Select>
        <Input label={peakMode === 'hour' ? t('Peak hourly rate (BDT)') : t('Peak price per slot (BDT)')} type="number" required min="0" max="100000" step="0.01" disabled={busy} value={form.peak_rate} onChange={event => set('peak_rate', event.target.value)} />
      </div>
      <p className="text-sm text-zinc-400">{t('Any slot overlapping the peak window uses the peak rate for its full duration. Peak hours may cross midnight.')}</p>
      <p className="text-sm text-emerald-300">{t('Peak slot total')}: {money(quote(peakMode, form.peak_rate))}</p>
    </div>}
    <Button type="submit" loading={busy}>{peakOnly ? t('Generate peak-hour slots') : t('Generate slots for this field')}</Button>
  </form>
}
