import api from './client'

let sportsRequest
let loadedAt = 0

// Public catalogue only; never cache personal data or live slot availability.
export function getSports(refresh = false) {
  if (refresh || !sportsRequest || Date.now() - loadedAt > 300000) {
    loadedAt = Date.now()
    sportsRequest = api.get('/sports').catch((error) => {
      sportsRequest = undefined
      throw error
    })
  }
  return sportsRequest
}
