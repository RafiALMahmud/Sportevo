import { money } from './money'
import { translate } from '../i18n/translate'

export const fieldRate = field => field?.pricing_mode === 'hour' ? field.price_per_hour : field?.price_per_slot
export const fieldRateLabel = field => `${money(fieldRate(field))} / ${translate(field?.pricing_mode === 'hour' ? 'hour' : 'slot')}`
export function complexRateLabel(turf) {
  const fields = turf.fields || []
  if (!fields.length) return `${money(turf.price_per_slot)}+ / ${translate('slot')}`
  const modes = new Set(fields.map(field => field.pricing_mode || 'slot'))
  if (modes.size > 1) return translate('Prices vary by field')
  return `${money(Math.min(...fields.map(field => Number(fieldRate(field)))))}+ / ${translate(fields[0].pricing_mode === 'hour' ? 'hour' : 'slot')}`
}
