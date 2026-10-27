import { Helmet } from 'react-helmet-async'
import { useTranslation } from '../i18n/useTranslation'
import heroImage from '../assets/brand/sportevo-logo-transparent.webp'
import touchIcon from '../assets/brand/apple-touch-icon-transparent.png'

const SITE_NAME = 'SportEvo'
const DEFAULT_TITLE = 'SportEvo — Multi-Sport Turf Booking Platform'
const DEFAULT_DESCRIPTION =
  'Browse sports complexes near you, check available time slots and book your game in seconds. Football, cricket, tennis, badminton and more.'
const DEFAULT_IMAGE = new URL(heroImage, window.location.origin).href

export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image,
  type = 'website',
  noIndex = false,
}) {
  const { t, language } = useTranslation()
  const canonical = `${window.location.origin}${path ?? window.location.pathname}`
  const fullTitle = title ? `${title} | ${SITE_NAME}` : t(DEFAULT_TITLE)
  const translatedDescription = t(description)
  const ogImage = image ? new URL(image, window.location.origin).href : DEFAULT_IMAGE

  return (
    <Helmet>
      <html lang={language} />
      <title>{fullTitle}</title>
      <meta name="description" content={translatedDescription} />
      <link rel="apple-touch-icon" href={touchIcon} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:locale" content={language === 'bn' ? 'bn_BD' : 'en_BD'} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={translatedDescription} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={translatedDescription} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  )
}
