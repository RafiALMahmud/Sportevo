import { useCallback, useEffect, useState } from 'react'
import api from '../../api/client'
import Badge from '../../components/Badge'
import StatCard from '../../components/StatCard'
import Spinner from '../../components/Spinner'
import { Alert, Button, Card, Input, Select } from '../../components/ui'

const money = (value) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(value || 0))

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
  const [activeTab, setActiveTab] = useState('overview')

  // --- All booking requests (platform-wide) ---
  const [slots, setSlots] = useState({ data: [], meta: null })
  const [slotFilters, setSlotFilters] = useState({ status: 'pending', search: '', date: '' })
  const [slotPage, setSlotPage] = useState(1)
  const [busySlot, setBusySlot] = useState(null)

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

  const loadSlots = useCallback(() => {
    api
      .get('/admin/slots', {
        params: {
          page: slotPage,
          per_page: 25,
          ...(slotFilters.status ? { status: slotFilters.status } : {}),
          ...(slotFilters.search ? { search: slotFilters.search } : {}),
          ...(slotFilters.date ? { date: slotFilters.date } : {}),
        },
      })
      .then(({ data: payload }) => setSlots(payload))
      .catch((err) => fail(err, 'Failed to load requests.'))
  }, [slotFilters, slotPage])

  const loadUsers = useCallback(() => {
    api
      .get('/admin/users', {
        params: {
          page: userPage,
          per_page: 20,
          ...(userFilters.role ? { role: userFilters.role } : {}),
          ...(userFilters.search ? { search: userFilters.search } : {}),
        },
      })
      .then(({ data: payload }) => setUsers(payload))
      .catch((err) => fail(err, 'Failed to load users.'))
  }, [userFilters, userPage])

  const loadTurfs = useCallback(() => {
    api
      .get('/admin/turfs', {
        params: {
          page: turfPage,
          per_page: 20,
          ...(turfFilters.status ? { status: turfFilters.status } : {}),
          ...(turfFilters.search ? { search: turfFilters.search } : {}),
        },
      })
      .then(({ data: payload }) => setTurfs(payload))
      .catch((err) => fail(err, 'Failed to load complexes.'))
  }, [turfFilters, turfPage])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (activeTab === 'requests') loadSlots()
  }, [activeTab, loadSlots])

  useEffect(() => {
    if (activeTab === 'users') loadUsers()
  }, [activeTab, loadUsers])

  useEffect(() => {
    if (activeTab === 'turfs') loadTurfs()
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
    if (!confirm('Delete this complex and all of its bookings?')) return
    try {
      const { data: res } = await api.delete(`/admin/turfs/${id}`)
      flash(res.message)
      loadDashboard()
      if (activeTab === 'turfs') loadTurfs()
    } catch (err) {
      fail(err, 'Failed to delete complex.')
    }
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
    if (!confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return
    try {
      const { data: res } = await api.delete(`/admin/users/${user.id}`)
      flash(res.message)
      loadUsers()
      loadDashboard()
    } catch (err) {
      fail(err, 'Failed to delete user.')
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

  const openWallet = async (turf) => {
    setWalletFor(turf)
    setWalletData(null)
    setSettleAmount('')
    try {
      const { data: res } = await api.get(`/admin/turfs/${turf.id}/wallet`)
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

  if (loading) {
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
    { key: 'overview', label: 'Overview' },
    { key: 'requests', label: 'All Requests' },
    { key: 'users', label: 'Users & Owners' },
    { key: 'turfs', label: 'Complexes & Commission' },
    { key: 'approvals', label: `Approvals (${data.pendingApprovals.length})` },
  ]

  const renderPager = (meta, onPage) =>
    meta && meta.last_page > 1 ? (
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
        <span>
          Page {meta.current} of {meta.last_page} · {meta.total} total
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={meta.current <= 1} onClick={() => onPage(meta.current - 1)}>
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={meta.current >= meta.last_page}
            onClick={() => onPage(meta.current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Control</h1>
        <p className="mt-1 text-zinc-500">
          {isSuperAdmin ? 'Superadmin' : 'Admin'} — oversee every request, account and complex.
        </p>
      </div>

      {message && <Alert type="success" message={message} />}
      {actionError && <Alert type="error" message={actionError} />}
      {error && data && <Alert type="error" message={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Users" value={data.stats.totalUsers} accent="blue" />
        <StatCard label="Total Complexes" value={data.stats.totalTurfs} accent="emerald" />
        <StatCard label="Pending Requests" value={data.stats.pendingRequests} accent="amber" />
        <StatCard label="Outstanding Wallet" value={money(data.walletOutstanding)} accent="rose" />
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
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">Booking Status Distribution</h2>
            <Card className="space-y-2">
              {Object.entries(data.bookingsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge status={status} />
                    <span className="text-sm capitalize text-zinc-400">{status}</span>
                  </div>
                  <span className="font-semibold text-white">{count}</span>
                </div>
              ))}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">Recent Registrations</h2>
            <div className="space-y-2">
              {data.recentRegistrations.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{u.name}</div>
                    <div className="text-xs text-zinc-500">
                      {u.email} · {u.role?.name}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-600">{formatDate(u.created_at)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">Recent Bookings</h2>
            <div className="space-y-2">
              {data.recentBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{b.turf?.name}</div>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Select
                label="Status"
                value={slotFilters.status}
                onChange={(e) => {
                  setSlotFilters((f) => ({ ...f, status: e.target.value }))
                  setSlotPage(1)
                }}
              >
                <option value="">All statuses</option>
                {['pending', 'booked', 'rejected', 'cancelled', 'completed', 'available'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Input
                label="Search"
                placeholder="Complex or customer"
                value={slotFilters.search}
                onChange={(e) => {
                  setSlotFilters((f) => ({ ...f, search: e.target.value }))
                  setSlotPage(1)
                }}
              />
              <Input
                label="Date"
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
                    setSlotPage(1)
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          {slots.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No requests match these filters.</p>
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
                      <span className="font-medium text-zinc-200">{b.turf?.name}</span>
                      {b.user ? (
                        <>
                          {' · '}
                          {b.user.name} · {b.user.email} · {b.user.phone}
                        </>
                      ) : (
                        <span className="text-zinc-600"> · open slot</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Price {money(b.price)}
                      {b.status === 'booked' || b.status === 'completed'
                        ? ` · commission ${money(b.commission_amount)} (${Number(b.commission_rate || 0).toFixed(2)}%)`
                        : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge status={b.status} />
                    {b.status === 'pending' && (
                      <>
                        <Button
                          className="!px-3 !py-1.5 text-xs"
                          loading={busySlot === b.id}
                          onClick={() => decideSlot(b.id, 'accept')}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="secondary"
                          className="!px-3 !py-1.5 text-xs"
                          disabled={busySlot === b.id}
                          onClick={() => decideSlot(b.id, 'reject')}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(slots.meta, setSlotPage)}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Role"
                value={userFilters.role}
                onChange={(e) => {
                  setUserFilters((f) => ({ ...f, role: e.target.value }))
                  setUserPage(1)
                }}
              >
                <option value="">All roles</option>
                {['user', 'turf', 'admin', 'superadmin'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Input
                label="Search"
                placeholder="Name, email or phone"
                value={userFilters.search}
                onChange={(e) => {
                  setUserFilters((f) => ({ ...f, search: e.target.value }))
                  setUserPage(1)
                }}
              />
              <div className="flex items-end">
                <Button className="w-full" onClick={() => setShowCreateUser((v) => !v)}>
                  {showCreateUser ? 'Close' : 'Add user / owner'}
                </Button>
              </div>
            </div>
          </Card>

          {showCreateUser && (
            <form onSubmit={createUser} className="space-y-4">
              <Card>
                <h2 className="mb-4 text-lg font-semibold text-white">Create account</h2>
                {userFormError && <Alert type="error" message={userFormError} />}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    label="Full name"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    required
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    required
                  />
                  <Input
                    label="Phone"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                  <Input
                    label="Password"
                    type="password"
                    minLength={6}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required
                  />
                  <Select
                    label="Role"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="user">User (books slots)</option>
                    <option value="turf">Complex owner</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="superadmin">Superadmin</option>}
                  </Select>
                </div>
                <div className="mt-4">
                  <Button type="submit" loading={creatingUser}>
                    Create account
                  </Button>
                </div>
              </Card>
            </form>
          )}

          {users.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No accounts match these filters.</p>
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
                      {u.id === me?.id && <span className="ml-2 text-xs text-emerald-400">(you)</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ''}
                      {u.turf_count > 0 ? ` · owns ${u.turf_count} complex(es)` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
                      {u.role?.name}
                    </span>
                    <Select
                      aria-label={`Role for ${u.name}`}
                      value={u.role?.name || 'user'}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={u.id === me?.id || (!isSuperAdmin && u.role?.name === 'superadmin')}
                      className="!w-auto !py-1 text-xs"
                    >
                      {[...new Set([u.role?.name, ...(isSuperAdmin ? ['superadmin'] : []), 'user', 'turf', 'admin'])].map(
                        (r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        )
                      )}
                    </Select>
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-xs"
                      disabled={u.id === me?.id || (!isSuperAdmin && u.role?.name === 'superadmin')}
                      onClick={() => deleteUser(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(users.meta, setUserPage)}
        </div>
      )}

      {activeTab === 'turfs' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Approval"
                value={turfFilters.status}
                onChange={(e) => {
                  setTurfFilters((f) => ({ ...f, status: e.target.value }))
                  setTurfPage(1)
                }}
              >
                <option value="">All</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
              </Select>
              <Input
                label="Search"
                placeholder="Complex, location or owner"
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
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          {turfs.data.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No complexes match these filters.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {turfs.data.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{t.name}</span>
                      <Badge status={t.is_approved ? 'approved' : 'pending'} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {t.location} · owner {t.manager?.name} ({t.manager?.email})
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Slot price <span className="font-medium text-zinc-300">{money(t.price_per_slot)}</span> ·
                      owes platform{' '}
                      <span className="font-medium text-amber-300">{money(t.wallet_balance)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-40">
                      <Input
                        label="Commission %"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={commissionEdit[t.id] ?? t.commission_rate}
                        onChange={(e) =>
                          setCommissionEdit((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => saveCommission(t)}
                      disabled={commissionEdit[t.id] === undefined || commissionEdit[t.id] === ''}
                    >
                      Set
                    </Button>
                    <Button variant="secondary" onClick={() => openWallet(t)}>
                      Wallet
                    </Button>
                    {!t.is_approved && (
                      <Button className="!px-3 !py-2 text-xs" onClick={() => approve(t.id)}>
                        Approve
                      </Button>
                    )}
                    <Button variant="danger" className="!px-3 !py-2 text-xs" onClick={() => deleteTurf(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {renderPager(turfs.meta, setTurfPage)}
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="space-y-3">
          {data.pendingApprovals.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-zinc-500">No pending complex registrations.</p>
            </Card>
          ) : (
            data.pendingApprovals.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-lg font-semibold text-white">{t.name}</div>
                  <div className="text-sm text-zinc-500">{t.location}</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    Owner: <span className="font-medium text-zinc-300">{t.manager?.name}</span> · {t.manager?.email}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Registered {formatDateTime(t.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approve(t.id)}>Approve</Button>
                  <Button variant="danger" onClick={() => deleteTurf(t.id)}>
                    Delete
                  </Button>
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
                  <p className="text-sm text-zinc-500">Commission wallet</p>
                </div>
                <Button variant="ghost" onClick={() => setWalletFor(null)}>
                  Close
                </Button>
              </div>

              {!walletData ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
                    <div className="text-xs text-zinc-400">Outstanding to Sports Evo</div>
                    <div className="text-3xl font-bold text-amber-300">{money(walletData.balance)}</div>
                  </div>

                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                    {walletData.entries.data.length === 0 ? (
                      <p className="py-4 text-center text-sm text-zinc-500">No wallet activity yet.</p>
                    ) : (
                      walletData.entries.data.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm"
                        >
                          <div>
                            <div className={entry.type === 'commission_charge' ? 'text-amber-300' : 'text-emerald-300'}>
                              {entry.type === 'commission_charge' ? 'Commission charge' : 'Settlement'}
                            </div>
                            <div className="text-xs text-zinc-600">{formatDateTime(entry.created_at)}</div>
                          </div>
                          <div className="font-semibold text-white">{money(entry.amount)}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {walletData.balance > 0 && (
                    <form onSubmit={settleWallet} className="mt-4 flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          label="Record settlement amount"
                          type="number"
                          min="0.01"
                          max={walletData.balance}
                          step="0.01"
                          value={settleAmount}
                          onChange={(e) => setSettleAmount(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" disabled={!settleAmount}>
                        Settle
                      </Button>
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
