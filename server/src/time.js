export function formatShanghai(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type).value
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}

export function clip(value, max) {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  return chars.slice(0, max).join('')
}
