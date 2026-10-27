import { useTranslation } from '../i18n/useTranslation'
import { Input, Select } from './ui'

const providers = ['bKash', 'Nagad', 'Rocket']
export default function AdvancePaymentInputs({ form, onChange, disabled = false }) {
  const { t } = useTranslation()
  const update = (key, value) => onChange({ ...form, [key]: value })
  const provider = providers.includes(form.payment_provider) ? form.payment_provider : '__other'
  return <div className="advance-settings-inputs space-y-3">
    <h3 className="font-semibold">{t('Advance payment')}</h3>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={!!form.advance_enabled} disabled={disabled} onChange={event => update('advance_enabled', event.target.checked)} />{t('Require an advance after accepting a request')}</label>
    <div className="grid gap-3 sm:grid-cols-2">
      <Select label={t('Payment service')} value={provider} disabled={disabled} onChange={event => update('payment_provider', event.target.value === '__other' ? '' : event.target.value)}>
        {providers.map(name => <option key={name} value={name}>{name}</option>)}<option value="__other">{t('Other payment service')}</option>
      </Select>
      <Input label={t('Receiving payment number')} type="tel" autoComplete="off" required minLength={7} maxLength={40} placeholder="01XXXXXXXXX" value={form.payment_number ?? ''} disabled={disabled} onChange={event => update('payment_number', event.target.value)} />
    </div>
    {provider === '__other' && <Input label={t('Payment service name')} required maxLength={80} value={form.payment_provider ?? ''} disabled={disabled} placeholder={t('Enter the payment service name')} onChange={event => update('payment_provider', event.target.value)} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label={t('Advance amount (BDT)')} type="number" min="0.01" max="100000" step="0.01" required disabled={disabled} value={form.advance_amount} onChange={event => update('advance_amount', event.target.value)} />
      <Input label={t('Payment deadline (minutes)')} type="number" min="30" max="10080" step="1" required disabled={disabled} value={form.advance_window_minutes} onChange={event => update('advance_window_minutes', event.target.value)} />
    </div>
    <p className="text-xs text-zinc-400">{t('Default: ৳500 within 60 minutes after acceptance. Choose 30 minutes to 7 days. The advance never exceeds the booking total.')}</p>
  </div>
}
