import { useMemo, useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage } from './language'
import { translate } from './translate'

export function useTranslation() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en')
  return useMemo(() => {
    const locale = language === 'bn' ? 'bn-BD' : 'en-BD'
    const numbers = new Intl.NumberFormat(locale, { useGrouping: false })
    return { language, locale, t: (text, parameters) => translate(text, parameters, language), n: value => numbers.format(Number(value)) }
  }, [language])
}
