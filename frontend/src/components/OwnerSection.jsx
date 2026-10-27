import { useTranslation } from '../i18n/useTranslation'

const shapes = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></>,
  field: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16M3 9h4v6H3m18-6h-4v6h4" /><circle cx="12" cy="12" r="3" /></>,
  price: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h10m-5 0v7m-4-4h7m-4 4h3" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
}

export function OwnerIcon({ name = 'field' }) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.field}</svg>
}

export default function OwnerSection({ title, hint, icon, children, open = false }) {
  const { t } = useTranslation()
  return <details className="owner-section" open={open || undefined}>
    <summary><span className="owner-action-icon"><OwnerIcon name={icon} /></span><span><strong>{t(title)}</strong>{hint && <small>{t(hint)}</small>}</span><span className="owner-section-chevron" aria-hidden="true">⌄</span></summary>
    <div className="owner-section-body">{children}</div>
  </details>
}
