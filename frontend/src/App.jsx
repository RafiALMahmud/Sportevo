import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import UserDashboard from './pages/dashboards/UserDashboard'
import TurfDashboard from './pages/dashboards/TurfDashboard'
import PlatformDashboard from './pages/dashboards/PlatformDashboard'
import Turfs from './pages/Turfs'
import TurfDetail from './pages/TurfDetail'
import MyBookings from './pages/MyBookings'
import Home from './pages/Home'
import Layout from './components/Layout'
import Spinner from './components/Spinner'

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
    return <Navigate to={`/dashboard/${user.role === 'superadmin' || user.role === 'admin' ? 'platform' : user.role}`} replace />
  }

  return children
}

function DashboardRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />

  if (user.role === 'superadmin' || user.role === 'admin') return <Navigate to="/dashboard/platform" replace />
  if (user.role === 'turf') return <Navigate to="/dashboard/turf" replace />
  return <Navigate to="/dashboard/user" replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/verify-email" element={user ? <Navigate to="/dashboard" replace /> : <VerifyEmail />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={user ? <Navigate to="/dashboard" replace /> : <ResetPassword />} />

      <Route element={<Layout />}>
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
            <ProtectedRoute allowedRoles={['turf', 'admin', 'superadmin']}>
              <TurfDashboard />
            </ProtectedRoute>
          }
        />
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
            <ProtectedRoute allowedRoles={['user']}>
              <Turfs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/turfs/:id"
          element={
            <ProtectedRoute allowedRoles={['user']}>
              <TurfDetail />
            </ProtectedRoute>
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
  )
}
