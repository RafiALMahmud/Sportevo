export function dashboardPath(role) {
  if (role === 'superadmin' || role === 'admin') return '/dashboard/platform'
  if (role === 'turf') return '/dashboard/turf/schedule'
  return '/dashboard/user'
}
