import { getLocale } from '../i18n/language'

const formats = Object.fromEntries(['en-BD', 'bn-BD'].map(locale => [locale, new Intl.NumberFormat(locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})]))

export const money = (value) => '\u09f3' + formats[getLocale()].format(Number(value || 0))
