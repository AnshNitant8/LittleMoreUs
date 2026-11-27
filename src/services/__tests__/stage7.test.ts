import { beforeEach, describe, expect, it } from 'vitest'
import {
  advanceClock,
  cancelAccountDeletion,
  createGame,
  createInteraction,
  deleteAccount,
  disconnectCouple,
  getHome,
  getInteraction,
  getNextGame,
  getSession,
  listNotifications,
  listStories,
  requestOtp,
  respondToGame,
  respondToInteraction,
  runScheduledJobs,
  saveStory,
  switchUser,
  updateFlags,
  updatePreferences,
  verifyOtp,
} from '../api'
import { configureStorage, createMemoryAdapter, readDb } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { k, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 30))
const memoryQ = QUESTIONS.find((q) => q.story_intent === 'memory')!

async function startGame(option = 'o1') {
  const g = await getNextGame()
  if (!g.ok || g.data.kind !== 'game') throw new Error('no game')
  const c = await createGame({ question_id: g.data.question.question_id, option_id: option, acknowledged: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  return c.data
}

async function savedStory() {
  const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Dancing in the kitchen', consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  await respondToInteraction({ interaction_id: c.data.interaction_id, answer: 'The rain', consent: true, idempotencyKey: k() })
  await flush()
  const id = readDb().stories[0].story_id
  await saveStory({ story_id: id, idempotencyKey: k() })
  await switchUser('A')
  return id
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('Guess My Answer (acceptance 15)', () => {
  it('reveals only the two selected options, and only after both respond', async () => {
    await pairedCouple()
    const game = await startGame('o2')
    expect(game.type).toBe('game')
    expect(game.options).toHaveLength(4)
    expect(game.reveal).toBeNull()
    await switchUser('B')
    const before = await getInteraction(game.interaction_id)
    expect(before.ok && before.data.reveal).toBeNull()
    expect(before.ok && before.data.my_response).toBeNull()
    expect(JSON.stringify(before.ok && before.data)).not.toMatch(/theirs|"mine"/)
    const r = await respondToGame({ interaction_id: game.interaction_id, option_id: 'o3', acknowledged: true, idempotencyKey: k() })
    if (!r.ok) throw new Error(r.error.message)
    const opts = game.options!
    expect(r.data.reveal).toEqual({ mine: opts[2].label, theirs: opts[1].label, same: false })
    expect(readDb().stories).toHaveLength(0) // no story
    await switchUser('A')
    const a = await getInteraction(game.interaction_id)
    expect(a.ok && a.data.reveal).toEqual({ mine: opts[1].label, theirs: opts[2].label, same: false })
    const home = await getHome()
    expect(home.ok && home.data.recent_games).toHaveLength(1)
    const inbox = await listNotifications(readDb().users[0].user_id)
    expect(inbox.ok && inbox.data.some((n) => n.type === 'game_ready')).toBe(true)
  })

  it('needs the reveal acknowledgement, accepts only listed options, rejects free text and counts as a new interaction', async () => {
    await pairedCouple()
    const g = await getNextGame()
    if (!g.ok || g.data.kind !== 'game') throw new Error()
    const noAck = await createGame({ question_id: g.data.question.question_id, option_id: 'o1', acknowledged: false, idempotencyKey: k() })
    expect(!noAck.ok && noAck.error.code).toBe(422)
    const bad = await createGame({ question_id: g.data.question.question_id, option_id: 'my own words', acknowledged: true, idempotencyKey: k() })
    expect(!bad.ok && bad.error.code).toBe(400)
    const game = await startGame()
    expect(readDb().couples[0].daily_counter.count).toBe(1)
    await switchUser('B')
    const text = await respondToInteraction({ interaction_id: game.interaction_id, answer: 'something', consent: true, idempotencyKey: k() })
    expect(text.ok).toBe(false)
  })

  it('is hidden when the game flag is off', async () => {
    await pairedCouple()
    await updateFlags({ game_enabled: false })
    const g = await getNextGame()
    expect(g.ok && g.data.kind).toBe('disabled')
  })
})

describe('pause and snooze', () => {
  it('stops app suggestions while paused or snoozed', async () => {
    await pairedCouple()
    await updatePreferences({ paused: true, idempotencyKey: k() })
    await switchUser('B')
    await updatePreferences({ snooze_days: 3, idempotencyKey: k() })
    expect(readDb().users[1].preferences.snoozed_until).toBeTruthy()
    const before = readDb().notifications.filter((n) => n.type === 'app_suggestion').length
    await advanceClock(24)
    await runScheduledJobs()
    expect(readDb().notifications.filter((n) => n.type === 'app_suggestion')).toHaveLength(before)
    const bad = await updatePreferences({ snooze_days: 5 as 3, idempotencyKey: k() })
    expect(bad.ok).toBe(false)
  })
})

describe('disconnect (acceptance 12)', () => {
  it('closes open moments and deletes their answers, keeps saved stories for both until either deletes one', async () => {
    await pairedCouple()
    const story = await savedStory()
    const open = await createInteraction({ question_id: QUESTIONS.find((q) => q.story_intent === 'appreciation')!.question_id, answer: 'You were kind', consent: true, idempotencyKey: k() })
    const d = await disconnectCouple({ confirm: true, idempotencyKey: k() })
    expect(d.ok).toBe(true)
    const db = readDb()
    expect(db.couples[0].state).toBe('disconnected')
    if (open.ok) {
      expect(db.interactions.find((i) => i.interaction_id === open.data.interaction_id)!.status).toBe('closed_disconnected')
      expect(db.responses.filter((r) => r.interaction_id === open.data.interaction_id).every((r) => r.text_or_choice === null)).toBe(true)
    }
    const s = await getSession()
    expect(s.ok && s.data.couple).toBeNull()
    expect((await listStories()).ok && readDb().stories.some((x) => x.story_id === story)).toBe(true)
    const mine = await listStories()
    expect(mine.ok && mine.data.saved.map((x) => x.story_id)).toEqual([story])
    await switchUser('B')
    const theirs = await listStories()
    expect(theirs.ok && theirs.data.saved.map((x) => x.story_id)).toEqual([story])
    const inbox = await listNotifications(readDb().users[1].user_id)
    expect(inbox.ok && inbox.data.some((n) => n.type === 'pairing_status')).toBe(true)
  })
})

describe('account deletion (acceptance 13)', () => {
  it('deletes my answers now, keeps shared stories for my partner by default, and erases after 7 days', async () => {
    await pairedCouple()
    const story = await savedStory()
    const open = await createInteraction({ question_id: QUESTIONS.find((q) => q.story_intent === 'appreciation')!.question_id, answer: 'You were kind', consent: true, idempotencyKey: k() })
    expect(open.ok).toBe(true)
    const del = await deleteAccount({ also_delete_shared_stories: false, confirm: true, idempotencyKey: k() })
    expect(del.ok).toBe(true)
    const meId = readDb().users[0].user_id
    expect(readDb().responses.filter((r) => r.user_id === meId).every((r) => r.text_or_choice === null)).toBe(true)
    expect(readDb().slots.A.user_id).toBeNull()
    expect(readDb().couples[0].state).toBe('disconnected')
    for (let i = 0; i < 6; i++) await advanceClock(24)
    expect(readDb().users.some((u) => u.user_id === meId)).toBe(true) // still recoverable
    await advanceClock(24)
    expect(readDb().users.some((u) => u.user_id === meId)).toBe(false)
    await switchUser('B')
    const theirs = await listStories()
    expect(theirs.ok && theirs.data.saved.map((x) => x.story_id)).toEqual([story])
  })

  it('removes shared stories for both at erasure only when the box was ticked', async () => {
    await pairedCouple()
    await savedStory()
    await deleteAccount({ also_delete_shared_stories: true, confirm: true, idempotencyKey: k() })
    expect(readDb().stories).toHaveLength(1)
    await advanceClock(168)
    expect(readDb().stories).toHaveLength(0)
  })

  it('can be cancelled by signing in again within 7 days', async () => {
    await pairedCouple()
    await deleteAccount({ also_delete_shared_stories: false, confirm: true, idempotencyKey: k() })
    await advanceClock(120)
    await requestOtp({ identifier: 'a@x.com', mode: 'login', is_18_confirmed: false, idempotencyKey: k() })
    const v = await verifyOtp({ code: '123456', idempotencyKey: k() })
    expect(v.ok).toBe(true)
    const s = await getSession()
    expect(s.ok && s.data.erase_at).toBeTruthy()
    expect((await cancelAccountDeletion({ idempotencyKey: k() })).ok).toBe(true)
    await advanceClock(168)
    expect(readDb().users.some((u) => u.identifier === 'a@x.com')).toBe(true)
  })
})

describe('reminder with a large clock jump', () => {
  it('still sends the single reminder when the clock jumps straight past expiry', async () => {
    await pairedCouple()
    const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Dancing', consent: true, idempotencyKey: k() })
    expect(c.ok).toBe(true)
    await advanceClock(168)
    const db = readDb()
    expect(db.interactions[0].status).toBe('expired')
    expect(db.notifications.filter((n) => n.type === 'pending_reminder')).toHaveLength(1)
    await advanceClock(24)
    expect(readDb().notifications.filter((n) => n.type === 'pending_reminder')).toHaveLength(1)
  })
})
