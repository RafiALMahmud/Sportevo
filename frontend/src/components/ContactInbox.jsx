import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { formError } from '../api/forms'
import { Alert, Button, Card } from './ui'

export default function ContactInbox({ onChange }) {
  const { t, locale } = useTranslation()
  const [filter, setFilter] = useState({ status: '', page: 1 })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async signal => {
    try { const response = await api.get('/admin/contact-messages', { params: filter, signal }); setData(response.data); setError('') }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(formError(err)) }
  }, [filter])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); const timer = window.setInterval(() => { if (!document.hidden) load(controller.signal) }, 30000); return () => { controller.abort(); window.clearInterval(timer) } }, [load])
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-white">{t("Contact inbox")}</h2><label className="text-sm text-zinc-300">{t("Show ")}<select className="rounded-lg border border-zinc-700 bg-zinc-950 p-2" value={filter.status} onChange={event => { setData(null); setFilter({ status: event.target.value, page: 1 }) }}><option value="">{t("All messages")}</option><option value="new">{t("New")}</option><option value="in_progress">{t("In progress")}</option><option value="resolved">{t("Resolved")}</option></select></label></div>
    {error && <Alert message={error} />}
    {!data ? <p className="text-zinc-400">{t("Loading messages...")}</p> : !data.data.length ? <p className="text-zinc-400">{t("No contact messages here yet.")}</p> : data.data.map(message => <Card key={message.id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-white">#{formatNumber(message.id)} {message.subject}</h3><span className="text-sm capitalize text-emerald-400">{t(message.type)} &middot; {t(message.status)}</span></div>
      <p className="text-sm text-zinc-400">{message.name} &middot; <a className="text-emerald-400 underline" href={`mailto:${message.email}?subject=${encodeURIComponent('Re: ' + message.subject)}`}>{message.email}</a> &middot; {new Date(message.created_at).toLocaleString(locale)}</p>
      <p className="whitespace-pre-wrap break-words text-zinc-200">{message.message}</p>
      <label className="block text-sm text-zinc-300">{t("Message status ")}<select aria-label={t("Status for message {value0}", { value0: message.id })} className="rounded-lg border border-zinc-700 bg-zinc-950 p-2" value={message.status} disabled={busy === message.id} onChange={async event => {
        setBusy(message.id); setError('')
        try { await api.patch(`/admin/contact-messages/${message.id}`, { status: event.target.value }); await load(); onChange() }
        catch (err) { setError(formError(err)) } finally { setBusy(null) }
      }}><option value="new">{t("New")}</option><option value="in_progress">{t("In progress")}</option><option value="resolved">{t("Resolved")}</option></select></label>
    </Card>)}
    {data?.last_page > 1 && <div className="flex items-center gap-3"><Button variant="secondary" disabled={filter.page <= 1} onClick={() => { setData(null); setFilter({ ...filter, page: filter.page - 1 }) }}>{t("Previous")}</Button><span className="text-zinc-400">{t("Page ")}{filter.page}{t(" of ")}{formatNumber(data.last_page)}</span><Button variant="secondary" disabled={filter.page >= data.last_page} onClick={() => { setData(null); setFilter({ ...filter, page: filter.page + 1 }) }}>{t("Next")}</Button></div>}
  </div>
}
