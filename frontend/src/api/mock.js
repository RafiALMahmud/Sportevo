import { AxiosError } from 'axios'

const DB_KEY = 'sportevo_demo_db_v1'
const SESSION_KEY = 'sportevo_demo_session_v1'

const pad = (n) => String(n).padStart(2, '0')

function atUTC(dayOffset, hour, minute) {
  const day = new Date(Date.now() + dayOffset * 86400000)
  const ms = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0, 0)
  return new Date(ms).toISOString()
}

const todayKey = () => atUTC(0, 0, 0).slice(0, 10)

const seed = () => {
  const users = [
    { id: 1, name: 'Super Admin', email: 'superadmin@sportsevo.com', phone: '+1 555 010 0001', password: 'password', role: 'superadmin', created_at: new Date(2026, 7, 10, 9, 0).toISOString() },
    { id: 2, name: 'Admin One', email: 'admin@sportsevo.com', phone: '+1 555 010 0002', password: 'password', role: 'admin', created_at: new Date(2026, 7, 12, 10, 30).toISOString() },
    { id: 3, name: 'Turf Manager', email: 'manager@sportsevo.com', phone: '+1 555 010 0003', password: 'password', role: 'turf', created_at: new Date(2026, 7, 15, 8, 45).toISOString() },
    { id: 4, name: 'Alex Johnson', email: 'user@sportsevo.com', phone: '+1 555 010 0004', password: 'password', role: 'user', created_at: new Date(2026, 7, 18, 14, 20).toISOString() },
    { id: 5, name: 'Mia Chen', email: 'mia@sportsevo.com', phone: '+1 555 010 0005', password: 'password', role: 'user', created_at: new Date(2026, 7, 20, 11, 5).toISOString() },
    { id: 6, name: 'Rahul Verma', email: 'rahul@sportsevo.com', phone: '+1 555 010 0006', password: 'password', role: 'user', created_at: new Date(2026, 7, 22, 16, 40).toISOString() },
    { id: 7, name: 'Priya Nair', email: 'priya@sportsevo.com', phone: '+1 555 010 0007', password: 'password', role: 'user', created_at: new Date(2026, 7, 25, 9, 15).toISOString() },
    { id: 8, name: 'Omar Haddad', email: 'omar@sportsevo.com', phone: '+1 555 010 0008', password: 'password', role: 'user', created_at: new Date(2026, 7, 28, 13, 50).toISOString() },
  ]

  const turfs = [
    { id: 1, name: 'Green Arena FC', email: 'greenarena@sportsevo.com', phone: '+1 555 020 1001', location: 'Downtown, Main Street 12', is_approved: true, manager_id: 3, created_at: new Date(2026, 7, 16, 10, 0).toISOString(), open: 7, close: 23 },
    { id: 2, name: 'Peak Futsal Court', email: 'peak@sportsevo.com', phone: '+1 555 020 1002', location: 'Northside, River Road 45', is_approved: true, manager_id: 3, created_at: new Date(2026, 7, 20, 12, 0).toISOString(), open: 8, close: 22 },
    { id: 3, name: 'Royal Tennis Club', email: 'royal@sportsevo.com', phone: '+1 555 020 1003', location: 'Eastside, Park Lane 88', is_approved: true, manager_id: 3, created_at: new Date(2026, 7, 23, 15, 30).toISOString(), open: 6, close: 22 },
    { id: 4, name: 'Pinnacle Cricket Ground', email: 'pinnacle@sportsevo.com', phone: '+1 555 020 1004', location: 'Westside, Stadium Avenue 1', is_approved: true, manager_id: 3, created_at: new Date(2026, 7, 26, 9, 30).toISOString(), open: 5, close: 23 },
    { id: 5, name: 'Elite Multiplex Turf', email: 'elite@sportsevo.com', phone: '+1 555 020 1005', location: 'Central, Tech Park 900', is_approved: true, manager_id: 3, created_at: new Date(2026, 7, 29, 14, 0).toISOString(), open: 7, close: 23 },
    { id: 6, name: 'Sunset Badminton Hub', email: 'sunset@sportsevo.com', phone: '+1 555 020 1006', location: 'Harbor District, Pier 3', is_approved: false, manager_id: 3, created_at: new Date(2026, 8, 2, 11, 45).toISOString(), open: 7, close: 21 },
    { id: 7, name: 'Metro Indoor Arena', email: 'metro@sportsevo.com', phone: '+1 555 020 1007', location: 'Old Town, Cross Street 7', is_approved: false, manager_id: 3, created_at: new Date(2026, 8, 4, 16, 15).toISOString(), open: 6, close: 23 },
  ]

  const slots = []
  const bookings = []
  let slotId = 1
  let bookingId = 1

  const addSlots = (turf) => {
    for (let day = -1; day < 6; day++) {
      for (let hour = turf.open; hour < turf.close; hour++) {
        const start = atUTC(day, hour, 0)
        const end = atUTC(day, hour + 1, 0)
        const date = start.slice(0, 10)
        slots.push({
          id: slotId++,
          turf_id: turf.id,
          date,
          start_time: start,
          end_time: end,
          status: 'available',
          booking_id: null,
        })
      }
    }
  }

  turfs.forEach((t) => {
    if (t.is_approved) addSlots(t)
  })

  const book = (turf, userId, day, hour, status) => {
    const start = atUTC(day, hour, 0)
    const date = start.slice(0, 10)
    const slot = slots.find((s) => s.turf_id === turf.id && s.date === date && s.start_time === start)
    if (!slot) return
    slot.status = 'booked'
    const booking = {
      id: bookingId++,
      turf_id: turf.id,
      user_id: userId,
      slot_id: slot.id,
      start_time: start,
      end_time: atUTC(day, hour + 1, 0),
      status,
      created_at: new Date().toISOString(),
    }
    slot.booking_id = booking.id
    bookings.push(booking)
  }

  book(turfs[0], 4, 1, 19, 'booked')
  book(turfs[0], 4, -2, 18, 'completed')
  book(turfs[0], 5, 2, 20, 'booked')
  book(turfs[1], 4, 2, 18, 'booked')
  book(turfs[1], 6, -3, 19, 'completed')
  book(turfs[2], 7, 3, 17, 'booked')
  book(turfs[3], 8, -5, 7, 'completed')
  book(turfs[4], 5, 1, 12, 'booked')
  book(turfs[0], 3, 0, 20, 'booked')

  const turfToday = turfs[0]
  const todayStr = todayKey()
  const todaySlots = slots.filter((s) => s.turf_id === turfToday.id && s.date === todayStr)
  const some = todaySlots.filter((s) => s.status === 'available').slice(0, 6)
  some.forEach((s) => {
    const booking = {
      id: bookingId++,
      turf_id: turfToday.id,
      user_id: 6,
      slot_id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      status: 'booked',
      created_at: new Date().toISOString(),
    }
    s.status = 'booked'
    s.booking_id = booking.id
    bookings.push(booking)
  })

  return { users, turfs, slots, bookings }
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.users) return parsed
    }
  } catch {
    /* fall through to reseed */
  }
  const fresh = seed()
  persist(fresh)
  return fresh
}

