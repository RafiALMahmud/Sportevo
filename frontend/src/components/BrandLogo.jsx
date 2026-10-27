import { useTranslation } from '../i18n/useTranslation'
import logo from '../assets/brand/sportevo-logo-transparent.webp'

export default function BrandLogo() {
  const { t } = useTranslation()
  return <img className="sport-logo" src={logo} alt={t("SportEvo logo")} width="360" height="240" decoding="async" />
}
