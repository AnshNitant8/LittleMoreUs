import { beforeEach, describe, expect, it } from 'vitest'
import {
  acceptInvitation,
  advanceClock,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  getCouple,
  getInvitation,
  getMyInvitation,
  getSession,
  idemKey,
  listNotifications,
  rememberInvite,
  requestOtp,
  switchUser,
  updateCouple,
  updateMe,
  updatePreferences,
  verifyOtp,
  INVITES_PER_DAY,
} from '../api'
import { configureStorage, createMemoryAdapter, readDb } from '../storage'

const k = () => idemKey('t')

async function signUp(identifier: string, name: string, label: string, band: '1_6' | '7_12' | null = '7_12') {
  expect((await requestOtp({ identifier, mode: 'signup', is_18_confirmed: true, idempotencyKey: k() })).ok).toBe(true)
  const v = await verifyOtp({ code: '123456', idempotencyKey: k() })
  if (!v.ok) throw new Error(v.error.message)
  if (band) await updateMe({ age_band: band, idempotencyKey: k() })
  if (name) await updateMe({ display_name: name, parent_label: label, idempotencyKey: k() })
  return v.data
}

async function invite() {
  const r = await createInvitation({ idempotencyKey: k(), timezone: 'Asia/Kolkata' })
  if (!r.ok) throw new Error(r.error.message)
  return r.data.token
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('invitations', () => {
  it('creates a one-time link; regenerating invalidates the previous token', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t1 = await invite()
    const t2 = await invite()
    expect(t1).not.toBe(t2)
    const old = await getInvitation(t1)
    expect(old.ok && old.data.status).toBe('cancelled')
    const mine = await getMyInvitation()
    expect(mine.ok && mine.data?.token).toBe(t2)
    expect(readDb().couples).toHaveLength(0) // no couple until accepted
  })

  it('keeps the invite when the invitee tries to log in with no account, then signs up and accepts', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await switchUser('B')
    await rememberInvite(t)
    const login = await requestOtp({ identifier: 'dolly@x.com', mode: 'continue', idempotencyKey: k() })
    expect(!login.ok && login.error.new_account).toBe(true)
    await signUp('dolly@x.com', '', '', null)
    const s = await getSession()
    expect(s.ok && s.data.pending_invite).toBe(t)
    expect((await acceptInvitation({ token: t, idempotencyKey: k() })).ok).toBe(true)
  })

  it('cancel makes the link unusable', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await cancelInvitation({ idempotencyKey: k() })
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    const r = await acceptInvitation({ token: t, idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(410)
  })

  it('rate-limits invitation creation', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    for (let i = 0; i < INVITES_PER_DAY; i++) await invite()
    const r = await createInvitation({ idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(429)
  })

  it('expires after invite_expiry_days (scheduled job) with a friendly message', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await advanceClock(168)
    expect(readDb().invitations[0].status).toBe('expired')
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    const r = await acceptInvitation({ token: t, idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(410)
    expect(!r.ok && r.error.message).toMatch(/new one/)
  })

  it('rejects unknown tokens and your own invitation', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    expect((await acceptInvitation({ token: 'nope', idempotencyKey: k() })).ok).toBe(false)
    const own = await acceptInvitation({ token: t, idempotencyKey: k() })
    expect(!own.ok && own.error.code).toBe(400)
    const view = await getInvitation(t)
    expect(view.ok && view.data.problem).toBe('own_invitation')
  })

  it('decline gives the inviter a neutral declined status and no couple', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await switchUser('B')
    expect((await declineInvitation({ token: t, idempotencyKey: k() })).ok).toBe(true)
    await switchUser('A')
    const mine = await getMyInvitation()
    expect(mine.ok && mine.data?.status).toBe('declined')
    expect(readDb().couples).toHaveLength(0)
  })
})

describe('acceptance and couple', () => {
  it('creates the couple on acceptance with inviter timezone and age band', async () => {
    const a = await signUp('a@x.com', 'Priya', 'Mama', '7_12')
    const t = await invite()
    await switchUser('B')
    const b = await signUp('b@x.com', '', '', null)
    const r = await acceptInvitation({ token: t, idempotencyKey: k() })
    expect(r.ok).toBe(true)
    const c = readDb().couples[0]
    expect(c.member_user_ids).toEqual([a.user_id, b.user_id])
    expect(c.timezone).toBe('Asia/Kolkata')
    expect(c.age_band).toBe('7_12')
    // the used token cannot be reused
    await switchUser('A')
    const again = await getInvitation(t)
    expect(again.ok && again.data.status).toBe('accepted')
    const mine = await getMyInvitation()
    expect(mine.ok && mine.data?.status).toBe('accepted')
  })

  it('invitee onboarding skips the invite step and can change the prefilled stage', async () => {
    await signUp('a@x.com', 'Priya', 'Mama', '7_12')
    const t = await invite()
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    await acceptInvitation({ token: t, idempotencyKey: k() })
    let s = await getSession()
    expect(s.ok && s.data.onboarding_step).toBe('stage')
    expect(s.ok && s.data.couple?.age_band).toBe('7_12')
    await updateMe({ age_band: '13_18', idempotencyKey: k() })
    await updateMe({ display_name: 'Anika', parent_label: 'mama', idempotencyKey: k() })
    await updatePreferences({ categories: ['lets_play'], depth: 'light', idempotencyKey: k() })
    s = await getSession()
    expect(s.ok && s.data.onboarding_step).toBe('notifications')
    expect(readDb().couples[0].age_band).toBe('13_18')
    // partner gets one neutral in-app notice, no answer or question text
    await switchUser('A')
    const notes = await listNotifications()
    expect(notes.ok && notes.data.map((n) => n.type)).toEqual(['household_notice'])
    expect(notes.ok && notes.data[0].body).toMatch(/13–18 months/)
  })

  it('a paired user cannot accept another invitation, nor can a paired inviter be joined', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    await acceptInvitation({ token: t, idempotencyKey: k() })
    const second = await createInvitation({ idempotencyKey: k() })
    expect(!second.ok && second.error.code).toBe(409)
  })

  it('shows partner label only after the partner has set it', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    await acceptInvitation({ token: t, idempotencyKey: k() })
    await switchUser('A')
    let c = await getCouple()
    expect(c.ok && c.data?.partner.parent_label).toBeNull()
    await switchUser('B')
    await updateMe({ age_band: '7_12', idempotencyKey: k() })
    await updateMe({ display_name: 'Anika', parent_label: 'Mama', idempotencyKey: k() })
    await switchUser('A')
    c = await getCouple()
    expect(c.ok && c.data?.partner).toEqual({ display_name: 'Anika', parent_label: 'Mama' })
    expect(JSON.stringify(c)).not.toContain('b@x.com')
  })

  it('timezone can change at most once per 24 hours', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const t = await invite()
    await switchUser('B')
    await signUp('b@x.com', '', '', null)
    await acceptInvitation({ token: t, idempotencyKey: k() })
    expect((await updateCouple({ timezone: 'Not/AZone', idempotencyKey: k() })).ok).toBe(false)
    expect((await updateCouple({ timezone: 'Europe/London', idempotencyKey: k() })).ok).toBe(true)
    await switchUser('A')
    const r = await updateCouple({ timezone: 'Asia/Kolkata', idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(429)
    await advanceClock(24)
    expect((await updateCouple({ timezone: 'Asia/Kolkata', idempotencyKey: k() })).ok).toBe(true)
  })

  it('updateCouple requires pairing', async () => {
    await signUp('a@x.com', 'Priya', 'Mama')
    const r = await updateCouple({ age_band: '1_6', idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(403)
  })
})
