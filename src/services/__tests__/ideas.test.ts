import { beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, answerIdeaCheckin, createInteraction, getHome, respondToInteraction, saveStory, switchUser } from '../api'
import { configureStorage, createMemoryAdapter, readDb, transact } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { IDEA_TIMEFRAMES, QUESTION_SUGGESTIONS, QUESTION_TIMEFRAMES, timeframeFromText } from '../../data/suggestions'
import { ideaDueDay } from '../ideas'
import type { IdeaTimeframe, Story } from '../../domain/types'
import { k, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 30))
const memoryQ = QUESTIONS.find((q) => q.story_intent === 'memory')!

async function makeSavedStory(tf: IdeaTimeframe) {
  await switchUser('A')
  const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Dancing in the kitchen', consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  const r = await respondToInteraction({ interaction_id: c.data.interaction_id, answer: 'The rain on the window', consent: true, idempotencyKey: k() })
  if (!r.ok) throw new Error(r.error.message)
  await flush()
  const id = readDb().stories.find((s) => s.interaction_id === c.data.interaction_id)!.story_id
  await saveStory({ story_id: id, idempotencyKey: k() })
  transact((db) => {
    db.stories.find((s) => s.story_id === id)!.suggestion_timeframe = tf
  })
  return id
}

async function homeCheckin() {
  const h = await getHome()
  if (!h.ok) throw new Error(h.error.message)
  return h.data.idea_checkin
}

async function homeReminder() {
  const h = await getHome()
  if (!h.ok) throw new Error(h.error.message)
  return h.data.idea_reminder
}

async function days(n: number) {
  for (let i = 0; i < n; i++) await advanceClock(24)
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('idea timeframes', () => {
  it('every ready-written idea has a timeframe', () => {
    for (const id of Object.keys(QUESTION_SUGGESTIONS)) expect(IDEA_TIMEFRAMES).toContain(QUESTION_TIMEFRAMES[id])
  })

  it('guesses a timeframe from the words of older ideas', () => {
    expect(timeframeFromText('Say thank you, today if you can.')).toBe('today')
    expect(timeframeFromText('Try it this weekend.')).toBe('weekend')
    expect(timeframeFromText('Pick one evening this month.')).toBe('month')
    expect(timeframeFromText('Choose one small way this week.')).toBe('week')
    expect(timeframeFromText('Next time you sit together.')).toBe('few_days')
  })

  it('asks after the timeframe: next day, the Monday after a weekend, a week, a month', () => {
    const base = { suggestion: 'x', created_at: '2026-11-25T10:00:00Z' } as Story // a Wednesday
    const due = (tf: IdeaTimeframe) => ideaDueDay({ ...base, suggestion_timeframe: tf }, 'UTC')
    expect(due('today')).toBe('2026-11-26')
    expect(due('few_days')).toBe('2026-11-28')
    expect(due('weekend')).toBe('2026-11-30')
    expect(due('week')).toBe('2026-12-02')
    expect(due('month')).toBe('2026-12-25')
    expect(ideaDueDay({ ...base, suggestion_timeframe: 'weekend', created_at: '2026-11-30T10:00:00Z' }, 'UTC')).toBe('2026-12-07')
    expect(ideaDueDay({ ...base, suggestion: null }, 'UTC')).toBeNull()
  })
})

describe('Did you two try it?', () => {
  it('waits for a "this week" idea to pass a week, then a yes marks it for both partners', async () => {
    await pairedCouple()
    const id = await makeSavedStory('week')
    expect(await homeCheckin()).toBeNull()
    await days(6)
    expect(await homeCheckin()).toBeNull()
    await days(1)
    expect(await homeCheckin()).toMatchObject({ story_id: id, asked_before: false })
    const r = await answerIdeaCheckin({ story_id: id, tried: true, idempotencyKey: k() })
    expect(r.ok && r.data.status).toBe('tried')
    expect(await homeCheckin()).toBeNull()
    await switchUser('A')
    expect(await homeCheckin()).toBeNull()
    expect(readDb().stories.find((s) => s.story_id === id)!.idea_checkin?.status).toBe('tried')
  })

  it('"Not yet" asks once more later, and a second "Not yet" stops asking', async () => {
    await pairedCouple()
    const id = await makeSavedStory('today')
    await days(1)
    expect(await homeCheckin()).toMatchObject({ story_id: id })
    await answerIdeaCheckin({ story_id: id, tried: false, idempotencyKey: k() })
    expect(await homeCheckin()).toBeNull()
    await days(2)
    expect(await homeCheckin()).toBeNull()
    await days(1)
    expect(await homeCheckin()).toMatchObject({ story_id: id, asked_before: true })
    const r = await answerIdeaCheckin({ story_id: id, tried: false, idempotencyKey: k() })
    expect(r.ok && r.data.status).toBe('closed')
    await days(30)
    expect(await homeCheckin()).toBeNull()
  })

  it('a "this month" idea is not asked about in the first weeks', async () => {
    await pairedCouple()
    const id = await makeSavedStory('month')
    await days(29)
    expect(await homeCheckin()).toBeNull()
    await days(1)
    expect(await homeCheckin()).toMatchObject({ story_id: id })
  })
})

describe('gentle reminder of weekly and monthly ideas', () => {
  it('shows on the days after the story, until the check-in, and not on the story day', async () => {
    await pairedCouple()
    const id = await makeSavedStory('week')
    expect(await homeReminder()).toBeNull()
    await days(1)
    expect(await homeReminder()).toMatchObject({ story_id: id, timeframe: 'week', days_left: 6 })
    await days(5)
    expect(await homeReminder()).toMatchObject({ days_left: 1 })
    await days(1)
    expect(await homeReminder()).toBeNull()
    expect(await homeCheckin()).toMatchObject({ story_id: id })
  })

  it('stops once they say they did it, and there is then no check-in', async () => {
    await pairedCouple()
    const id = await makeSavedStory('month')
    await days(3)
    expect(await homeReminder()).toMatchObject({ story_id: id, timeframe: 'month' })
    await answerIdeaCheckin({ story_id: id, tried: true, idempotencyKey: k() })
    expect(await homeReminder()).toBeNull()
    await days(30)
    expect(await homeCheckin()).toBeNull()
  })

  it('is not shown for today or weekend ideas', async () => {
    await pairedCouple()
    await makeSavedStory('few_days')
    await days(1)
    expect(await homeReminder()).toBeNull()
  })
})
