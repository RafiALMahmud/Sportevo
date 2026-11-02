export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
let identityPromise

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (!identityPromise) identityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.nonce = document.querySelector('script[nonce]')?.nonce || ''
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true
    const fail = () => { clearTimeout(timer); script.remove(); identityPromise = null; reject(new Error('Google sign-in is temporarily unavailable.')) }
    const timer = window.setTimeout(fail, 15000)
    script.onload = () => { if (!window.google?.accounts?.id) return fail(); clearTimeout(timer); resolve(window.google.accounts.id) }
    script.onerror = fail
    document.head.append(script)
  })
  return identityPromise
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable. Choose a point on the map or search by area.'))
    navigator.geolocation.getCurrentPosition(position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }), () => reject(new Error('Location could not be obtained. Allow location access or choose an area manually.')), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })
  })
}
