export function withPhotos(values, photos = []) {
  if (!photos.length) return values
  const body = new FormData()
  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => body.append(`${key}[]`, item))
    else if (value != null) body.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)
  })
  photos.forEach((photo) => body.append('photos[]', photo))
  return body
}

export function formError(error, fallback = 'Unable to save changes.') {
  if (error.response?.status === 413) return 'These photos are too large for the server. Select fewer or smaller images.'
  const errors = error.response?.data?.errors
  return errors ? Object.values(errors).flat().join(' ') : error.response?.data?.message || fallback
}
