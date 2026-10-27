import { useTranslation } from '../i18n/useTranslation'
import { setLanguage } from '../i18n/language'

export default function LanguageToggle() {
  const { language } = useTranslation()
  const next = language === 'en' ? 'bn' : 'en'
  const label = language === 'en' ? 'বাংলা ভাষায় দেখুন' : 'Switch to English'
  return <button className="language-toggle" type="button" lang={next} aria-label={label} title={label} onClick={() => setLanguage(next)}>{language === 'en' ? 'বাংলা' : 'English'}</button>
}
