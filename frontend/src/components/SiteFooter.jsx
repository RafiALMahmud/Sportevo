import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import { Link } from 'react-router-dom'
import BrandLogo from './BrandLogo'

export default function SiteFooter() {
  const { t } = useTranslation()
  return <footer className="sport-footer"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="sport-footer-top"><div><Link to="/" aria-label={t("SportEvo homepage")} className="inline-flex items-center gap-3"><BrandLogo /><span className="sport-wordmark">Sport<span>Evo</span></span></Link><p>{t("A place for every game.")}<br />{t("Find your field. Bring your team.")}</p></div><nav aria-label={t("Footer")}><Link to="/turfs">{t("All complexes")}</Link><Link to="/register">{t("Join SportEvo")}</Link><a href="/#contact">{t("Contact us")}</a></nav></div><div className="sport-footer-bottom"><span>&copy; {formatNumber(new Date().getFullYear())}{t(" SportEvo. All rights reserved.")}</span><span>{t("MADE FOR THE LOVE OF THE GAME.")}</span></div></div></footer>
}
