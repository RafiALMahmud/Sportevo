import { formatNumber } from '../../i18n/language'
import { useTranslation } from '../../i18n/useTranslation'
import { AdvancePaymentAdminTools } from '../../components/AdvancePaymentSettings'
import { bookingDisplayStatus, isOfflineBooking } from '../../utils/bookingStatus'
import { money } from '../../utils/money'
import { fieldRateLabel } from '../../utils/fieldPricing'
import ContactInbox from '../../components/ContactInbox'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import Badge from '../../components/Badge'
import StatCard from '../../components/StatCard'
import Spinner from '../../components/Spinner'
import Seo from '../../components/Seo'
import WorkflowPanel from '../../components/WorkflowPanel'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { Alert, Button, Card, Input, Select } from '../../components/ui'


function formatDateTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(dt) {
  return new Date(dt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const emptyUserForm = { name: '', email: '', phone: '', password: '', role: 'user' }

export default function PlatformDashboard() {
  const { t } = useTranslation()
  const [me] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null
    } catch {
      return null
    }
  })
  const isSuperAdmin = me?.role === 'superadmin'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'messages' ? 'messages' : 'overview')

  // --- All booking requests (platform-wide) ---
  const [slots, setSlots] = useState({ data: [], meta: null })
  const [slotFilters, setSlotFilters] = useState({ status: 'pending', search: '', date: '' })
  const [slotPage, setSlotPage] = useState(1)
  const [busySlot, setBusySlot] = useState(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [bookingContext, setBookingContext] = useState(null)
  const [busyDeletion, setBusyDeletion] = useState(null)

  // --- Users & owners ---
  const [users, setUsers] = useState({ data: [], meta: null })
  const [userFilters, setUserFilters] = useState({ role: '', search: '' })
  const [userPage, setUserPage] = useState(1)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [creatingUser, setCreatingUser] = useState(false)
  const [userFormError, setUserFormError] = useState('')

  // --- Turfs: commission + wallet ---
  const [turfs, setTurfs] = useState({ data: [], meta: null })
  const [turfFilters, setTurfFilters] = useState({ status: '', search: '' })
  const [turfPage, setTurfPage] = useState(1)
  const [commissionEdit, setCommissionEdit] = useState({})
  const [walletFor, setWalletFor] = useState(null)
  const [walletData, setWalletData] = useState(null)
  const [settleAmount, setSettleAmount] = useState('')
  const settledSlotFilters = useDebouncedValue(slotFilters)
  const settledUserFilters = useDebouncedValue(userFilters)
  const settledTurfFilters = useDebouncedValue(turfFilters)

  const flash = (text) => {
    setMessage(text)
    setError('')
    setActionError('')
  }

  const fail = (err, fallback) => {
    setMessage('')
    setActionError(err?.response?.data?.message || fallback)
  }

  const loadDashboard = useCallback(() => {
    setLoading(true)
    api
      .get('/dashboard/platform')
      .then(({ data: payload }) => setData(payload))
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false))
  }, [])
  const refreshSummary = useCallback(() => {
    api.get('/dashboard/platform').then(({ data: payload }) => setData(payload)).catch(() => setActionError('Could not refresh platform totals.'))
  }, [])
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) { setClockNow(Date.now()); refreshSummary() } }, 30000); return () => window.clearInterval(timer) }, [refreshSummary])

  const loadSlots = useCallback((signal) => {
    api
      .get('/admin/slots', {
        signal,
        params: {
          page: slotPage,
          per_page: 25,
          ...(settledSlotFilters.status ? { status: settledSlotFilters.status } : {}),
          ...(settledSlotFilters.search ? { search: settledSlotFilters.search } : {}),
          ...(settledSlotFilters.date ? { date: settledSlotFilters.date } : {}),
          ...(settledSlotFilters.turf_id ? { turf_id: settledSlotFilters.turf_id } : {}),
          ...(settledSlotFilters.field_id ? { field_id: settledSlotFilters.field_id } : {}),
        },
      })
      .then(({ data: payload }) => setSlots(payload))
      .catch((err) => err.code !== 'ERR_CANCELED' && fail(err, 'Failed to load requests.'))
  }, [settledSlotFilters, slotPage])

  const loadUsers = useCallback((signal) => {
    api
      .get('/admin/users', {
        signal,
        params: {
          page: userPage,
          per_page: 20,
          ...(settledUserFilters.role ? { role: settledUserFilters.role } : {}),
          ...(settledUserFilters.search ? { search: settledUserFilters.search } : {}),
        },
      })
      .then(({ data: payload }) => setUsers(payload))
      .catch((err) => err.code !== 'ERR_CANCELED' && fail(err, 'Failed to load users.'))
  }, [settledUserFilters, userPage])

  const loadTurfs = useCallback((signal) => {
    api
      .get('/admin/turfs', {
        signal,
        params: {
          page: turfPage,
          per_page: 20,
          ...(settledTurfFilters.status ? { status: settledTurfFilters.status } : {}),
          ...(settledTurfFilters.search ? { search: settledTurfFilters.search } : {}),
        },
      })
      .then(({ data: payload }) => setTurfs(payload))
      .catch((err) => err.code !== 'ERR_CANCELED' && fail(err, 'Failed to load complexes.'))
  }, [settledTurfFilters, turfPage])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (activeTab !== 'requests' || settledSlotFilters !== slotFilters) return
    const controller = new AbortController()
    loadSlots(controller.signal)
    return () => controller.abort()
  }, [activeTab, loadSlots, settledSlotFilters, slotFilters])

  useEffect(() => {
    if (activeTab !== 'users') return
    const controller = new AbortController()
    loadUsers(controller.signal)
    return () => controller.abort()
  }, [activeTab, loadUsers])

  useEffect(() => {
    if (activeTab !== 'turfs') return
    const controller = new AbortController()
    loadTurfs(controller.signal)
    return () => controller.abort()
  }, [activeTab, loadTurfs])

  // --- Turf approvals ---
  const approve = async (id) => {
    try {
      const { data: res } = await api.post(`/admin/turfs/${id}/approve`)
      flash(res.message)
      loadDashboard()
      if (activeTab === 'turfs') loadTurfs()
    } catch (err) {
      fail(err, 'Failed to approve complex.')
    }
  }

  const deleteTurf = async (id) => {
    if (!confirm(t("Delete this complex and all its fields? It will be removed from listings. Booking, photo and wallet history will be retained. Pending or accepted bookings must be resolved first."))) return
    setBusyDeletion(`complex-${id}`)
    try {
      const { data: res } = await api.delete(`/admin/turfs/${id}`)
      flash(res.message)
      refreshSummary()
      if (activeTab === 'turfs') loadTurfs()
    } catch (err) {
      fail(err, 'Failed to delete complex.')
    } finally {
      setBusyDeletion(null)
    }
  }

  const deleteField = async (turf, field) => {
    if (!confirm(t("Delete {value0} from {value1}? It will no longer be bookable. Booking and photo history will be retained. Pending or accepted bookings must be resolved first.", { value0: field.name, value1: turf.name }))) return
    setBusyDeletion(`field-${field.id}`)
    try {
      const { data: res } = await api.delete(`/admin/turfs/${turf.id}/fields/${field.id}`)
      flash(res.message)
      loadTurfs()
      refreshSummary()
    } catch (err) {
      fail(err, 'Failed to delete field.')
    } finally {
      setBusyDeletion(null)
    }
  }

  const showBookings = (turf, field = null) => {
    setSlots({ data: [] })
    setSlotFilters({ status: '', search: '', date: '', turf_id: turf.id, field_id: field?.id || '' })
    setBookingContext({ name: turf.name, field: field?.name })
    setSlotPage(1)
    setActiveTab('requests')
  }

  // --- Platform-wide request decisions ---
  const decideSlot = async (bookingId, decision) => {
    setBusySlot(bookingId)
    try {
      const { data: res } = await api.post(`/admin/slots/${bookingId}/${decision}`)
      flash(res.message)
      loadSlots()
      loadDashboard()
    } catch (err) {
      fail(err, `Failed to ${decision} request.`)
    } finally {
      setBusySlot(null)
    }
  }

  // --- User / owner management ---
  const createUser = async (e) => {
    e.preventDefault()
    setUserFormError('')
    setCreatingUser(true)
    try {
      const { data: res } = await api.post('/admin/users', userForm)
      flash(res.message)
      setUserForm(emptyUserForm)
      setShowCreateUser(false)
      loadUsers()
      loadDashboard()
    } catch (err) {
      const errors = err.response?.data?.errors
      setUserFormError(err.response?.data?.message || (errors ? Object.values(errors).flat()[0] : 'Could not create user.'))
    } finally {
      setCreatingUser(false)
    }
  }

  const deleteUser = async (user) => {
    const ownsComplex = user.turf_count > 0
    if (!confirm(t("Delete {value0} ({value1}){value2}? The account will lose access. Booking, photo and wallet history will be retained.{value3}", { value0: user.name, value1: user.email, value2: ownsComplex ? t(' and their complex and fields') : '', value3: ownsComplex ? t(' Pending or accepted bookings must be resolved first.') : '' }))) return
    setBusyDeletion(`user-${user.id}`)
    try {
      const { data: res } = await api.delete(`/admin/users/${user.id}`, { data: { delete_complexes: ownsComplex } })
      flash(res.message)
      loadUsers()
      refreshSummary()
    } catch (err) {
      fail(err, 'Failed to delete user.')
    } finally {
      setBusyDeletion(null)
    }
  }

  const changeRole = async (user, role) => {
    try {
      await api.post(`/admin/users/${user.id}/role`, { role })
      flash(`${user.name} is now ${role}.`)
      loadUsers()
    } catch (err) {
      fail(err, 'Failed to change role.')
    }
  }

  // --- Commission & wallet ---
  const saveCommission = async (turf) => {
    const value = commissionEdit[turf.id]
    if (value === undefined) return
    try {
      const { data: res } = await api.put(`/admin/turfs/${turf.id}/commission`, {
        commission_rate: Number(value),
      })
      flash(res.message)
      setCommissionEdit((prev) => ({ ...prev, [turf.id]: undefined }))
      loadTurfs()
      loadDashboard()
    } catch (err) {
      fail(err, 'Failed to update commission.')
    }
  }

  const openWallet = async (turf, page = 1) => {
    setWalletFor(turf)
    setWalletData(null)
    setSettleAmount('')
    try {
      const { data: res } = await api.get(`/admin/turfs/${turf.id}/wallet`, { params: { page } })
      setWalletData(res)
    } catch (err) {
      fail(err, 'Failed to load wallet.')
    }
  }

  const settleWallet = async (e) => {
    e.preventDefault()
    try {
      const { data: res } = await api.post(`/admin/turfs/${walletFor.id}/wallet/settlements`, {
        amount: Number(settleAmount),
        note: 'Settlement recorded by platform admin',
      })
      flash(res.message)
      setSettleAmount('')
      const { data: fresh } = await api.get(`/admin/turfs/${walletFor.id}/wallet`)
      setWalletData(fresh)
      loadTurfs()
      loadDashboard()
    } catch (err) {
      fail(err, 'Failed to record settlement.')
    }
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error && !data) {
    return <Alert type="error" message={error} />
  }

  const tabs = [
    { key: 'messages', label: `Contact inbox (${data.newContactMessages || 0} new)` },
    { key: 'overview', label: 'Overview' },
    { key: 'operations', label: 'Cancellations & History' },
    { key: 'requests', label: 'All Requests' },
    { key: 'users', label: 'Users & Owners' },
    { key: 'turfs', label: 'Complexes & Commission' },
    { key: 'approvals', label: `Approvals (${data.pendingApprovals.length})` },
  ]

  const renderPager = (meta, onPage) =>
    meta && meta.last_page > 1 ? (
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
        <span>{t("Page ")}{formatNumber(meta.current_page)}{t(" of ")}{formatNumber(meta.last_page)} · {formatNumber(meta.total)}{t(" total")}</span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>{t("Previous")}</Button>
          <Button
            variant="secondary"
            disabled={meta.current_page >= meta.last_page}
            onClick={() => onPage(meta.current_page + 1)}
          >{t("Next")}</Button>
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-8 animate-fade-up">
      <Seo title={t("Platform Dashboard")} description={t("Platform overview for admins.")} path="/dashboard/platform" noIndex />
      <Link to="/reports" className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">{t("View issue reports")}</Link>
      <div>
        <h1 className="text-2xl font-bold text-white">{t("Platform Control")}</h1>
        <p className="mt-1 text-zinc-500">
          {isSuperAdmin ? t("Superadmin") : t("Admin")}{t(" — oversee every request, account and complex.")}</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {actionError && <Alert type="error" message={actionError} />}
      {error && data && <Alert type="error" message={error} />}
      {data.newContactMessages > 0 && <button type="button" className="w-full rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-left text-sm text-emerald-300" onClick={() => setActiveTab('messages')}>{formatNumber(data.newContactMessages)}{t(" new contact message")}{data.newContactMessages === 1 ? '' : t("s")}{t(" awaiting your attention. Open inbox →")}</button>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("Total Users")} value={data.stats.totalUsers} accent="blue" />
        <StatCard label={t("Total Complexes")} value={data.stats.totalTurfs} accent="emerald" />
        <StatCard label={t("Pending Requests")} value={data.stats.pendingRequests} accent="amber" />
        <StatCard label={t("Outstanding Wallet")} value={money(data.walletOutstanding)} accent="rose" />
      </div>

      <div className="border-b border-zinc-800">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-b-2 border-emerald-500 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'operations' && <WorkflowPanel admin onChange={refreshSummary} />}
      {activeTab === 'messages' && <ContactInbox onChange={refreshSummary} />}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">{t("Booking Status Distribution")}</h2>
            <Card className="space-y-2">
              {Object.entries(data.bookingsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge status={status} />
                    <span className="text-sm capitalize text-zinc-400">{t(status)}</span>
                  </div>
                  <span className="font-semibold text-white">{formatNumber(count)}</span>
                </div>
              ))}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">{t("Recent Registrations")}</h2>
            <div className="space-y-2">
              {data.recentRegistrations.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{u.name}</div>
                    <div className="text-xs text-zinc-500">
                      {u.email} · {t(u.role?.name)}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-600">{formatDate(u.created_at)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">{t("Recent Bookings")}</h2>
            <div className="space-y-2">
              {data.recentBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{b.turf?.name} · {b.field?.name}</div>
                    <div className="text-xs text-zinc-500">
                      {b.user?.name} · {formatDate(b.start_time)}
                    </div>
                  </div>
                  <Badge status={b.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-4">
          <Card>
            {bookingContext && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300"><span>{t("Bookings for ")}{bookingContext.name}{bookingContext.field ? ` · ${bookingContext.field}` : ''}</span><Button variant="secondary" onClick={() => { setBookingContext(null); setSlotFilters({ status: '', search: '', date: '' }); setSlotPage(1) }}>{t("Clear complex filter")}</Button></div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Select
                label={t("Status")}
                value={slotFilters.status}
                onChange={(e) => {
                  setSlotFilters((f) => ({ ...f, status: e.target.value }))
                  setSlotPage(1)
                }}
              >
                <option value="">{t("All statuses")}</option>
                {['pending', 'booked', 'rejected', 'cancelled', 'completed', 'available', 'unavailable'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Input
                label={t("Search")}
                placeholder={t("Complex or customer")}
                value={slotFilters.search}
                onChange={(e) => {
                  setSlotFilters((f) => ({ ...f, search: e.target.value }))
                  setSlotPage(1)
                }}
              />
              <Input
                label={t("Date")}
                type="date"
                value={slotFilters.date}
                onChange={(e) => {
                  setSlotFilters((f) => ({ ...f, date: e.target.value }))
                  setSlotPage(1)
                }}
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setSlotFilters({ status: '', search: '', date: '' })
                    setBookingContext(null)
                    setSlotPage(1)
                  }}
                >{t("Clear")}</Button>
              </div>
            </div>
          </Card>

          {slots.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">{t("No requests match these filters.")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {slots.data.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">
                      {formatTime(b.start_time)} – {formatTime(b.end_time)} · {formatDate(b.start_time)}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      <span className="font-medium text-zinc-200">{b.turf?.name} · {b.field?.name}</span>
                      {b.user ? (
                        <>
                          {' · '}
                          {b.user.name} · {b.user.email} · {b.user.phone}
                        </>
                      ) : (
                        <span className="text-zinc-600"> · {isOfflineBooking(b) ? t("Already booked (offline)") : b.status === 'unavailable' ? t("owner block") : t("open slot")}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {b.status === 'unavailable' && !isOfflineBooking(b) ? t("Owner blocked slot") : t("Price ") + money(b.price)}
                      {b.status === 'booked' || b.status === 'completed'
                        ? t(" · commission {value0} ({value1}%)", { value0: money(b.commission_amount), value1: Number(b.commission_rate || 0).toFixed(2) })
                        : ''}
                    </div>
                    {b.status === 'unavailable' && <p className="mt-1 text-xs text-orange-300">{t("Reason: ")}{b.unavailable_reason || t("Not supplied")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge status={bookingDisplayStatus(b)} />
                    {b.status === 'pending' && (
                      <>
                        <Button
                          className="!px-3 !py-1.5 text-xs"
                          loading={busySlot === b.id}
                          onClick={() => decideSlot(b.id, 'accept')}
                        >{t("Accept")}</Button>
                        <Button
                          variant="secondary"
                          className="!px-3 !py-1.5 text-xs"
                          disabled={busySlot === b.id}
                          onClick={() => decideSlot(b.id, 'reject')}
                        >{t("Reject")}</Button>
                      </>
                    )}
                    {b.status === 'booked' && (!b.advance_required || b.advance_status === 'confirmed') && new Date(b.end_time).getTime() <= clockNow && <Button loading={busySlot === b.id} onClick={() => decideSlot(b.id, 'complete')}>{t("Mark completed")}</Button>}
                    {b.status === 'booked' && new Date(b.start_time).getTime() > clockNow && <Button variant="secondary" loading={busySlot === b.id} onClick={() => decideSlot(b.id, 'cancel')}>{t("Request cancellation")}</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(slots, setSlotPage)}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label={t("Role")}
                value={userFilters.role}
                onChange={(e) => {
                  setUserFilters((f) => ({ ...f, role: e.target.value }))
                  setUserPage(1)
                }}
              >
                <option value="">{t("All roles")}</option>
                {['user', 'turf', 'admin', 'superadmin'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Input
                label={t("Search")}
                placeholder={t("Name, email or phone")}
                value={userFilters.search}
                onChange={(e) => {
                  setUserFilters((f) => ({ ...f, search: e.target.value }))
                  setUserPage(1)
                }}
              />
              <div className="flex items-end">
                <Button className="w-full" onClick={() => setShowCreateUser((v) => !v)}>
                  {showCreateUser ? t("Close") : t("Add user / owner")}
                </Button>
              </div>
            </div>
          </Card>

          {showCreateUser && (
            <form onSubmit={createUser} className="space-y-4">
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-white">{t("Create account")}</h2>
                {userFormError && <Alert type="error" message={userFormError} />}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    label={t("Full name")}
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    required
                  />
                  <Input
                    label={t("Email")}
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    required
                  />
                  <Input
                    label={t("Phone")}
                    type="tel"
                    required={['user', 'turf'].includes(userForm.role)}
                    minLength={7}
                    maxLength={20}
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                  <Input
                    label={t("Password")}
                    type="password"
                    minLength={6}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required
                  />
                  <Select
                    label={t("Role")}
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="user">{t("User (books slots)")}</option>
                    <option value="turf">{t("Complex owner")}</option>
                    <option value="admin">{t("Admin")}</option>
                    {isSuperAdmin && <option value="superadmin">{t("Superadmin")}</option>}
                  </Select>
                </div>
                <div className="mt-4">
                  <Button type="submit" loading={creatingUser}>{t("Create account")}</Button>
                </div>
              </Card>
            </form>
          )}

          {users.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">{t("No accounts match these filters.")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {users.data.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">
                      {u.name}
                      {u.id === me?.id && <span className="ml-2 text-xs text-emerald-400">{t("(you)")}</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ''}
                      {u.turf_count > 0 ? t(" · owns {value0} complex(es)", { value0: u.turf_count }) : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
                      {t(u.role?.name)}
                    </span>
                    <Select
                      aria-label={t("Role for {value0}", { value0: u.name })}
                      value={u.role?.name || 'user'}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={
                        u.id === me?.id ||
                        (!isSuperAdmin && (u.role?.name === 'superadmin' || u.role?.name === 'admin'))
                      }
                      className="!w-auto !py-1 text-xs"
                    >
                      {[...new Set([u.role?.name, ...(isSuperAdmin ? ['superadmin'] : []), 'user', 'turf', 'admin'])].map(
                        (r) => (
                          <option key={r} value={r}>
                            {t(r)}
                          </option>
                        )
                      )}
                    </Select>
                    {u.turf_count > 0 && <Button variant="secondary" onClick={() => { setTurfFilters({ status: '', search: u.email }); setTurfPage(1); setActiveTab('turfs') }}>{t("Manage complex")}</Button>}
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-xs"
                      disabled={
                        !!busyDeletion || u.role?.name === 'superadmin' ||
                        u.id === me?.id ||
                        (!isSuperAdmin && (u.role?.name === 'superadmin' || u.role?.name === 'admin'))
                      }
                      onClick={() => deleteUser(u)}
                    >
                      {busyDeletion === `user-${u.id}` ? t("Deleting...") : u.turf_count > 0 ? t("Delete owner & complex") : t("Delete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(users, setUserPage)}
        </div>
      )}

      {activeTab === 'turfs' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label={t("Approval")}
                value={turfFilters.status}
                onChange={(e) => {
                  setTurfFilters((f) => ({ ...f, status: e.target.value }))
                  setTurfPage(1)
                }}
              >
                <option value="">{t("All")}</option>
                <option value="approved">{t("Approved")}</option>
                <option value="pending">{t("Pending")}</option>
                <option value="archived">{t("Archived")}</option>
              </Select>
              <Input
                label={t("Search")}
                placeholder={t("Complex, location or owner")}
                value={turfFilters.search}
                onChange={(e) => {
                  setTurfFilters((f) => ({ ...f, search: e.target.value }))
                  setTurfPage(1)
                }}
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setTurfFilters({ status: '', search: '' })
                    setTurfPage(1)
                  }}
                >{t("Clear")}</Button>
              </div>
            </div>
          </Card>

          {turfs.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">{t("No complexes match these filters.")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {turfs.data.map((complex) => (
                <div
                  key={complex.id}
                  className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{complex.name}</span>
                      <Badge status={complex.deleted_at ? 'cancelled' : complex.is_approved ? 'approved' : 'pending'} />
                      {complex.deleted_at && <span className="text-xs text-zinc-500">{t("Archived")}</span>}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {complex.location}{t(" · owner ")}{complex.manager?.name} ({complex.manager?.email})
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{t("Fields: ")}<span className="font-medium text-zinc-300">{complex.fields?.filter(f => !f.deleted_at).map((f) => f.name + ' ' + fieldRateLabel(f)).join(' · ') || t("No active fields")}</span>{t(" · owes platform")}{' '}
                      <span className="font-medium text-amber-300">{money(complex.wallet_balance)}</span>
                    </div>
                    {complex.active_bookings_count > 0 && <p className="mt-2 text-xs text-amber-300">{formatNumber(complex.active_bookings_count)}{t(" pending or accepted booking(s). Resolve these before deleting the complex.")}</p>}
                    {!complex.deleted_at && <AdvancePaymentAdminTools turfId={complex.id} />}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-emerald-400">{t("Manage fields (")}{complex.deleted_at ? 0 : complex.fields_count ?? complex.fields?.filter(f => !f.deleted_at).length ?? 0}{t(" active)")}</summary>
                      <div className="mt-2 space-y-2">
                        {!complex.fields?.length && <p className="text-sm text-zinc-500">{t("No fields registered.")}</p>}
                        {complex.fields?.map(field => <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 p-3">
                          <div className="min-w-0"><p className="break-words text-sm text-zinc-200">{field.name} · {fieldRateLabel(field)}{(field.deleted_at || complex.deleted_at) && <span className="ml-2 text-xs text-zinc-500">{t("Deleted")}</span>}</p><p className="text-xs text-zinc-500">{field.sports?.map(s => s.name).join(', ')}{field.active_bookings_count > 0 ? t(" · {value0} active booking(s)", { value0: field.active_bookings_count }) : ''}</p></div>
                          {!complex.deleted_at && !field.deleted_at && <div className="flex flex-wrap gap-2">{field.active_bookings_count > 0 && <Button variant="secondary" onClick={() => showBookings(complex, field)}>{t("Resolve bookings")}</Button>}<Button variant="danger" disabled={!!busyDeletion} aria-label={t("Delete field {value0}", { value0: field.name })} onClick={() => deleteField(complex, field)}>{busyDeletion === `field-${field.id}` ? t("Deleting...") : t("Delete field")}</Button></div>}
                        </div>)}
                      </div>
                    </details>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-40">
                      <Input
                        label={t("Commission %")}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={commissionEdit[complex.id] ?? complex.commission_rate}
                        onChange={(e) =>
                          setCommissionEdit((prev) => ({ ...prev, [complex.id]: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => saveCommission(complex)}
                      disabled={!!complex.deleted_at || commissionEdit[complex.id] === undefined || commissionEdit[complex.id] === ''}
                    >{t("Set")}</Button>
                    <Button variant="secondary" onClick={() => openWallet(complex)}>{t("Wallet")}</Button>
                    {complex.active_bookings_count > 0 && <Button variant="secondary" onClick={() => showBookings(complex)}>{t("Resolve bookings")}</Button>}
                    {!complex.deleted_at && !complex.is_approved && (
                      <Button className="!px-3 !py-2 text-xs" onClick={() => approve(complex.id)}>{t("Approve")}</Button>
                    )}
                    <Button disabled={!!complex.deleted_at || !!busyDeletion} variant="danger" className="!px-3 !py-2 text-xs" onClick={() => deleteTurf(complex.id)}>
                      {busyDeletion === `complex-${complex.id}` ? t("Deleting...") : t("Delete complex")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(turfs, setTurfPage)}
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="space-y-3">
          {data.pendingApprovals.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">{t("No pending complex registrations.")}</p>
            </Card>
          ) : (
            data.pendingApprovals.map((complex) => (
              <div
                key={complex.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-lg font-semibold text-white">{complex.name}</div>
                  <div className="text-sm text-zinc-500">{complex.location}</div>
                  <div className="mt-1 text-sm text-zinc-500">{t("Owner: ")}<span className="font-medium text-zinc-300">{complex.manager?.name}</span> · {complex.manager?.email}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">{t("Registered ")}{formatDateTime(complex.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approve(complex.id)}>{t("Approve")}</Button>
                  <Button variant="danger" disabled={!!busyDeletion} onClick={() => deleteTurf(complex.id)}>{t("Delete complex")}</Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {walletFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setWalletFor(null)}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{walletFor.name}</h2>
                  <p className="text-sm text-zinc-500">{t("Commission wallet")}</p>
                </div>
                <Button variant="ghost" onClick={() => setWalletFor(null)}>{t("Close")}</Button>
              </div>

              {!walletData ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
                    <div className="text-xs text-zinc-400">{t("Outstanding to SportEvo")}</div>
                    <div className="text-3xl font-bold text-amber-300">{money(walletData.balance)}</div>
                  </div>

                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                    {walletData.entries.data.length === 0 ? (
                      <p className="py-4 text-center text-sm text-zinc-500">{t("No wallet activity yet.")}</p>
                    ) : (
                      walletData.entries.data.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm"
                        >
                          <div>
                            <div className={entry.type === 'commission_charge' ? 'text-amber-300' : 'text-emerald-300'}>
                              {entry.type === 'commission_charge' ? t("Commission charge") : t("Settlement")}
                            </div>
                            <div className="text-xs text-zinc-600">{formatDateTime(entry.created_at)}</div>
                          </div>
                          <div className="font-semibold text-white">{money(entry.amount)}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {renderPager(walletData.entries, (page) => openWallet(walletFor, page))}
                  {walletData.refunds?.map((refund) => <p key={refund.id} className="mt-2 text-sm text-emerald-300">{t("Commission reversal · booking #")}{refund.booking_id} · {money(refund.amount)}</p>)}
                  {walletData.balance > 0 && (
                    <form onSubmit={settleWallet} className="mt-4 flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          label={t("Record settlement amount (BDT)")}
                          type="number"
                          min="0.01"
                          max={walletData.balance}
                          step="0.01"
                          value={settleAmount}
                          onChange={(e) => setSettleAmount(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" disabled={!settleAmount}>{t("Settle")}</Button>
                    </form>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
