import { useTranslation } from '../i18n/useTranslation'
import { useEffect, useId, useRef, useState } from 'react'

function Preview({ file }) {
  const image = useRef(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={image} alt={file.name} className="h-24 w-full rounded-lg object-cover" />
}

export default function PhotoPicker({ files, onChange, disabled = false, remaining = 24, label = 'Field photos (optional)' }) {
  const { t } = useTranslation()
  const id = useId()
  const input = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => { if (!files.length && input.current) input.current.value = '' }, [files])
  const select = (event) => {
    const selected = Array.from(event.target.files || [])
    const limit = Math.min(8, remaining)
    let message = ''
    if (selected.length > limit) message = `Select up to ${limit} photos. A field can have 24 photos in total.`
    else if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) message = 'Choose JPG, PNG or WebP images. Convert HEIC images to JPG first.'
    else if (selected.some((file) => file.size > 5 * 1024 * 1024)) message = 'Each photo must be 5 MB or smaller.'
    else if (selected.reduce((bytes, file) => bytes + file.size, 0) > 32 * 1024 * 1024) message = 'Select at most 32 MB of photos per upload.'
    setError(message)
    event.target.setCustomValidity(t(message))
    if (message) { event.target.value = ''; onChange([]); return }
    onChange(selected)
  }
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium text-zinc-300">{t(label)}</label>
    <input ref={input} id={id} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || remaining <= 0} onChange={select} className="w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-950 file:px-3 file:py-2 file:text-emerald-300" />
    <p id={`${id}-help`} className="text-xs text-zinc-400">{t("JPG, PNG or WebP · up to 5 MB each · 8 per upload (32 MB total) · 24 per field.")}</p>
    {remaining <= 0 && <p className="text-xs text-amber-300">{t("Delete an existing photo to add another.")}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-rose-300">{t(error)}</p>}
    {!!files.length && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{files.map((file, index) => <div key={`${file.name}-${index}`}><Preview file={file} /><p className="truncate text-xs text-zinc-400">{file.name}</p></div>)}</div>}
    {(!!files.length || !!error) && <button type="button" disabled={disabled} onClick={() => { onChange([]); setError(''); input.current.setCustomValidity('') }} className="text-sm text-zinc-400 hover:text-white">{t("Clear selected photos")}</button>}
  </div>
}
