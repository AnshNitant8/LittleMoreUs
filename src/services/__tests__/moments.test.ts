import { beforeEach, describe, expect, it } from 'vitest'
import {
  advanceClock,
  createInteraction,
  declineInteraction,
  getDraft,
  getExplore,
  getHome,
  getInteraction,
  getNextMoment,
  getStory,
  listNotifications,
  respondToInteraction,
  runScheduledJobs,
  saveDraft,
  setSimulatedOffline,
  skipMoment,
  switchUser,
  updateFlags,
  updatePreferences,
  withdrawInteraction,
} from '../api'
import { configureStorage, createMemoryAdapter, readDb, transact } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { FALLBACK_STORIES } from '../../data/fallbackStories'
import { selectQuestion, type SelectionContext } from '../../domain/rules/selection'
import { k, onboard, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 20))

async function startMoment(answer = 'The rainy walk to the station', questionId?: string) {
  let qid = questionId
  if (!qid) {
    const next = await getNextMoment(null)
    if (!next.ok || next.data.kind !== 'question') throw new Error('no question')
    qid = next.data.question.question_id
  }
  const r = await createInteraction({ question_id: qid, answer, consent: true, idempotencyKey: k() })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

const partnerNotes = async () => {
  await switchUser('B')
  const n = await listNotifications()
  await switchUser('A')
  return n.ok ? n.data.filter((x) => x.type !== 'app_suggestion') : []
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('before pairing', () => {
  it('an unpaired user cannot get or answer a moment', async () => {
    await onboard('solo@x.com')
    const next = await getNextMoment(null)
    expect(!next.ok && next.error.code).toBe(403)
    const r = await createInteraction({ question_id: QUESTIONS[0].question_id, answer: 'x', consent: true, idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(403)
    expect(readDb().responses).toHaveLength(0)
  })
})

describe('creating a moment (acceptance 3 & 4)', () => {
  it('creates nothing until the initiator submits, then notifies the partner once without question text', async () => {
    await pairedCouple()
    const next = await getNextMoment(null)
    expect(next.ok && next.data.kind).toBe('question')
    expect(readDb().interactions).toHaveLength(0)
    await saveDraft(`q:${QUESTIONS[0].question_id}`, 'draft words')
    expect(readDb().interactions).toHaveLength(0)

    const view = await startMoment('Our rainy walk')
    expect(readDb().interactions).toHaveLength(1)
    expect(readDb().responses).toHaveLength(1)
    expect(view.status).toBe('awaiting_partner')

    const notes = await partnerNotes()
    expect(notes).toHaveLength(1)
    expect(notes[0].type).toBe('partner_invitation')
    expect(notes[0].body).toBe('Mama started a little moment for you both.')
    expect(notes[0].body).not.toContain(view.question_text)
    expect(JSON.stringify(readDb().analytics)).not.toContain('rainy')
  })

  it('the partner sees the identical frozen wording and never the initiator text', async () => {
    await pairedCouple()
    const view = await startMoment('Secret initiator words')
    await switchUser('B')
    const home = await getHome()
    expect(home.ok).toBe(true)
    if (!home.ok) return
    expect(home.data.waiting_for_you).toHaveLength(1)
    const w = home.data.waiting_for_you[0]
    expect(w.question_text).toBe(view.question_text)
    expect(w.question_text).toBe(QUESTIONS.find((q) => q.text === view.question_text)!.text)
    expect(JSON.stringify(home.data)).not.toContain('Secret initiator words')
    const detail = await getInteraction(view.interaction_id)
    expect(detail.ok && detail.data.my_response).toBeNull()
    expect(detail.ok && detail.data.partner_has_answered).toBe(true)
    expect(JSON.stringify(detail)).not.toContain('Secret initiator words')
  })

  it('validates consent, empty and long answers', async () => {
    await pairedCouple()
    const qid = QUESTIONS[0].question_id
    const noConsent = await createInteraction({ question_id: qid, answer: 'hi', consent: false, idempotencyKey: k() })
    expect(!noConsent.ok && noConsent.error.code).toBe(422)
    const empty = await createInteraction({ question_id: qid, answer: '   ', consent: true, idempotencyKey: k() })
    expect(!empty.ok && empty.error.code).toBe(400)
    const long = await createInteraction({ question_id: qid, answer: 'x'.repeat(501), consent: true, idempotencyKey: k() })
    expect(!long.ok && long.error.code).toBe(400)
    expect((await createInteraction({ question_id: qid, answer: 'x'.repeat(500), consent: true, idempotencyKey: k() })).ok).toBe(true)
    expect(readDb().interactions).toHaveLength(1)
  })

  it('a retried submit with the same idempotency key creates one interaction', async () => {
    await pairedCouple()
    const key = k()
    const qid = QUESTIONS[0].question_id
    const r1 = await createInteraction({ question_id: qid, answer: 'once', consent: true, idempotencyKey: key })
    const r2 = await createInteraction({ question_id: qid, answer: 'once', consent: true, idempotencyKey: key })
    expect(r1).toEqual(r2)
    expect(readDb().interactions).toHaveLength(1)
    expect(readDb().couples[0].daily_counter.count).toBe(1)
  })

  it('offline submit fails without side effects and succeeds on retry with the same key', async () => {
    await pairedCouple()
    const key = k()
    const qid = QUESTIONS[0].question_id
    await setSimulatedOffline(true)
    const off = await createInteraction({ question_id: qid, answer: 'queued', consent: true, idempotencyKey: key })
    expect(!off.ok && off.error.code).toBe(503)
    expect(readDb().interactions).toHaveLength(0)
    await setSimulatedOffline(false)
    expect((await createInteraction({ question_id: qid, answer: 'queued', consent: true, idempotencyKey: key })).ok).toBe(true)
    expect((await createInteraction({ question_id: qid, answer: 'queued', consent: true, idempotencyKey: key })).ok).toBe(true)
    expect(readDb().interactions).toHaveLength(1)
  })

  it('rejects a duplicate open question and points to the existing interaction', async () => {
    await pairedCouple()
    const first = await startMoment('a', QUESTIONS[0].question_id)
    await switchUser('B')
    const dup = await createInteraction({ question_id: QUESTIONS[0].question_id, answer: 'b', consent: true, idempotencyKey: k() })
    expect(!dup.ok && dup.error.code).toBe(409)
    expect(!dup.ok && dup.error.interaction_id).toBe(first.interaction_id)
  })

  it('drafts stay on the device that wrote them', async () => {
    await pairedCouple()
    await saveDraft('q:x', 'my private draft')
    await switchUser('B')
    expect((await getDraft('q:x')).ok && (await getDraft('q:x'))).toEqual({ ok: true, data: '' })
    await switchUser('A')
    expect(await getDraft('q:x')).toEqual({ ok: true, data: 'my private draft' })
  })
})

describe('answering, story and retention (acceptance 5, 6, 8)', () => {
  it('partner answer completes with an intent-matched story; first responder is notified; answers purge after 24h', async () => {
    await pairedCouple()
    const view = await startMoment('A rainy walk', QUESTIONS[0].question_id)
    await switchUser('B')
    const r = await respondToInteraction({ interaction_id: view.interaction_id, answer: 'Hot chai after', consent: true, idempotencyKey: k() })
    expect(r.ok && r.data.status).toBe('generating')
    await flush()
    const i = readDb().interactions[0]
    expect(i.status).toBe('completed')
    const story = readDb().stories[0]
    expect(story.text).toBe(FALLBACK_STORIES.memory)
    expect(story.is_fallback).toBe(true)
    expect((await getStory(story.story_id)).ok).toBe(true)
    // story ready goes to the initiator only
    await switchUser('A')
    const aNotes = await listNotifications()
    expect(aNotes.ok && aNotes.data.filter((n) => n.type === 'story_ready')).toHaveLength(1)
    await switchUser('B')
    const bNotes = await listNotifications()
    expect(bNotes.ok && bNotes.data.filter((n) => n.type === 'story_ready')).toHaveLength(0)
    // raw answers are kept for 24h, then hard-deleted
    expect(readDb().responses.every((x) => x.text_or_choice)).toBe(true)
    await advanceClock(24)
    expect(readDb().responses.every((x) => x.text_or_choice === null && x.status === 'deleted')).toBe(true)
    // topic retires for the couple
    await switchUser('A')
    const next = await getNextMoment('remember_us')
    expect(next.ok && next.data.kind === 'question' && next.data.question.question_id).not.toBe(QUESTIONS[0].question_id)
  })

  it('decline closes the moment and deletes answers immediately', async () => {
    await pairedCouple()
    const view = await startMoment('to be declined')
    await switchUser('B')
    const d = await declineInteraction({ interaction_id: view.interaction_id, idempotencyKey: k() })
    expect(d.ok && d.data.status).toBe('declined')
    expect(readDb().responses[0].text_or_choice).toBeNull()
    expect(readDb().stories).toHaveLength(0)
  })

  it('expiry after expiry_days deletes answers', async () => {
    await pairedCouple()
    await startMoment('will expire')
    await advanceClock(120)
    expect(readDb().interactions[0].status).toBe('awaiting_partner')
    await advanceClock(24)
    await advanceClock(24)
    expect(readDb().interactions[0].status).toBe('expired')
    expect(readDb().responses[0].text_or_choice).toBeNull()
    await switchUser('B')
    const r = await respondToInteraction({ interaction_id: readDb().interactions[0].interaction_id, answer: 'late', consent: true, idempotencyKey: k() })
    expect(!r.ok && r.error.code).toBe(410)
  })

  it('initiator withdraw discards both answers; question returns after 30 days', async () => {
    await pairedCouple()
    const view = await startMoment('changed my mind', QUESTIONS[0].question_id)
    const w = await withdrawInteraction({ interaction_id: view.interaction_id, idempotencyKey: k() })
    expect(w.ok && w.data.status).toBe('withdrawn')
    expect(readDb().responses[0].text_or_choice).toBeNull()
    const again = await createInteraction({ question_id: QUESTIONS[0].question_id, answer: 'x', consent: true, idempotencyKey: k() })
    expect(!again.ok && again.error.code).toBe(409)
    for (let i = 0; i < 5; i++) await advanceClock(168)
    expect((await createInteraction({ question_id: QUESTIONS[0].question_id, answer: 'x', consent: true, idempotencyKey: k() })).ok).toBe(true)
  })

  it('partner withdraw before generation returns the moment to waiting; after generation it is refused', async () => {
    await pairedCouple()
    const view = await startMoment('first')
    await switchUser('B')
    // Simulate the window where B has answered but the story is still being written.
    transact((db) => {
      db.interactions[0].status = 'generating'
      db.responses.push({ ...db.responses[0], response_id: 'r_b', user_id: db.slots.B.user_id!, text_or_choice: 'b answer' })
    })
    const early = await withdrawInteraction({ interaction_id: view.interaction_id, idempotencyKey: k() })
    expect(early.ok && early.data.status).toBe('awaiting_partner')
    expect(readDb().responses.find((r) => r.response_id === 'r_b')!.text_or_choice).toBeNull()
    expect(readDb().responses[0].text_or_choice).toBe('first')
    await respondToInteraction({ interaction_id: view.interaction_id, answer: 'second', consent: true, idempotencyKey: k() })
    await flush()
    const after = await withdrawInteraction({ interaction_id: view.interaction_id, idempotencyKey: k() })
    expect(!after.ok && after.error.code).toBe(410)
  })

  it('sends one reminder after reminder_delay_hours, deferred out of quiet hours, never a second', async () => {
    await pairedCouple()
    await startMoment('remind me')
    await advanceClock(24) // 12:00 UTC next day: inside 09–21 window
    let notes = (await partnerNotes()).filter((n) => n.type === 'pending_reminder')
    expect(notes).toHaveLength(1)
    expect(notes[0].body).not.toContain('?')
    await advanceClock(24)
    await advanceClock(24)
    notes = (await partnerNotes()).filter((n) => n.type === 'pending_reminder')
    expect(notes).toHaveLength(1)
  })

  it('defers a reminder that falls in quiet hours until they end', async () => {
    await pairedCouple()
    await advanceClock(1)
    await advanceClock(1) // ~14:00 UTC
    for (let i = 0; i < 9; i++) await advanceClock(1) // ~23:00 UTC: quiet hours
    await startMoment('late night')
    await advanceClock(24) // reminder due at 23:00 next day: quiet
    const r = readDb().notifications.find((n) => n.type === 'pending_reminder')!
    expect(new Date(r.deliver_at).getUTCHours()).toBe(9)
    expect((await partnerNotes()).filter((n) => n.type === 'pending_reminder')).toHaveLength(0)
    await advanceClock(24)
    expect((await partnerNotes()).filter((n) => n.type === 'pending_reminder')).toHaveLength(1)
  })
})

describe('daily cap and skips (acceptance 9)', () => {
  it('with the cap on, the 4th new moment in a day is refused gently but replies still work; skips do not count', async () => {
    await pairedCouple()
    await updateFlags({ cap_enabled: true })
    const first = await startMoment('one')
    for (let i = 0; i < 4; i++) {
      const next = await getNextMoment(null)
      if (next.ok && next.data.kind === 'question') await skipMoment({ question_id: next.data.question.question_id, idempotencyKey: k() })
    }
    await startMoment('two')
    await switchUser('B')
    await startMoment('three')
    const capped = await getNextMoment(null)
    expect(capped.ok && capped.data.kind).toBe('cap_reached')
    const fourth = await createInteraction({ question_id: QUESTIONS[5].question_id, answer: 'four', consent: true, idempotencyKey: k() })
    expect(!fourth.ok && fourth.error.code).toBe(409)
    // reply to an open moment is still allowed
    const reply = await respondToInteraction({ interaction_id: first.interaction_id, answer: 'reply', consent: true, idempotencyKey: k() })
    expect(reply.ok).toBe(true)
    const explore = await getExplore()
    expect(explore.ok && explore.data.cap_reached).toBe(true)
    // next local day the allowance resets
    await advanceClock(24)
    const fresh = await getNextMoment(null)
    expect(fresh.ok && fresh.data.kind).toBe('question')
  })

  it('declined, expired and withdrawn moments still count on their creation day', async () => {
    await pairedCouple()
    await updateFlags({ cap_enabled: true, daily_cap: 1 })
    const v = await startMoment('x')
    await withdrawInteraction({ interaction_id: v.interaction_id, idempotencyKey: k() })
    const next = await getNextMoment(null)
    expect(next.ok && next.data.kind).toBe('cap_reached')
  })

  it('shows a pacing label only when cap_enabled and show_pacing_label are both on', async () => {
    await pairedCouple()
    let n = await getNextMoment(null)
    expect(n.ok && n.data.kind === 'question' && n.data.pacing.show_label).toBe(false)
    await updateFlags({ show_pacing_label: true })
    n = await getNextMoment(null)
    expect(n.ok && n.data.kind === 'question' && n.data.pacing.show_label).toBe(false)
    await updateFlags({ cap_enabled: true })
    n = await getNextMoment(null)
    expect(n.ok && n.data.kind === 'question' && n.data.pacing).toEqual({ show_label: true, remaining: 3 })
  })

  it('limits skips to 5 per category per user per day', async () => {
    await pairedCouple()
    await updateFlags({ cap_enabled: false })
    for (let i = 0; i < 5; i++) {
      const next = await getNextMoment('lets_play')
      expect(next.ok && next.data.kind).toBe('question')
      if (next.ok && next.data.kind === 'question') expect((await skipMoment({ question_id: next.data.question.question_id, idempotencyKey: k() })).ok).toBe(true)
    }
    const after = await getNextMoment('lets_play')
    expect(after.ok && after.data.kind).toBe('skip_limit')
    expect(readDb().interactions).toHaveLength(0)
  })
})

describe('selection rules', () => {
  const base = (over: Partial<SelectionContext> = {}): SelectionContext => ({
    questions: QUESTIONS,
    initiatorId: 'u1',
    coupleId: 'c1',
    householdAgeBand: '7_12',
    initiatorDepth: 'deeper',
    mutedCategories: [],
    history: [],
    openQuestionIds: [],
    lastIntensity: null,
    recentCategories: [],
    nowMs: Date.now(),
    ...over,
  })

  it('respects depth', () => {
    const q = selectQuestion(base({ initiatorDepth: 'light' }), { category: 'our_journey' })
    expect(q).toBeNull() // Our Journey has no low-intensity questions
    expect(selectQuestion(base({ initiatorDepth: 'mix' }), { category: 'our_journey' })!.emotional_intensity).toBe('medium')
  })

  it('never offers two high-intensity prompts in a row', () => {
    const ctx = base({ lastIntensity: 'high', history: [] })
    const qs = ['q_jny_1', 'q_jny_3'].map((id) => ({ user_id: 'u1', couple_id: 'c1', question_id: id, topic_id: id.replace('q_', 't_'), status: 'answered' as const, delivered_at: null, answered_at: null, updated_at: new Date().toISOString() }))
    const q = selectQuestion({ ...ctx, history: qs }, { category: 'our_journey' })
    expect(q?.emotional_intensity).not.toBe('high')
  })

  it('excludes muted categories and uses general questions for "other"', () => {
    expect(selectQuestion(base({ mutedCategories: ['lets_play'] }), { category: 'lets_play' })).toBeNull()
    const silly = QUESTIONS.find((q) => q.text.startsWith("What's the silliest"))!
    const ctxOther = base({ householdAgeBand: 'other' })
    const pool = QUESTIONS.filter((q) => q.category === 'lets_play')
    expect(pool).toContain(silly)
    const answeredOthers = pool.filter((q) => q !== silly).map((q) => ({ user_id: 'u1', couple_id: 'c1', question_id: q.question_id, topic_id: q.topic_id, status: 'answered' as const, delivered_at: null, answered_at: null, updated_at: new Date().toISOString() }))
    expect(selectQuestion({ ...ctxOther, history: answeredOthers }, { category: 'lets_play' })).toBeNull()
    expect(selectQuestion({ ...base(), history: answeredOthers }, { category: 'lets_play' })?.question_id).toBe(silly.question_id)
  })

  it('rotates categories against the recent mix', () => {
    const q = selectQuestion(base({ recentCategories: ['remember_us', 'remember_us', 'our_journey'] }))
    expect(['little_appreciations', 'what_we_need', 'lets_play']).toContain(q!.category)
  })

  it('explored-all when everything in a category is used', async () => {
    await pairedCouple({ depth: 'light' })
    const r = await getNextMoment('our_journey')
    expect(r.ok && r.data.kind).toBe('explored_all')
  })
})

describe('app suggestions', () => {
  it('at most one per person per day, generic copy', async () => {
    await pairedCouple()
    await runScheduledJobs()
    await runScheduledJobs()
    const sug = readDb().notifications.filter((n) => n.type === 'app_suggestion')
    expect(sug.length).toBe(2) // one each
    expect(sug[0].body).toMatch(/^A little .+ moment is here when you are\.$/)
  })

  it('respects the app suggestions toggle', async () => {
    await pairedCouple()
    readDb().notifications.length = 0
    await updatePreferences({
      notification_prefs: { window: { start: '09:00', end: '21:00' }, quiet_hours: { start: '22:00', end: '07:00' }, toggles: { app_suggestions: false, partner_invitations: true, pending_reminders: true } },
      idempotencyKey: k(),
    })
    await advanceClock(24)
    const mine = readDb().notifications.filter((n) => n.type === 'app_suggestion' && n.user_id === readDb().slots.A.user_id)
    expect(mine).toHaveLength(0)
  })
})
