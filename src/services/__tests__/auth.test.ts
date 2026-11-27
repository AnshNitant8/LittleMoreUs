import { beforeEach, describe, expect, it } from 'vitest'
import {
  advanceClock,
  getOtpStatus,
  getPreferences,
  getSession,
  idemKey,
  logout,
  normaliseIdentifier,
  requestOtp,
  skipInviteStep,
  switchUser,
  updateMe,
  updatePreferences,
  verifyOtp,
} from '../api'
import { configureStorage, createMemoryAdapter, readDb, transact } from '../storage'

const k = () => idemKey('t')

/** Move the simulated clock by an arbitrary number of seconds (test helper). */
const advanceSeconds = (s: number) =>
  transact((db) => {
    db.clock_offset_ms += s * 1000
  })

async function signUp(identifier: string) {
  const r = await requestOtp({ identifier, mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
  expect(r.ok).toBe(true)
  const v = await verifyOtp({ code: '123456', idempotencyKey: k() })
  expect(v.ok).toBe(true)
  return v.ok ? v.data : null!
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('identifiers', () => {
  it('accepts phones and emails and normalises them', () => {
    expect(normaliseIdentifier(' +91 98765-43210 ')).toEqual({ value: '+919876543210', kind: 'phone' })
    expect(normaliseIdentifier('Priya@Example.COM')).toEqual({ value: 'priya@example.com', kind: 'email' })
    expect(normaliseIdentifier('123')).toBeNull()
    expect(normaliseIdentifier('a@b')).toBeNull()
  })
})

describe('sign up and log in', () => {
  it('requires the 18+ confirmation at signup', async () => {
    const r = await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: false, idempotencyKey: k() })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe(400)
  })

  it('creates an account with code 123456 and signs in this device', async () => {
    const u = await signUp('a@x.com')
    expect(u.is_18_confirmed).toBe(true)
    const s = await getSession()
    expect(s.ok && s.data.user?.user_id).toBe(u.user_id)
    expect(s.ok && s.data.onboarding_step).toBe('stage')
  })

  it('allows one account per identifier and points duplicates to login', async () => {
    await signUp('a@x.com')
    await logout({ idempotencyKey: k() })
    const dup = await requestOtp({ identifier: 'A@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    expect(!dup.ok && dup.error.code).toBe(409)
    expect(!dup.ok && dup.error.message).toMatch(/log in/i)
    const login = await requestOtp({ identifier: 'a@x.com', mode: 'login', idempotencyKey: k() })
    expect(login.ok).toBe(true)
    expect((await verifyOtp({ code: '123456', idempotencyKey: k() })).ok).toBe(true)
  })

  it('rejects login for unknown identifiers', async () => {
    const r = await requestOtp({ identifier: 'nobody@x.com', mode: 'login', idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(404)
  })

  it('logout ends the active session only', async () => {
    const a = await signUp('a@x.com')
    await switchUser('B')
    await signUp('b@x.com')
    await logout({ idempotencyKey: k() })
    expect(readDb().slots.B.user_id).toBeNull()
    expect(readDb().slots.A.user_id).toBe(a.user_id)
  })

  it('will not sign the same account in on both simulated devices', async () => {
    await signUp('a@x.com')
    await switchUser('B')
    const r = await requestOtp({ identifier: 'a@x.com', mode: 'login', idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(409)
  })
})

describe('OTP timing (simulated clock)', () => {
  it('expires codes after 10 minutes', async () => {
    await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    advanceSeconds(10 * 60 + 1)
    const v = await verifyOtp({ code: '123456', idempotencyKey: k() })
    expect(!v.ok && v.error.code).toBe(410)
  })

  it('allows resend only after 30 seconds', async () => {
    await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    const st = await getOtpStatus()
    expect(st.ok && st.data!.resend_available_in_sec).toBeGreaterThan(25)
    const early = await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    expect(!early.ok && early.error.code).toBe(429)
    advanceSeconds(31)
    const later = await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    expect(later.ok).toBe(true)
  })

  it('locks out for 15 minutes after 5 wrong codes, even with a new code', async () => {
    await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    for (let i = 1; i <= 4; i++) {
      const r = await verifyOtp({ code: '000000', idempotencyKey: k() })
      expect(!r.ok && r.error.code).toBe(400)
      expect(!r.ok && r.error.message).toContain(`${5 - i}`)
    }
    const fifth = await verifyOtp({ code: '000000', idempotencyKey: k() })
    expect(!fifth.ok && fifth.error.code).toBe(429)
    expect(!(await verifyOtp({ code: '123456', idempotencyKey: k() })).ok).toBe(true)
    advanceSeconds(60)
    const resend = await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    expect(!resend.ok && resend.error.code).toBe(429)
    advanceSeconds(15 * 60)
    expect((await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })).ok).toBe(true)
    expect((await verifyOtp({ code: '123456', idempotencyKey: k() })).ok).toBe(true)
  })

  it('a large clock jump also clears lockout', async () => {
    await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })
    for (let i = 0; i < 5; i++) await verifyOtp({ code: '999999', idempotencyKey: k() })
    await advanceClock(1)
    expect((await requestOtp({ identifier: 'a@x.com', mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })).ok).toBe(true)
  })
})

describe('onboarding and profile', () => {
  it('walks through stage → family → moments → notifications → done', async () => {
    await signUp('a@x.com')
    const step = async () => {
      const s = await getSession()
      return s.ok ? s.data.onboarding_step : null
    }
    expect((await updateMe({ onboarding_complete: true, idempotencyKey: k() })).ok).toBe(false)
    await updateMe({ age_band: '7_12', idempotencyKey: k() })
    expect(await step()).toBe('family')
    await updateMe({ display_name: ' Priya ', parent_label: 'Mama', idempotencyKey: k() })
    expect(await step()).toBe('moments')
    expect((await updatePreferences({ categories: [], idempotencyKey: k() })).ok).toBe(false)
    await updatePreferences({ categories: ['remember_us', 'lets_play'], depth: 'mix', idempotencyKey: k() })
    expect(await step()).toBe('invite')
    await skipInviteStep({ idempotencyKey: k() })
    expect(await step()).toBe('notifications')
    const prefs = await getPreferences()
    expect(prefs.ok && prefs.data.notification_prefs.toggles.app_suggestions).toBe(true)
    await updateMe({ onboarding_complete: true, idempotencyKey: k() })
    expect(await step()).toBe('done')
    expect(readDb().users[0].display_name).toBe('Priya')
  })

  it('validates labels: 1–20 characters, any script', async () => {
    await signUp('a@x.com')
    expect((await updateMe({ parent_label: '   ', idempotencyKey: k() })).ok).toBe(false)
    expect((await updateMe({ parent_label: 'x'.repeat(21), idempotencyKey: k() })).ok).toBe(false)
    expect((await updateMe({ parent_label: 'अम्मा', idempotencyKey: k() })).ok).toBe(true)
    expect((await updateMe({ parent_label: 'x'.repeat(20), idempotencyKey: k() })).ok).toBe(true)
  })

  it('rejects invalid notification times', async () => {
    await signUp('a@x.com')
    const r = await updatePreferences({
      notification_prefs: {
        window: { start: '25:00', end: '21:00' },
        quiet_hours: { start: '22:00', end: '07:00' },
        toggles: { app_suggestions: true, partner_invitations: true, pending_reminders: false },
      },
      idempotencyKey: k(),
    })
    expect(r.ok).toBe(false)
  })

  it('requires sign-in for profile reads', async () => {
    const r = await getPreferences()
    expect(!r.ok && r.error.code).toBe(401)
  })

  it('never puts identifiers into analytics', async () => {
    await signUp('secret@x.com')
    expect(JSON.stringify(readDb().analytics)).not.toContain('secret@x.com')
  })
})
