const styles = {
  available: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  pending: 'bg-amber-950 text-amber-300 border border-amber-700',
  booked: 'bg-blue-950 text-blue-300 border border-blue-800',
  rejected: 'bg-rose-950 text-rose-300 border border-rose-800',
  cancelled: 'bg-rose-950 text-rose-300 border border-rose-800',
  completed: 'bg-slate-800 text-slate-300 border border-slate-700',
  approved: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
}

export default function Badge({ status }) {
  const normalized = status?.toLowerCase()
  const labelMap = {
    available: 'Available',
    pending: 'Awaiting Approval',
    booked: 'Booked',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    completed: 'Completed',
    approved: 'Approved',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[normalized] || 'border border-zinc-700 bg-zinc-800 text-zinc-300'}`}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {labelMap[normalized] || status}
    </span>
  )
}