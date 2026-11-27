// Simulated push notifications (spec Section 12). Bodies are generic copy:
// never question or answer text. Push-type notifications respect the
// recipient's toggles, preferred window and quiet hours; delivery is
// deferred (deliver_at) rather than dropped when outside those hours.

import type { AppNotification, CategoryId, NotificationType, User } from '../domain/types'
import { newId } from '../utils/id'
import { browserTimezone, inWindow, localMinutes } from '../utils/time'
import { DURATION, nowMs } from './clock'
import type { Db } from './storage'

const TOGGLE_FOR: Partial<Record<NotificationType, keyof User['notification_prefs']['toggles']>> = {
  app_suggestion: 'app_suggestions',
  partner_invitation: 'partner_invitations',
  pending_reminder: 'pending_reminders',
}

/** Types that behave like push and so follow window and quiet hours. */
const PUSH_TYPES: NotificationType[] = ['app_suggestion', 'partner_invitation', 'pending_reminder', 'story_ready']

/** True if a push may be delivered to this user at this instant. */
export function canDeliverAt(user: User, atMs: number, timeZone: string): boolean {
  const m = localMinutes(atMs, timeZone)
  const { window, quiet_hours } = user.notification_prefs
  return inWindow(m, window.start, window.end) && !inWindow(m, quiet_hours.start, quiet_hours.end)
}

/** Earliest instant at or after `fromMs` when delivery is allowed (15-minute steps, max 48h). */
export function nextDeliveryTime(user: User, fromMs: number, timeZone: string): number {
  if (canDeliverAt(user, fromMs, timeZone)) return fromMs
  const step = 15 * DURATION.MINUTE
  let t = Math.ceil(fromMs / step) * step
  for (let i = 0; i < 4 * 48; i++, t += step) if (canDeliverAt(user, t, timeZone)) return t
  return fromMs // window and quiet hours never overlap: deliver now rather than never
}

export interface NotifyInput {
  user_id: string
  type: NotificationType
  body: string
  category?: CategoryId | null
  /** Notification is created at most once per key. */
  dedupe_key: string
  timeZone?: string
}

/** Queue a notification. Returns it, or null if muted by a toggle or already sent. */
export function notify(db: Db, input: NotifyInput): AppNotification | null {
  const user = db.users.find((u) => u.user_id === input.user_id)
  if (!user) return null
  if (db.notifications.some((n) => n.dedupe_key === input.dedupe_key)) return null
  const toggle = TOGGLE_FOR[input.type]
  if (toggle && !user.notification_prefs.toggles[toggle]) return null
  const now = nowMs()
  const tz = input.timeZone ?? browserTimezone()
  const deliverAt = PUSH_TYPES.includes(input.type) ? nextDeliveryTime(user, now, tz) : now
  const n: AppNotification = {
    id: newId('ntf'),
    user_id: user.user_id,
    type: input.type,
    body: input.body,
    category: input.category ?? null,
    created_at: new Date(now).toISOString(),
    deliver_at: new Date(deliverAt).toISOString(),
    read: false,
    dedupe_key: input.dedupe_key,
  }
  db.notifications.push(n)
  return n
}
