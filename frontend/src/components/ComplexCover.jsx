import { useState } from 'react'

export default function ComplexCover({ src, name }) {
  const [failed, setFailed] = useState(null)
  return <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-900 to-black" data-complex-cover>
    {src && failed !== src ? <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(src)} className="absolute inset-0 h-full w-full object-cover object-center transition group-hover:brightness-110" />
      : <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/90">{name?.slice(0, 1)}</span>}
  </div>
}
