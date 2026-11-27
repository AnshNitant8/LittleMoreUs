import { expect } from 'vitest'
import {
  acceptInvitation,
  createInvitation,
  idemKey,
  requestOtp,
  skipInviteStep,
  switchUser,
  updateMe,
  updatePreferences,
  verifyOtp,
} from '../services/api'
import type { CategoryId, Depth } from '../domain/types'
import { readDb, transact } from '../services/storage'

export const k = () => idemKey('t')

/** Pin simulated time to the next given UTC hour (tests that depend on notification windows). */
export function pinClockToUtcHour(hour: number) {
  transact((db) => {
    const now = Date.now() + db.clock_offset_ms
    const d = new Date(now)
    d.setUTCHours(hour, 0, 0, 0)
    if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1)
    db.clock_offset_ms += d.getTime() - now
  })
}

export async function onboard(identifier: string) {
  expect((await requestOtp({ identifier, mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })).ok).toBe(true)
  const v = await verifyOtp({ code: '123456', idempotencyKey: k() })
  if (!v.ok) throw new Error(v.error.message)
  return v.data
}

/** Two fully onboarded, paired users. Partner A is active afterwards. Times are pinned to midday UTC. */
export async function pairedCouple(opts: { depth?: Depth; band?: '1_6' | '7_12' | '13_18' | 'other' } = {}) {
  const depth = opts.depth ?? 'deeper'
  const all: CategoryId[] = ['remember_us', 'our_journey', 'little_appreciations', 'what_we_need', 'lets_play']
  pinClockToUtcHour(12)
  const a = await onboard('a@x.com')
  await updateMe({ age_band: opts.band ?? '7_12', idempotencyKey: k() })
  await updateMe({ display_name: 'Priya', parent_label: 'Mama', idempotencyKey: k() })
  await updatePreferences({ categories: all, depth, idempotencyKey: k() })
  const inv = await createInvitation({ idempotencyKey: k(), timezone: 'UTC' })
  if (!inv.ok) throw new Error(inv.error.message)
  await skipInviteStep({ idempotencyKey: k() })
  await updateMe({ onboarding_complete: true, idempotencyKey: k() })
  await switchUser('B')
  const b = await onboard('b@x.com')
  const acc = await acceptInvitation({ token: inv.data.token, idempotencyKey: k() })
  if (!acc.ok) throw new Error(acc.error.message)
  await updateMe({ age_band: opts.band ?? '7_12', idempotencyKey: k() })
  await updateMe({ display_name: 'Anika', parent_label: 'Amma', idempotencyKey: k() })
  await updatePreferences({ categories: all, depth, idempotencyKey: k() })
  await updateMe({ onboarding_complete: true, idempotencyKey: k() })
  await switchUser('A')
  return { a, b, couple: readDb().couples[0] }
}
