import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { dashboardPath } from './utils/dashboardPath'
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const UserDashboard = lazy(() => import('./pages/dashboards/UserDashboard'))
const TurfDashboard = lazy(() => import('./pages/dashboards/TurfDashboard'))
const FieldSchedule = lazy(() => import('./pages/dashboards/FieldSchedule'))
const AdvancePayments = lazy(() => import('./pages/dashboards/AdvancePayments'))
const FeaturedOwner = lazy(() => import('./pages/dashboards/FeaturedOwner'))
const PlatformDashboard = lazy(() => import('./pages/dashboards/PlatformDashboard'))
const Turfs = lazy(() => import('./pages/Turfs'))
const MapSearch = lazy(() => import('./pages/MapSearch'))
const HowToBook = lazy(() => import('./pages/HowToBook'))
const TurfDetail = lazy(() => import('./pages/TurfDetail'))
const FieldSelection = lazy(() => import('./pages/FieldSelection'))
const Reports = lazy(() => import('./pages/Reports'))
const MyBookings = lazy(() => import('./pages/MyBookings'))
const Profile = lazy(() => import('./pages/Profile'))
import Home from './pages/Home'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import LanguageToggle from './components/LanguageToggle'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={dashboardPath(user.role, user.needs_complex_registration)} replace />
  }

  return children
}

function DashboardRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />

  return <Navigate to={dashboardPath(user.role, user.needs_complex_registration)} replace />
}

export default function App() {
  const location = useLocation()
  const authPage = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'].includes(location.pathname)
  const { user, loading } = useAuth()

  return (
    <Suspense fallback={<div className="flex min-h-[70vh] items-center justify-center"><Spinner size="lg" /></div>}>
    {authPage && <div className="auth-language-toggle"><LanguageToggle /></div>}
    <Routes>
      <Route path="/" element={user?.role === 'turf' ? (loading ? <div className="flex min-h-[70vh] items-center justify-center"><Spinner size="lg" /></div> : <Navigate to={dashboardPath(user.role, user.needs_complex_registration)} replace />) : <Home />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/verify-email" element={user ? <Navigate to="/dashboard" replace /> : <VerifyEmail />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={user ? <Navigate to="/dashboard" replace /> : <ResetPassword />} />

      <Route element={<Layout />}>
        <Route path="/explore" element={<MapSearch />} />
        <Route path="/how-to-book" element={<HowToBook />} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/turfs/:id/fields/:selectedFieldId" element={<TurfDetail />} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/user"
          element={
            <ProtectedRoute allowedRoles={['user']}>
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/turf"
          element={
            <ProtectedRoute allowedRoles={['turf']}>
              <TurfDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/turf/schedule"
          element={<ProtectedRoute allowedRoles={['turf']}><FieldSchedule /></ProtectedRoute>}
        />
        <Route path="/dashboard/turf/payments" element={<ProtectedRoute allowedRoles={['turf']}><AdvancePayments /></ProtectedRoute>} />
        <Route path="/dashboard/turf/featured" element={<ProtectedRoute allowedRoles={['turf']}><FeaturedOwner /></ProtectedRoute>} />
        <Route
          path="/dashboard/platform"
          element={
            <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
              <PlatformDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/turfs"
          element={
            <Turfs />
          }
        />
        <Route
          path="/turfs/:id"
          element={
            <FieldSelection />
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute allowedRoles={['user']}>
              <MyBookings />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
