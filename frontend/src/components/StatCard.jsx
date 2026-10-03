export default function StatCard({ label, value, icon = null, accent = 'emerald' }) {
  const accents = {
    emerald: 'bg-emerald-950 text-emerald-300 border border-emerald-900',
    blue: 'bg-blue-950 text-blue-300 border border-blue-900',
    amber: 'bg-amber-950 text-amber-300 border border-amber-900',
    rose: 'bg-rose-950 text-rose-300 border border-rose-900',
    violet: 'bg-violet-950 text-violet-300 border border-violet-900',
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        {icon && (
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${accents[accent]}`}>
            {icon}
          </div>
        )}
        <div>
          <div className="text-3xl font-bold text-white">{value}</div>
          <div className="text-sm font-medium text-zinc-500">{label}</div>
        </div>
      </div>
    </div>
  )
}