function persist(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

function getSessionUserId() {
  return Number(localStorage.getItem(SESSION_KEY)) || null
}

function setSessionUserId(id) {
  if (id) localStorage.setItem(SESSION_KEY, String(id))
  else localStorage.removeItem(SESSION_KEY)
}

const sanitizeUser = ({ id, name, email, phone, role, created_at }) => ({
  id,
  name,
  email,
  phone,
  role,
  created_at,
})

const ok = (data, config) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})

const fail = (config, status, message) => {
  const response = { data: { message }, status, statusText: 'Error', headers: {}, config }
  return Promise.reject(new AxiosError(message, String(status), config, null, response))
}

function findTurf(db, id) {
  return db.turfs.find((t) => t.id === Number(id))
}

function turfForUser(db, user) {
  if (user.role === 'turf') {
    return db.turfs.find((t) => t.manager_id === user.id) || null
  }
  return null
}

function bookingViews(db, booking, includeTurf = true) {
  const turf = db.turfs.find((t) => t.id === booking.turf_id)
  const user = db.users.find((u) => u.id === booking.user_id)
  const view = {
    id: booking.id,
    start_time: booking.start_time,
    end_time: booking.end_time,
    status: booking.status,
    created_at: booking.created_at,
  }
  if (includeTurf && turf) {
    view.turf = { id: turf.id, name: turf.name, location: turf.location }
  }
  if (user) view.user = { id: user.id, name: user.name, email: user.email }
  return view
}

function turfsForUser(db, user) {
  return user
    ? db.turfs.filter((t) => t.manager_id === user.id)
    : []
}

