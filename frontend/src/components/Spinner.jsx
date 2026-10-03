const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-4',
}

export default function Spinner({ size = 'md' }) {
  return (
    <div
      className={`${sizes[size]} animate-spin rounded-full border-emerald-600 border-t-transparent`}
      role="status"
    />
  )
}
