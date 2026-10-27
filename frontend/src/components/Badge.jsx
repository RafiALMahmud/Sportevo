import { useTranslation } from '../i18n/useTranslation'
const styles = {
  available: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  unavailable: 'bg-orange-950 text-orange-300 border border-orange-800',
  pending: 'bg-amber-950 text-amber-300 border border-amber-700',
  booked: 'bg-blue-950 text-blue-300 border border-blue-800',
  rejected: 'bg-rose-950 text-rose-300 border border-rose-800',
  cancelled: 'bg-rose-950 text-rose-300 border border-rose-800',
  completed: 'bg-slate-800 text-slate-300 border border-slate-700',
  approved: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  in_process: 'bg-amber-950 text-amber-300 border border-amber-700',
  already_booked: 'bg-blue-950 text-blue-300 border border-blue-800',
  offline_booking: 'bg-blue-950 text-blue-300 border border-blue-800',
  awaiting_payment: 'bg-amber-950 text-amber-300 border border-amber-700',
  submitted: 'bg-blue-950 text-blue-300 border border-blue-800',
  confirmed: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  expired: 'bg-rose-950 text-rose-300 border border-rose-800',
}

export default function Badge({ status }) {
  const { t } = useTranslation()
  const normalized = status?.toLowerCase()
  const labelMap = {
    available: 'Available',
    offline_booking: 'Already booked (offline)',
    unavailable: 'Unavailable',
    pending: 'Awaiting Approval',
    booked: 'Booked',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    completed: 'Completed',
    approved: 'Approved',
    in_process: 'In process', already_booked: 'Already booked', awaiting_acceptance: 'Awaiting owner acceptance',
    awaiting_payment: 'Awaiting advance', submitted: 'Payment under review', confirmed: 'Advance confirmed',
    expired: 'Payment expired', waived: 'Advance waived',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[normalized] || 'border border-zinc-700 bg-zinc-800 text-zinc-300'}`}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {t(labelMap[normalized] || status)}
    </span>
  )
}
