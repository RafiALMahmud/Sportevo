const allowed = new Set(['en', 'bn'])
let language = 'en'
try { const saved = localStorage.getItem('language'); if (allowed.has(saved)) language = saved } catch { /* The language switch also works without storage. */ }
const listeners = new Set()
export const getLanguage = () => language
export const getLocale = () => language === 'bn' ? 'bn-BD' : 'en-BD'
export const formatNumber = value => language === 'bn' && value !== null && value !== undefined ? String(value).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]) : value
export const subscribeLanguage = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export function setLanguage(next, persist = true) {
  if (!allowed.has(next)) return
  language = next
  document.documentElement.lang = next
  if (persist) { try { localStorage.setItem('language', next) } catch { /* Keep the in-memory selection. */ } }
  listeners.forEach(listener => listener())
}
document.documentElement.lang = language
window.addEventListener('storage', event => { if (event.key === 'language') setLanguage(allowed.has(event.newValue) ? event.newValue : 'en', false) })
