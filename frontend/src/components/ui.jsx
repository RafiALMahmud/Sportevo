export function Input({ label, error, className = '', ...props }) {
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <input
        {...props}
        className={`w-full rounded-lg border bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 shadow-sm transition placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${
          error
            ? 'border-rose-700 focus:border-rose-500 focus:ring-rose-900'
            : 'border-zinc-700/80 focus:border-emerald-500 focus:ring-emerald-900/60 hover:border-zinc-600'
        } ${className}`}
      />
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <select
        {...props}
        className={`w-full rounded-lg border bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 shadow-sm transition focus:outline-none focus:ring-2 ${
          error
            ? 'border-rose-700 focus:ring-rose-900'
            : 'border-zinc-700/80 focus:border-emerald-500 focus:ring-emerald-900/60 hover:border-zinc-600'
        } ${className}`}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

export function Button({ children, variant = 'primary', loading = false, className = '', ...props }) {
  const variants = {
    primary:
      'bg-gradient-to-r from-emerald-700 to-teal-700 text-white hover:from-emerald-600 hover:to-teal-600 focus:ring-emerald-900 btn-glow',
    secondary:
      'border border-zinc-700 bg-zinc-950/70 text-zinc-200 hover:bg-zinc-900 hover:border-zinc-500 focus:ring-zinc-800',
    danger: 'bg-rose-800 text-white hover:bg-rose-700 focus:ring-rose-900',
    ghost: 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
  }

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

export function Alert({ type = 'error', message }) {
  const styles = {
    error: 'border-rose-900 bg-rose-950/50 text-rose-300',
    success: 'border-emerald-900 bg-emerald-950/50 text-emerald-300',
    info: 'border-blue-900 bg-blue-950/50 text-blue-300',
  }
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>{message}</div>
  )
}

export function Card({ className = '', children }) {
  return <div className={`card p-5 ${className}`}>{children}</div>
}