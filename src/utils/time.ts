/** Local calendar day (YYYY-MM-DD) for an instant in a given IANA timezone. */
export function localDay(at: Date | number, timeZone: string): string {
  const d = typeof at === 'number' ? new Date(at) : at
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** Minutes since local midnight for an instant in a timezone. */
export function localMinutes(at: Date | number, timeZone: string): number {
  const d = typeof at === 'number' ? new Date(at) : at
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    return h * 60 + m
  } catch {
    return d.getUTCHours() * 60 + d.getUTCMinutes()
  }
}

export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** True if `minutes` falls in [start, end), handling windows that wrap midnight. */
export function inWindow(minutes: number, start: string, end: string): boolean {
  const s = parseHm(start)
  const e = parseHm(end)
  if (s === e) return true
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function formatDate(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function formatDateTime(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString()
}