function handler(db, config) {
  const method = (config.method || 'get').toLowerCase()
  const url = config.url || ''
  const path = url.replace(/^\/api/, '') || '/'
  const body = config.data ? (typeof config.data === 'string' ? JSON.parse(config.data) : config.data) : {}
  const params = config.params || {}
  const sessionId = getSessionUserId()
  const currentUser = db.users.find((u) => u.id === sessionId) || null

  const requireAuth = () => {
    if (!currentUser) return fail(config, 401, 'Unauthenticated.')
    return null
  }

  if (method === 'post' && path === '/login') {
    const user = db.users.find((u) => u.email === body.email && u.password === body.password)
    if (!user) return fail(config, 401, 'These credentials do not match our records.')
    setSessionUserId(user.id)
    return ok({ user: sanitizeUser(user), token: `demo-${user.id}-${Date.now()}` }, config)
  }

  if (method === 'post' && path === '/register') {
    const existing = db.users.find((u) => u.email.toLowerCase() === (body.email || '').toLowerCase())
    if (existing) return fail(config, 422, 'The email has already been taken.')
    const id = Math.max(0, ...db.users.map((u) => u.id)) + 1
    const user = {
      id,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      password: body.password,
      role: body.role === 'turf' ? 'turf' : 'user',
      created_at: new Date().toISOString(),
    }
    db.users.push(user)
    persist(db)
    setSessionUserId(id)
    return ok({ user: sanitizeUser(user), token: `demo-${id}-${Date.now()}` }, config)
  }

  if (method === 'post' && path === '/logout') {
    setSessionUserId(null)
    return ok({ message: 'Logged out.' }, config)
  }

  if (method === 'get' && path === '/me') {
    const blocked = requireAuth()
    if (blocked) return blocked
    return ok({ user: sanitizeUser(currentUser) }, config)
  }

  if (method === 'get' && path === '/turfs') {
    let list = db.turfs.filter((t) => t.is_approved)
    if (params.search) list = list.filter((t) => t.name.toLowerCase().includes(String(params.search).toLowerCase()))
    if (params.location) list = list.filter((t) => t.location.toLowerCase().includes(String(params.location).toLowerCase()))
    const perPage = Math.max(1, Number(params.per_page) || 15)
    const page = Math.max(1, Number(params.page) || 1)
    const total = list.length
    const lastPage = Math.max(1, Math.ceil(total / perPage))
    const data = list.slice((page - 1) * perPage, page * perPage)
    return ok({ data, current_page: page, last_page: lastPage, total, per_page: perPage }, config)
  }

  const turfDetail = path.match(/^\/turfs\/(\d+)$/)
  if (method === 'get' && turfDetail) {
    const turf = findTurf(db, turfDetail[1])
    if (!turf || !turf.is_approved) return fail(config, 404, 'Turf not found.')
    return ok({ turf }, config)
  }

  if (method === 'post' && path === '/turfs') {
    const blocked = requireAuth()
    if (blocked) return blocked
    if (currentUser.role !== 'turf') return fail(config, 403, 'Only turf managers can register turfs.')
    const id = Math.max(0, ...db.turfs.map((t) => t.id)) + 1
    const turf = {
      id,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      location: body.location,
      is_approved: false,
      manager_id: currentUser.id,
      created_at: new Date().toISOString(),
      open: 7,
      close: 23,
    }
    db.turfs.push(turf)
    persist(db)
    return ok({ message: 'Turf submitted for approval.', turf }, config)
  }

  const slotsRoute = path.match(/^\/turfs\/(\d+)\/slots$/)
  if (slotsRoute) {
    const turf = findTurf(db, slotsRoute[1])

    if (method === 'get') {
      if (!turf || !turf.is_approved) return fail(config, 404, 'Turf not found.')
      const date = params.date || todayKey()
      const slots = db.slots
        .filter((s) => s.turf_id === turf.id && s.date === date)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
      return ok({ slots }, config)
    }

    if (method === 'post') {
      const blocked = requireAuth()
      if (blocked) return blocked
      const mine = turfsForUser(db, currentUser).some((t) => t.id === turf?.id)
      if (!turf || !mine) return fail(config, 404, 'Turf not found.')
      const duration = Math.max(15, Number(body.slot_duration) || 60)
      const startH = Number(String(body.start_time).slice(0, 2))
      const startM = Number(String(body.start_time).slice(3, 5)) || 0
      const endH = Number(String(body.end_time).slice(0, 2))
      const endM = Number(String(body.end_time).slice(3, 5)) || 0
      const [y, m, d] = body.date.split('-').map(Number)
      const startDate = new Date(y, m - 1, d, startH, startM)
      const endDate = new Date(y, m - 1, d, endH, endM)
      const dbDate = `${y}-${pad(m)}-${pad(d)}`
      db.slots = db.slots.filter((s) => !(s.turf_id === turf.id && s.date === dbDate))
      let count = 0
      for (let t = startDate.getTime(); t + duration * 60000 <= endDate.getTime(); t += duration * 60000) {
        const s = new Date(t)
        const id = Math.max(0, ...db.slots.map((x) => x.id)) + 1
        db.slots.push({
          id,
          turf_id: turf.id,
          date: dbDate,
          start_time: new Date(y, m - 1, d, s.getHours(), s.getMinutes(), 0).toISOString(),
          end_time: new Date(y, m - 1, d, s.getHours(), s.getMinutes() + duration, 0).toISOString(),
          status: 'available',
          booking_id: null,
        })
        count++
      }
      persist(db)
      if (count === 0) return fail(config, 422, 'Invalid time range.')
      return ok({ message: `${count} slots generated.` }, config)
    }
  }

  const bookingRoute = path.match(/^\/bookings\/(\d+)\/cancel$/)
  if (method === 'post' && bookingRoute) {
    const blocked = requireAuth()
    if (blocked) return blocked
    const booking = db.bookings.find((b) => b.id === Number(bookingRoute[1]) && b.user_id === currentUser.id)
    if (!booking) return fail(config, 404, 'Booking not found.')
    booking.status = 'cancelled'
    const slot = db.slots.find((s) => s.id === booking.slot_id)
    if (slot) {
      slot.status = 'available'
      slot.booking_id = null
    }
    persist(db)
    return ok({ message: 'Booking cancelled.' }, config)
  }

  const completeRoute = path.match(/^\/bookings\/(\d+)\/complete$/)
  if (method === 'post' && completeRoute) {
    const blocked = requireAuth()
    if (blocked) return blocked
    const booking = db.bookings.find((b) => b.id === Number(completeRoute[1]))
    if (!booking) return fail(config, 404, 'Booking not found.')
    booking.status = 'completed'
    persist(db)
    return ok({ message: 'Booking marked as completed.' }, config)
  }

  if (method === 'get' && path === '/bookings') {
    const blocked = requireAuth()
    if (blocked) return blocked
    const mine = db.bookings.filter((b) => b.user_id === currentUser.id)
    const upcoming = mine
      .filter((b) => b.status === 'booked')
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((b) => bookingViews(db, b))
    const past = mine
      .filter((b) => b.status !== 'booked')
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .map((b) => bookingViews(db, b))
    return ok({ upcoming, past }, config)
  }

  if (method === 'post' && path === '/bookings') {
    const blocked = requireAuth()
    if (blocked) return blocked
    const turf = findTurf(db, body.turf_id)
    if (!turf || !turf.is_approved) return fail(config, 404, 'Turf not found.')
    const slot = db.slots.find(
      (s) =>
        s.turf_id === turf.id &&
        s.start_time === body.start_time &&
        s.end_time === body.end_time &&
        s.status === 'available'
    )
    if (!slot) return fail(config, 409, 'That slot is no longer available.')
    slot.status = 'booked'
    const id = Math.max(0, ...db.bookings.map((b) => b.id)) + 1
    const booking = {
      id,
      turf_id: turf.id,
      user_id: currentUser.id,
      slot_id: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      status: 'booked',
      created_at: new Date().toISOString(),
    }
    slot.booking_id = id
    db.bookings.push(booking)
    persist(db)
    return ok({ message: 'Booking confirmed!', booking }, config)
  }

  if (method === 'get' && path === '/dashboard/user') {
    const blocked = requireAuth()
    if (blocked) return blocked
    const mine = db.bookings.filter((b) => b.user_id === currentUser.id)
    const upcoming = mine
      .filter((b) => b.status === 'booked')
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((b) => bookingViews(db, b))
    const past = mine
      .filter((b) => b.status !== 'booked')
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .map((b) => bookingViews(db, b))
    return ok(
      {
        stats: {
          totalBookings: mine.filter((b) => b.status === 'booked').length + past.filter((b) => b.status === 'completed').length,
          completed: past.filter((b) => b.status === 'completed').length,
        },
        upcoming,
        past,
      },
      config
    )
  }

  if (method === 'get' && path === '/dashboard/turf') {
    const blocked = requireAuth()
    if (blocked) return blocked
    const turf = turfForUser(db, currentUser)
    if (!turf) return fail(config, 404, 'No turf yet.')
    const todayStr = todayKey()
    const todaySlots = db.slots
      .filter((s) => s.turf_id === turf.id && s.date === todayStr)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    const todaysBookings = todaySlots.map((s) => {
      const b = s.booking_id ? db.bookings.find((x) => x.id === s.booking_id) : null
      const u = b ? db.users.find((x) => x.id === b.user_id) : null
      return {
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        user: u ? { name: u.name, email: u.email } : null,
      }
    })
    const turfBookings = db.bookings.filter((b) => b.turf_id === turf.id)
    const upcoming = turfBookings
      .filter((b) => b.status === 'booked')
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((b) => bookingViews(db, b, false))
    return ok(
      {
        turf: {
          id: turf.id,
          name: turf.name,
          location: turf.location,
          email: turf.email,
          phone: turf.phone,
          is_approved: turf.is_approved,
        },
        stats: {
          todayBookings: todaySlots.filter((s) => s.status === 'booked').length,
          availableToday: todaySlots.filter((s) => s.status === 'available').length,
          totalBooked: turfBookings.filter((b) => b.status === 'booked').length,
          completed: turfBookings.filter((b) => b.status === 'completed').length,
        },
        todaysBookings,
        upcoming,
      },
      config
    )
  }

  if (method === 'get' && path === '/dashboard/platform') {
    const blocked = requireAuth()
    if (blocked) return blocked
    if (!['admin', 'superadmin'].includes(currentUser.role)) return fail(config, 403, 'Access denied.')
    const recentRegistrations = db.users
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: { name: u.role === 'superadmin' ? 'Superadmin' : u.role === 'admin' ? 'Admin' : u.role === 'turf' ? 'Turf Manager' : 'User' },
        created_at: u.created_at,
      }))
    const recentBookings = db.bookings
      .slice()
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .slice(0, 6)
      .map((b) => bookingViews(db, b))
    const pendingApprovals = db.turfs
      .filter((t) => !t.is_approved)
      .map((t) => {
        const manager = db.users.find((u) => u.id === t.manager_id)
        return {
          id: t.id,
          name: t.name,
          location: t.location,
          email: t.email,
          phone: t.phone,
          created_at: t.created_at,
          manager: manager
            ? { id: manager.id, name: manager.name, email: manager.email }
            : null,
        }
      })
    return ok(
      {
        stats: {
          totalUsers: db.users.length,
          totalTurfs: db.turfs.length,
          approvedTurfs: db.turfs.filter((t) => t.is_approved).length,
          pendingTurfs: db.turfs.filter((t) => !t.is_approved).length,
          totalBookings: db.bookings.filter((b) => b.status === 'booked').length,
          completed: db.bookings.filter((b) => b.status === 'completed').length,
        },
        pendingApprovals,
        bookingsByStatus: {
          booked: db.bookings.filter((b) => b.status === 'booked').length,
          completed: db.bookings.filter((b) => b.status === 'completed').length,
          cancelled: db.bookings.filter((b) => b.status === 'cancelled').length,
        },
        recentRegistrations,
        recentBookings,
      },
      config
    )
  }

  const approveRoute = path.match(/^\/admin\/turfs\/(\d+)\/approve$/)
  if (method === 'post' && approveRoute) {
    const blocked = requireAuth()
    if (blocked) return blocked
    if (!['admin', 'superadmin'].includes(currentUser.role)) return fail(config, 403, 'Access denied.')
    const turf = findTurf(db, approveRoute[1])
    if (!turf) return fail(config, 404, 'Turf not found.')
    turf.is_approved = true
    persist(db)
    return ok({ message: 'Turf approved.' }, config)
  }

  const deleteRoute = path.match(/^\/admin\/turfs\/(\d+)$/)
  if (method === 'delete' && deleteRoute) {
    const blocked = requireAuth()
    if (blocked) return blocked
    if (!['admin', 'superadmin'].includes(currentUser.role)) return fail(config, 403, 'Access denied.')
    const id = Number(deleteRoute[1])
    db.turfs = db.turfs.filter((t) => t.id !== id)
    db.slots = db.slots.filter((s) => s.turf_id !== id)
    db.bookings = db.bookings.filter((b) => b.turf_id !== id)
    persist(db)
    return ok({ message: 'Turf deleted.' }, config)
  }

  return fail(config, 404, 'Not found.')
}

export default function mockAdapter(config) {
  const db = loadDb()
  return Promise.resolve(handler(db, config)).catch(async (err) => {
    if (err instanceof AxiosError) throw err
    return fail(config, 500, 'Demo server error.')
  })
}