import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminListPayments,
  adminVerifyPayment,
  advanceClock,
  createInteraction,
  deleteStory,
  getEntitlement,
  getNextMoment,
  getStory,
  listAnalytics,
  listStories,
  requestExport,
  respondToInteraction,
  saveStory,
  submitPaymentReference,
  switchUser,
  updateFlags,
} from '../api'
import { configureStorage, createMemoryAdapter, readDb, transact } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { k, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 30))
const memoryQ = QUESTIONS.find((q) => q.story_intent === 'memory')!

/** A starts, B answers; returns the new story id. Leaves B active. */
async function makeStory(q: { question_id: string } | null = memoryQ, a = 'Dancing in the kitchen', b = 'The rain on the window') {
  await switchUser('A')
  if (!q) {
    const next = await getNextMoment(null)
    if (!next.ok || next.data.kind !== 'question') throw new Error('no next question')
    q = next.data.question
  }
  const c = await createInteraction({ question_id: q.question_id, answer: a, consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  const r = await respondToInteraction({ interaction_id: c.data.interaction_id, answer: b, consent: true, idempotencyKey: k() })
  if (!r.ok) throw new Error(r.error.message)
  await flush()
  return readDb().stories.find((s) => s.interaction_id === c.data.interaction_id)!.story_id
}

async function lockedSavedStory() {
  await updateFlags({ free_window_days: 5 })
  const id = await makeStory()
  await saveStory({ story_id: id, idempotencyKey: k() })
  await advanceClock(120) // +5 days
  return id
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('Storybook timeline and Recent (acceptance 10)', () => {
  it('lists saved stories with category plus date as the title, and unsaved ones in Recent', async () => {
    await pairedCouple()
    const saved = await makeStory()
    await saveStory({ story_id: saved, idempotencyKey: k() })
    await makeStory(null, 'You warmed the milk', 'You hummed to her')
    const r = await listStories()
    if (!r.ok) throw new Error(r.error.message)
    expect(r.data.saved).toHaveLength(1)
    expect(r.data.saved[0].title).toMatch(/^Remember Us · \d+ \w+ \d{4}$/)
    expect(r.data.saved[0].preview).toBeTruthy()
    expect(r.data.recent).toHaveLength(1)
    expect(r.data.recent[0].removed_at).toBeTruthy()
  })

  it('removes unsaved stories after 5 days but keeps saved ones', async () => {
    await pairedCouple()
    const saved = await makeStory()
    await saveStory({ story_id: saved, idempotencyKey: k() })
    await makeStory(null)
    for (let i = 0; i < 4; i++) await advanceClock(24)
    expect((await listStories()).ok && readDb().stories).toHaveLength(2)
    await advanceClock(24)
    const r = await listStories()
    if (!r.ok) throw new Error()
    expect(r.data.recent).toHaveLength(0)
    expect(r.data.saved.map((s) => s.story_id)).toEqual([saved])
  })

  it('locks saved stories outside the free window, never deletes them, and hides their text', async () => {
    await pairedCouple()
    const id = await lockedSavedStory()
    for (let i = 0; i < 6; i++) await advanceClock(168)
    const r = await listStories()
    if (!r.ok) throw new Error()
    expect(r.data.saved[0]).toMatchObject({ story_id: id, locked: true, preview: null })
    const g = await getStory(id)
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.error).toMatchObject({ code: 403, locked: true })
    expect(readDb().stories.some((s) => s.story_id === id)).toBe(true)
  })

  it('lets either partner delete a story, removing it for both, even when locked', async () => {
    await pairedCouple()
    const id = await lockedSavedStory()
    await switchUser('B')
    expect((await deleteStory({ story_id: id, idempotencyKey: k() })).ok).toBe(true)
    await switchUser('A')
    const r = await listStories()
    expect(r.ok && r.data.saved).toHaveLength(0)
    expect(readDb().reactions.some((x) => x.story_id === id)).toBe(false)
  })
})

describe('QR paywall and manual verification (acceptance 11)', () => {
  it('creates a pending purchase that keeps the archive locked, then Approve unlocks it for both partners', async () => {
    await pairedCouple()
    const id = await lockedSavedStory()
    await switchUser('A')
    const sub = await submitPaymentReference({ payment_reference: 'UPI-REF-12345', idempotencyKey: k() })
    expect(sub.ok && sub.data.my_status).toBe('pending')
    expect((await getStory(id)).ok).toBe(false)

    const queue = await adminListPayments()
    if (!queue.ok) throw new Error()
    expect(queue.data[0]).toMatchObject({ status: 'pending', payment_reference: 'UPI-REF-12345' })
    await adminVerifyPayment({ entitlement_id: queue.data[0].entitlement_id, decision: 'approve', idempotencyKey: k() })

    expect((await getStory(id)).ok).toBe(true)
    await switchUser('B')
    expect((await getStory(id)).ok).toBe(true)
    const e = await getEntitlement()
    expect(e.ok && e.data).toMatchObject({ unlocked: true, unlocked_by: 'partner' })
    // The other partner can't buy again.
    const again = await submitPaymentReference({ payment_reference: 'ANOTHER-123', idempotencyKey: k() })
    expect(!again.ok && again.error).toMatchObject({ code: 409, message: 'Already unlocked' })
    expect(readDb().audit_log.some((a) => a.action === 'payment_approve')).toBe(true)
  })

  it('Reject keeps the Storybook locked and allows a new reference', async () => {
    await pairedCouple()
    const id = await lockedSavedStory()
    await submitPaymentReference({ payment_reference: 'REF-000001', idempotencyKey: k() })
    const dup = await submitPaymentReference({ payment_reference: 'REF-000002', idempotencyKey: k() })
    expect(!dup.ok && dup.error.code).toBe(409)
    const q = await adminListPayments()
    if (!q.ok) throw new Error()
    await adminVerifyPayment({ entitlement_id: q.data[0].entitlement_id, decision: 'reject', idempotencyKey: k() })
    expect((await getStory(id)).ok).toBe(false)
    const e = await getEntitlement()
    expect(e.ok && e.data).toMatchObject({ unlocked: false, my_status: 'rejected' })
    expect(readDb().stories).toHaveLength(1)
    expect((await submitPaymentReference({ payment_reference: 'REF-000003', idempotencyKey: k() })).ok).toBe(true)
  })

  it('validates the reference and never puts it in analytics', async () => {
    await pairedCouple()
    const bad = await submitPaymentReference({ payment_reference: 'ab', idempotencyKey: k() })
    expect(!bad.ok && bad.error.code).toBe(400)
    await submitPaymentReference({ payment_reference: 'SECRETREF99', idempotencyKey: k() })
    const a = await listAnalytics()
    expect(JSON.stringify(a.ok && a.data)).not.toContain('SECRETREF99')
  })

  it("belongs to the purchaser: after a disconnect the other partner returns to the free window", async () => {
    await pairedCouple()
    const id = await lockedSavedStory()
    const q0 = await submitPaymentReference({ payment_reference: 'BUYER-REF-1', idempotencyKey: k() }) // B buys
    expect(q0.ok).toBe(true)
    const q = await adminListPayments()
    if (!q.ok) throw new Error()
    await adminVerifyPayment({ entitlement_id: q.data[0].entitlement_id, decision: 'approve', idempotencyKey: k() })
    transact((db) => {
      db.couples[0].state = 'disconnected'
    })
    expect((await getStory(id)).ok).toBe(true) // B, the purchaser
    await switchUser('A')
    const g = await getStory(id)
    expect(!g.ok && g.error.locked).toBe(true)
  })
})

describe('export (acceptance 14)', () => {
  it('downloads JSON with profile and stories but no raw answers, once per day', async () => {
    await pairedCouple()
    await makeStory(memoryQ, 'Dancing in the kitchen', 'The rain on the window')
    const r = await requestExport({ idempotencyKey: k() })
    if (!r.ok) throw new Error(r.error.message)
    const data = JSON.parse(r.data.json)
    expect(data.profile.display_name).toBe('Anika')
    expect(data.stories).toHaveLength(1)
    expect(r.data.json).not.toMatch(/Dancing in the kitchen|rain on the window|text_or_choice|responses/)
    const again = await requestExport({ idempotencyKey: k() })
    expect(!again.ok && again.error.code).toBe(429)
    await advanceClock(24)
    expect((await requestExport({ idempotencyKey: k() })).ok).toBe(true)
  })
})
