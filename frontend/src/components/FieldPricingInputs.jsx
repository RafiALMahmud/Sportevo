import { useTranslation } from '../i18n/useTranslation'
import { Input, Select } from './ui'

export default function FieldPricingInputs({ form, onChange, disabled = false }) {
  const { t } = useTranslation()
  const hourly = form.pricing_mode === 'hour'
  const key = hourly ? 'price_per_hour' : 'price_per_slot'
  return <div className="grid gap-3 sm:grid-cols-2">
    <Select label={t("Pricing basis")} aria-label={t("Pricing basis")} disabled={disabled} value={form.pricing_mode || 'slot'} onChange={event => onChange({ ...form, pricing_mode: event.target.value })}>
      <option value="slot">{t("Per slot")}</option><option value="hour">{t("Per hour")}</option>
    </Select>
    <Input label={hourly ? t("Hourly rate (BDT)") : t("Price per slot (BDT)")} aria-label={hourly ? t("Hourly rate (BDT)") : t("Price per slot (BDT)")} disabled={disabled} type="number" required min="0" max="100000" step="0.01" value={form[key] ?? ''} onChange={event => onChange({ ...form, [key]: event.target.value })} />
  </div>
}
