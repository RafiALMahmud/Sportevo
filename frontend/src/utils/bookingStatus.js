export function bookingDisplayStatus(booking) {
  if (isOfflineBooking(booking)) return 'offline_booking'
  return booking.status === 'booked' && ['awaiting_payment', 'submitted'].includes(booking.advance_status) ? booking.advance_status : booking.status
}

export function isOfflineBooking(booking) {
  return booking.status === 'unavailable' && booking.unavailable_type === 'offline_booking'
}
