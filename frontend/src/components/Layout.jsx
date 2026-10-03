import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = {
  user: [
    { to: '/dashboard/user', label: 'Dashboard' },
    { to: '/turfs', label: 'Browse Complexes' },
    { to: '/bookings', label: 'My Bookings' },
  ],
  turf: [{ to: '/dashboard/turf', label: 'Dashboard' }],
  admin: [{ to: '/dashboard/platform', label: 'Dashboard' }],
  superadmin: [{ to: '/dashboard/platform', label: 'Dashboard' }],
}

const roleLabels = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  turf: 'Complex Manager',
  user: 'User',
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const items = navItems[user.role] || []

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <nav className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 transition hover:opacity-90">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-700 to-teal-700 font-bold text-white shadow-lg shadow-emerald-950 transition hover:shadow-emerald-900">
                SE
              </span>
              <span className="text-lg font-semibold text-white">
                Sports <span className="text-gradient">Evo</span>
              </span>
            </Link>
            <div className="hidden items-center gap-1 md:flex">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-emerald-950 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.2)]'
                        : 'text-zinc-400 hover:-translate-y-0.5 hover:bg-zinc-900 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="hidden items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-zinc-900 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-800 to-teal-800 text-sm font-semibold text-emerald-200">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium text-white">{user.name}</div>
                <div className="text-xs text-zinc-500">{roleLabels[user.role]}</div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:-translate-y-0.5 hover:border-rose-700 hover:bg-rose-950/40 hover:text-rose-300"
            >
              Logout
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="border-t border-zinc-900 md:hidden">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive ? 'bg-emerald-950 text-emerald-400' : 'text-zinc-400 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-zinc-600 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Sports Evo. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
