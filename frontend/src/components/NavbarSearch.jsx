import { useState } from 'react'
import { useTranslation } from '../i18n/useTranslation'

export default function NavbarSearch({ initialSearch = '', onSearch, autoFocus = false }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState(initialSearch)
  return <form role="search" aria-label={t('Search complexes')} className="navbar-complex-search" onSubmit={event => { event.preventDefault(); onSearch(search.trim()) }}>
    <input type="search" aria-label={t('Search complexes by name')} placeholder={t('Search by complex name')} autoFocus={autoFocus} maxLength={255} value={search} onChange={event => setSearch(event.target.value)} />
    <button type="submit">{t('Search')}</button>
  </form>
}
