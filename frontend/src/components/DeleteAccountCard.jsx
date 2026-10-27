import { useTranslation } from '../i18n/useTranslation'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, Card } from './ui'

/**
 * Self-service account removal, available to every authenticated user.
 */
export default function DeleteAccountCard() {
  const { t } = useTranslation()
  const { deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Remove your account and revoke sign-in access? Historical bookings and activity will be retained. This cannot be undone.'
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      await deleteAccount()
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not delete your account.')
      setBusy(false)
    }
  }

  return (
    <Card className="border border-rose-900/60 bg-rose-950/20">
      <h2 className="text-lg font-semibold text-white">{t("Danger zone")}</h2>
      <p className="mt-1 text-sm text-zinc-500">{t("Remove your account and revoke sign-in access. You will be signed out immediately. Historical bookings and activity are retained.")}</p>
      {error && (
        <p className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}
      <div className="mt-4">
        <Button variant="danger" loading={busy} onClick={handleDelete}>{t("Delete my account")}</Button>
      </div>
    </Card>
  )
}
