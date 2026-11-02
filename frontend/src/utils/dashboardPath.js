export function dashboardPath(role, needsComplexRegistration = false) {
  if (role === 'superadmin' || role === 'admin') return '/dashboard/platform'
  if (role === 'turf') return needsComplexRegistration ? '/dashboard/turf' : '/dashboard/turf/schedule'
  return '/dashboard/user'
}
