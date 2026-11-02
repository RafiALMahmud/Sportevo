import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/dashboardPath'
import { googleClientId, loadGoogleIdentity } from '../utils/google'
import { useTranslation } from '../i18n/useTranslation'
import api from '../api/client'
import { Alert, Button, Input, Select } from './ui'

export default function GoogleSignIn({ connect = false, initialRole = 'user' }) {
  const { t, language } = useTranslation()
  const { googleLogin, googleRegister, connectGoogle, user } = useAuth()
  const navigate = useNavigate()
  const host = useRef(null)
  const latest = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registration, setRegistration] = useState(null)
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState(initialRole)
  const [retry, setRetry] = useState(0)
  useEffect(() => { latest.current = async credential => {
    setError(''); setBusy(true)
    try {
      const data = await (connect ? connectGoogle(credential) : googleLogin(credential))
      if (data.requires_registration) { setRole(initialRole); setRegistration(data) }
      else if (!connect) navigate(dashboardPath(data.user.role, data.user.needs_complex_registration), { replace: true })
    } catch (e) { setError(e.response?.data?.message || 'Google sign-in failed. Please try again.'); setRetry(value => value + 1) }
    finally { setBusy(false) }
  } })
  useEffect(() => {
    if (!googleClientId || (connect && user?.google_connected) || registration) return
    let active = true
    const controller = new AbortController()
    Promise.all([loadGoogleIdentity(), api.get('/auth/google/nonce', { signal: controller.signal })]).then(([google, response]) => {
      if (!active || !host.current) return
      google.initialize({ client_id: googleClientId, nonce: response.data.nonce, auto_select: false, ux_mode: 'popup', callback: result => { if (active) latest.current(result.credential) } })
      host.current.replaceChildren()
      google.renderButton(host.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(360, host.current.clientWidth || 280), locale: language === 'bn' ? 'bn' : 'en' })
    }).catch(e => { if (active && e.code !== 'ERR_CANCELED') setError('Google sign-in is temporarily unavailable.') })
    return () => { active = false; controller.abort() }
  }, [connect, user?.google_connected, registration, language, retry])
  if (!googleClientId) return null
  if (connect && user?.google_connected) return <p className="google-connected">{t('Google account connected.')}</p>
  return <div className="google-sign-in" aria-busy={busy}>
    {!registration && <><p className="google-sign-in-note">{t(connect ? 'Connect your matching Google account' : 'Or continue with Google')}</p><div ref={host} className={busy ? 'google-button-host google-button-busy' : 'google-button-host'} />{busy && <p role="status">{t('Signing in…')}</p>}</>}
    {error && <Alert message={error} />}
    {error && !registration && <button type="button" className="map-text-button" onClick={() => { setError(''); setRetry(value => value + 1) }}>{t('Try again')}</button>}
    {registration && <form className="google-registration" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('')
      try { const data = await googleRegister({ phone, role }); navigate(data.user.role === 'turf' ? '/dashboard/turf' : dashboardPath(data.user.role), { replace: true }) }
      catch (e) { setError(e.response?.data?.message || 'Unable to create your account.') }
      finally { setBusy(false) }
    }}>
      <h3>{t('Finish creating your account')}</h3><p>{registration.name}</p><p className="break-words">{registration.email}</p>
      <Input label={t('Phone')} type="tel" required minLength={7} maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} />
      <Select label={t('Account type')} value={role} onChange={e => setRole(e.target.value)} disabled={busy}><option value="user">{t('Customer')}</option><option value="turf">{t('Complex owner')}</option></Select>
      <Button type="submit" loading={busy}>{t('Create account')}</Button>
      <button type="button" disabled={busy} className="map-text-button" onClick={() => { setRegistration(null); setRetry(value => value + 1) }}>{t('Cancel')}</button>
    </form>}
  </div>
}
