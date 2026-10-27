import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { formError } from '../api/forms'
import { money } from '../utils/money'
import { useTranslation } from '../i18n/useTranslation'
import { Alert, Button, Input } from './ui'
import Badge from './Badge'

export default function BookingAdvancePanel({ booking, manager = false, onChange }) {
  const { t, locale } = useTranslation()
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (booking.advance_status !== 'awaiting_payment' || !booking.advance_due_at) return
    const check = () => setNow(Date.now())
    const timer = setTimeout(check, Math.max(0, new Date(booking.advance_due_at).getTime() - Date.now()))
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check)
    return () => { clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [booking.advance_status, booking.advance_due_at])
  if ((!booking.advance_required && booking.advance_status !== 'waived') || booking.status === 'rejected') return null
  const due = booking.advance_due_at ? new Date(booking.advance_due_at) : null
  const elapsed = due && due.getTime() <= now
  const waiting = booking.status === 'booked' && booking.advance_status === 'awaiting_payment'
  const review = booking.status === 'booked' && booking.advance_status === 'submitted'
  const cancellationPending = booking.cancellation_request?.owner_status === 'pending'
  const act = async (action, payload) => {
    setBusy(true); setError(''); setMessage('')
    try { const { data } = await api.post(`/bookings/${booking.id}/advance/${action}`, payload); setMessage(data.message); setReference(''); await onChange?.() }
    catch (err) { setError(formError(err)); await onChange?.() }
    finally { setBusy(false) }
  }
  return <div className="booking-advance space-y-3 rounded-lg border border-emerald-800 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{t('Advance payment')}: {money(booking.advance_amount)}</strong><Badge status={booking.advance_status} /></div>
    {booking.status === 'pending' && booking.advance_status === 'awaiting_acceptance' && <p>{t('Wait for the owner to accept your request before paying. Your payment deadline starts after acceptance.')}</p>}
    {(waiting || review) && <>
      <p>{t('Payment service')}: <strong>{booking.payment_provider}</strong></p><p className="break-all">{t('Receiving payment number')}: <strong className="select-all">{booking.payment_number}</strong></p>
      {due && <p>{t('Payment deadline')}: <strong>{due.toLocaleString(locale)}</strong></p>}
      {review ? <p className="text-emerald-300">{t('Reference submitted on time. Your slot stays reserved while the owner verifies receipt.')}</p> : elapsed ? <p className="text-rose-300">{t('The payment deadline has passed. Do not send a new payment; this hold will be released.')}</p> : <p>{t('Pay the owner directly, then submit your transaction ID or reference before the deadline. A reference is checked manually by the owner.')}</p>}
      {!!booking.payment_reference && <p className="break-all">{t('Payment reference')}: <strong>{booking.payment_reference}</strong></p>}
      {!!booking.payment_note && <p className="break-words text-amber-300">{t('Owner note')}: {booking.payment_note}</p>}
    </>}
    {!manager && waiting && !elapsed && <form className="space-y-3" onSubmit={event => { event.preventDefault(); act('reference', { reference: reference.trim() }) }}>
      <Input label={t('Transaction ID or reference name')} required minLength={2} maxLength={160} disabled={busy} value={reference} onChange={event => setReference(event.target.value)} />
      <Button type="submit" loading={busy}>{t('Submit payment reference')}</Button>
    </form>}
    {!manager && (waiting || review) && (booking.turf?.phone || booking.turf?.email) && <p>{t('You can also contact the owner after paying')}: <a className="text-emerald-400 underline" href={booking.turf.phone ? `tel:${booking.turf.phone.replace(/[^+0-9]/g, '')}` : `mailto:${booking.turf.email}`}>{booking.turf.phone || booking.turf.email}</a></p>}
    {manager && cancellationPending && <p>{t('Decide the pending cancellation before checking this payment.')} <Link className="underline" to="/dashboard">{t('Manage on dashboard')}</Link></p>}
    {manager && !cancellationPending && (review || (waiting && !elapsed)) && <div className="space-y-3">
      <p className="text-zinc-400">{t('Verify the money reached your account. You may confirm a payment reported by phone without a submitted reference.')}</p>
      <Input label={t('Owner note / rejection reason')} maxLength={500} disabled={busy} value={note} onChange={event => setNote(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => { if (confirm(t('Have you checked and received this advance payment?'))) act('confirm', { note: note.trim() || null }) }}>{t('Confirm payment received')}</Button>
        {review && <Button variant="danger" disabled={busy} onClick={() => { if (note.trim().length < 2) { setError('Enter a reason before rejecting this reference.'); return } if (confirm(t('Reject this payment reference? If its original deadline has passed, the slot will be released.'))) act('reject', { reason: note.trim() }) }}>{t('Reject payment reference')}</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => { if (confirm(t('Waive the advance and confirm this booking without collecting it?'))) act('waive', {}) }}>{t('Waive advance')}</Button>
      </div>
    </div>}
    {booking.advance_status === 'confirmed' && <p className="text-emerald-300">{t('The owner confirmed receipt of your advance. Remaining balance')}: {money(Math.max(0, Number(booking.price) - Number(booking.advance_amount)))}</p>}
    {booking.advance_status === 'waived' && <p>{t('The advance was waived. No advance receipt is recorded.')}</p>}
    {booking.advance_status === 'expired' && <p>{t('No payment reference was submitted before the deadline. This booking was cancelled and its slot released.')}</p>}
    {booking.status === 'cancelled' && ['confirmed', 'submitted', 'cancelled'].includes(booking.advance_status) && <p>{t('Arrange any refund of money already paid directly with the owner. Platform commission reversal does not refund your transfer.')}</p>}
    {error && <Alert message={error} />}{message && <Alert type="success" message={message} />}
  </div>
}
