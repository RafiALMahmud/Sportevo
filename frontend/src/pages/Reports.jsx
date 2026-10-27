import { formatNumber } from '../i18n/language'
import { useTranslation } from '../i18n/useTranslation'
import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { formError } from '../api/forms'
import Seo from '../components/Seo'
import { Alert, Button, Card, Input } from '../components/ui'

const textareaClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-zinc-100'

function AdminResponse({ report, onSave }) {
  const { t, locale } = useTranslation()
  const [status, setStatus] = useState(report.status)
  const [reply, setReply] = useState(report.admin_reply || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="mt-4 space-y-3" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await api.patch(`/admin/reports/${report.id}`, { status, admin_reply: reply }); onSave() }
    catch (err) { setError(formError(err)) } finally { setBusy(false) }
  }}>
    {error && <Alert message={error} />}
    <label className="block text-sm text-zinc-300">{t("Status")}<select className={`${textareaClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">{t("Open")}</option><option value="in_progress">{t("In progress")}</option><option value="resolved">{t("Resolved")}</option></select></label>
    <label className="block text-sm text-zinc-300">{t("Reply to reporter")}<textarea className={`${textareaClass} mt-1`} rows={3} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
    <Button loading={busy}>{t("Save response")}</Button>
  </form>
}

export default function Reports() {
  const { t, locale } = useTranslation()
  const { user } = useAuth()
  const admin = ['admin', 'superadmin'].includes(user.role)
  const [reports, setReports] = useState([])
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get(admin ? '/admin/reports' : '/reports', { params: { page } }); setReports(data.data); setLastPage(data.last_page); setError('') }
    catch (e) { setError(formError(e)) } finally { setLoading(false) }
  }, [admin, page])
  useEffect(() => { load() }, [load])
  return <div className="space-y-5">
    <Seo title={admin ? t("Issue reports") : t("Report an issue")} path="/reports" noIndex />
    <h1 className="text-2xl font-bold text-white">{admin ? t("Issue reports") : t("Report an issue to admin")}</h1>
    {error && <Alert message={error} />}{success && <Alert type="success" message={success} />}
    {!admin && <Card><form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(''); setSuccess('')
      try { const { data } = await api.post('/reports', { subject, message }); setSubject(''); setMessage(''); setSuccess(data.message); if (page !== 1) setPage(1); else await load() }
      catch (err) { setError(formError(err)) } finally { setBusy(false) }
    }}><p className="text-sm text-zinc-400">{t("Describe the problem and include a booking number if relevant. Do not include passwords or payment details.")}</p>
      <Input label={t("Subject")} required maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label className="block text-sm text-zinc-300">{t("What happened?")}<textarea required maxLength={5000} rows={5} className={`${textareaClass} mt-1`} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <Button loading={busy}>{t("Send report to admin")}</Button>
    </form></Card>}
    <h2 className="text-lg font-semibold text-white">{admin ? t("Submitted reports") : t("Your reports")}</h2>
    {loading ? <p className="text-zinc-400">{t("Loading reports…")}</p> : !reports.length ? <p className="text-zinc-400">{t("No reports yet.")}</p> : reports.map((report) => <Card key={report.id}>
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-white">#{formatNumber(report.id)} {report.subject}</h3><span className="text-sm text-emerald-400">{t(report.status)}</span></div>
      <p className="mt-1 text-xs text-zinc-400">{new Date(report.created_at).toLocaleString(locale)}{admin && ` · ${report.user?.name || 'Archived account'} (${report.user?.role?.name || 'account'})`}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-zinc-300">{report.message}</p>
      {admin ? <AdminResponse key={`${report.id}-${report.updated_at}`} report={report} onSave={load} /> : report.admin_reply && <div className="mt-4 rounded-lg bg-zinc-900 p-3"><strong className="text-white">{t("Admin response")}</strong><p className="mt-1 whitespace-pre-wrap break-words text-zinc-300">{report.admin_reply}</p></div>}
    </Card>)}
    {lastPage > 1 && <div className="flex items-center gap-3"><Button variant="secondary" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><span className="text-zinc-400">{t("Page ")}{page}{t(" of ")}{lastPage}</span><Button variant="secondary" disabled={loading || page === lastPage} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>}
  </div>
}
