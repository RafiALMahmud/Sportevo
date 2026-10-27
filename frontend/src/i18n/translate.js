import bn from './bn'
import { getLanguage } from './language'

const normalized = value => value.trim().replace(/\s+/g, ' ')
const lookup = new Map(Object.entries(bn).flatMap(([key, value]) => [[normalized(key).toLowerCase(), value], [normalized(key).replaceAll('_', ' ').toLowerCase(), value]]))
const numbers = { en: new Intl.NumberFormat('en-BD', { useGrouping: false }), bn: new Intl.NumberFormat('bn-BD', { useGrouping: false }) }
const patterns = Object.entries(bn).filter(([key]) => /\{\w+\}/.test(key)).map(([key, value]) => {
  const names = []
  const escaped = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, name) => { names.push(name); return '(.+?)' })
  return { regex: new RegExp(`^${escaped}$`, 'i'), names, value }
})
export function translate(text, parameters = {}, language = getLanguage()) {
  if (typeof text !== 'string') return text
  const key = normalized(text)
  let output = language === 'bn' ? lookup.get(key.toLowerCase()) : key
  let values = parameters
  if (language === 'bn' && output === undefined) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(key)
      if (match) { output = pattern.value; values = Object.fromEntries(pattern.names.map((name, index) => [name, /^(count|page|pages|total|reference|number)$/.test(name) && /^\d+$/.test(match[index + 1]) ? Number(match[index + 1]) : match[index + 1]])); break }
    }
  }
  if (output === undefined) return text
  const format = numbers[language]
  output = output.replace(/\{(\w+)\}/g, (token, name) => values[name] === undefined ? token : typeof values[name] === 'number' ? format.format(values[name]) : language === 'bn' && ['field', 'role'].includes(name) ? lookup.get(String(values[name]).toLowerCase()) ?? String(values[name]) : String(values[name]))
  return (/^\s/.test(text) ? ' ' : '') + output + (/\s$/.test(text) ? ' ' : '')
}
