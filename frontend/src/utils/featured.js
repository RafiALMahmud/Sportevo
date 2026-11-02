export const featureStatus = { awaiting_payment: 'Awaiting payment', submitted: 'Payment under review', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }
export const featuredTime = (value, locale = 'en-BD') => value ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
export function featuredDateInput(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = name => parts.find(item => item.type === name).value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
