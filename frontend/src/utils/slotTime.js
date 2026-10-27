export function slotCrossesMidnight(slot, timeZone = 'Asia/Dhaka') {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return format.format(new Date(slot.start_time)) !== format.format(new Date(slot.end_time))
}
