import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import { money } from '../utils/money'
import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { Alert, Button, Card, Input } from './ui'

export default function WorkflowPanel({ admin = false, onChange }) {
  const { t, locale } = useTranslation()
  const sections = admin ? ['cancellations', 'deletions', 'reviews', 'activity', 'emails'] : ['cancellations', 'reviews']
  const [section, setSection] = useState('cancellations')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const path = section === 'reviews' ? '/reviews' : section === 'deletions' ? '/admin/deletion-requests' : section === 'activity' ? '/admin/activity' : section === 'emails' ? '/admin/emails' : admin ? '/admin/cancellations' : '/cancellations'
  const load = useCallback(async (signal) => {
    try { const { data } = await api.get(path, { params: { page, search: section === 'activity' ? search : undefined }, signal }); setResult(data) }
    catch (e) { if (e.code !== 'ERR_CANCELED') setError(e.response?.data?.message || 'Unable to load records.') }
  }, [path, page, search, section])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const act = async (method, url, payload) => {
    setBusy(true); setError(''); setMessage('')
    try { const { data } = await api[method](url, payload); setMessage(data.message || 'Saved.'); await load(); onChange?.() }
    catch (e) { setError(e.response?.data?.message || 'Unable to save decision.') }
    finally { setBusy(false) }
  }
  const decisions = (url, approveLabel = 'Accept', rejectLabel = 'Reject') => <div className="mt-3 flex flex-wrap gap-2">
    <Button disabled={busy} onClick={() => act('post', url, { decision: 'accepted' })}>{approveLabel}</Button>
    <Button disabled={busy} variant="danger" onClick={() => act('post', url, { decision: 'rejected' })}>{rejectLabel}</Button>
  </div>
  const download = async () => {
    try {
      const { data } = await api.get('/admin/activity/download', { responseType: 'blob', params: { search } })
      const url = URL.createObjectURL(data); const link = document.createElement('a')
      link.href = url; link.download = 'sportevo-activity.txt'; link.click(); URL.revokeObjectURL(url)
    } catch { setError('Could not download activity history.') }
  }
  return <Card>
    <h2 className="mb-3 text-lg font-semibold text-white">{admin ? t("Approvals, moderation & history") : t("Cancellation requests & review moderation")}</h2>
    <div className="mb-4 flex flex-wrap gap-2">{sections.map((key) => <Button key={key} disabled={busy} variant={section === key ? 'primary' : 'secondary'} onClick={() => { setSection(key); setResult(null); setPage(1); setError(''); setMessage('') }}>{key}</Button>)}</div>
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
    {section === 'cancellations' && <p className="my-3 text-sm text-zinc-400">{t("Accepted bookings stay reserved until the owner accepts cancellation. Only then can an admin reverse the platform commission. This does not process customer payments.")}</p>}
    {section === 'activity' && <div className="my-3 flex gap-2"><Input aria-label={t("Search activity")} placeholder={t("Search name, email or action")} value={search} onChange={(e) => { setSearch(e.target.value); setResult(null); setPage(1) }} /><Button onClick={download}>{t("Download .txt")}</Button></div>}
    {section === 'emails' && <p className="my-3 text-sm text-zinc-400">{t("“Sent” means accepted by the mail server, not guaranteed inbox delivery. Failed deliveries can be retried.")}</p>}
    {!result ? <p className="py-4 text-zinc-400">{t("Loading…")}</p> : <div className="space-y-3">
      {!result.data.length && <p className="py-4 text-zinc-400">{t("No records.")}</p>}
      {result.data.map((item) => <div key={item.id} className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300">
        {section === 'cancellations' && <>
          <p className="font-semibold text-white">{t("Booking #")}{item.booking_id} · {item.booking?.turf?.name} · {item.booking?.field?.name}</p>
          <p>{new Date(item.booking?.start_time).toLocaleString(locale)} · {item.booking?.user?.name} · {item.booking?.user?.email}</p>
          <p>{t("Reason: ")}{item.reason || t("Not supplied")}</p>
          <p>{t("Owner: ")}{t(item.owner_status)}{t(" · Commission reversal: ")}{t(item.refund_status)}{t(" · Amount: ")}{money(item.booking?.commission_amount)}</p>
          {!admin && item.owner_status === 'pending' && decisions('/cancellations/' + item.id + '/decision', 'Accept cancellation', 'Keep booking')}
          {admin && item.owner_status === 'accepted' && item.refund_status === 'pending' && decisions('/admin/cancellations/' + item.id + '/refund', 'Approve commission reversal', 'Reject refund')}
        </>}
        {section === 'deletions' && <>
          <p className="font-semibold text-white">{item.turf?.name} · {item.turf?.manager?.email}</p><p>{item.reason}</p><p>{t("Status: ")}{t(item.status)}</p>
          {item.status === 'pending' && decisions('/admin/deletion-requests/' + item.id + '/decision', 'Delete complex', 'Reject deletion')}
        </>}
        {section === 'reviews' && <>
          <p className="font-semibold text-white">{item.turf?.name} · {item.user?.name} · {item.rating}/5 · {item.is_hidden ? t("Hidden") : t("Public")}</p><p className="whitespace-pre-wrap">{item.comment}</p>
          <div className="mt-3 flex gap-2"><Button disabled={busy} variant="secondary" onClick={() => act('patch', '/reviews/' + item.id, { is_hidden: !item.is_hidden })}>{item.is_hidden ? t("Show") : t("Hide")}</Button>
            <Button disabled={busy} variant="danger" onClick={() => { if (confirm(t("Permanently delete this review?"))) act('delete', '/reviews/' + item.id) }}>{t("Delete")}</Button></div>
        </>}
        {section === 'activity' && <>
          <p>{new Date(item.created_at).toLocaleString(locale)} · {item.actor_name || t("Guest/system")} · {item.actor_email}</p><p className="font-mono text-emerald-300">{item.action}</p>
          <details><summary className="cursor-pointer">{t("Details")}</summary><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(item.details, null, 2)}</pre></details>
        </>}
        {section === 'emails' && <>
          <p className="font-semibold text-white">{item.subject}</p><p>{item.recipient} · {t(item.status)} · {item.attempts}{t(" attempts")}</p>
          {item.last_error && <p className="break-words text-rose-300">{item.last_error}</p>}
          {item.status === 'failed' && <Button disabled={busy} onClick={() => act('post', '/admin/emails/' + item.id + '/retry')}>{t("Retry email")}</Button>}
        </>}
      </div>)}
      <div className="flex items-center justify-between"><Button variant="secondary" disabled={page <= 1} onClick={() => { setResult(null); setPage(page - 1) }}>{t("Previous")}</Button><span>{formatNumber(result.current_page)} / {formatNumber(result.last_page)} · {formatNumber(result.total)}{t(" records")}</span><Button variant="secondary" disabled={page >= result.last_page} onClick={() => { setResult(null); setPage(page + 1) }}>{t("Next")}</Button></div>
    </div>}
  </Card>
}
