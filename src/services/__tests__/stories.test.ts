import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminListReports,
  adminReviewReport,
  advanceClock,
  createInteraction,
  getHome,
  getInteraction,
  getStory,
  listAnalytics,
  listNotifications,
  reactToStory,
  regenerateStory,
  reportStory,
  respondToInteraction,
  saveStory,
  switchUser,
  updateMe,
} from '../api'
import { setAiClient, type AiClient, type StoryRequest } from '../gemini'
import { phraseFlag } from '../safety'
import { configureStorage, createMemoryAdapter, readDb } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { FALLBACK_STORIES } from '../../data/fallbackStories'
import { QUESTION_SUGGESTIONS } from '../../data/suggestions'
import { storyLabels, validateStory } from '../../domain/rules/storyValidation'
import { k, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 30))
const memoryQ = QUESTIONS.find((q) => q.story_intent === 'memory')!
const futureQ = QUESTIONS.find((q) => q.story_intent === 'future_plan')!

function fakeAi(opts: { stories?: (req: StoryRequest, call: number) => { story_text: string; intent_used: string; suggestion?: string } | Error; distress?: (t: string) => boolean | Error } = {}) {
  const calls: StoryRequest[] = []
  const classified: string[] = []
  const client: AiClient = {
    available: true,
    async generateStory(req) {
      calls.push(req)
      const out = opts.stories ? opts.stories(req, calls.length) : { story_text: `${req.parent_a_label}, ${req.parent_b_label}, I heard you both remember it. I like that you each kept a piece.`, intent_used: req.story_intent }
      if (out instanceof Error) throw out
      return { output: out, model: 'fake-flash' }
    },
    async classifyDistress(t) {
      classified.push(t)
      const r = opts.distress ? opts.distress(t) : false
      if (r instanceof Error) throw r
      return r
    },
  }
  setAiClient(client)
  return { calls, classified }
}

async function bothAnswer(q = memoryQ, a = 'Dancing in the kitchen', b = 'The rain on the window') {
  const c = await createInteraction({ question_id: q.question_id, answer: a, consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  const r = await respondToInteraction({ interaction_id: c.data.interaction_id, answer: b, consent: true, idempotencyKey: k() })
  if (!r.ok) throw new Error(r.error.message)
  await flush()
  return c.data.interaction_id
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('a small idea for the two of them', () => {
  const story = (req: StoryRequest) => `${req.parent_a_label}, ${req.parent_b_label}, I heard you both remember it. I like that you each kept a piece.`

  it("shows Gemini's idea when it passes the checks, in the same call as the story", async () => {
    const ai = fakeAi({ stories: (req) => ({ story_text: story(req), intent_used: req.story_intent, suggestion: 'Maybe dance in the kitchen again one evening this week.' }) })
    await pairedCouple()
    await bothAnswer()
    expect(ai.calls).toHaveLength(1)
    const s = readDb().stories[0]
    expect(s.suggestion).toBe('Maybe dance in the kitchen again one evening this week.')
    expect(s.suggestion_is_fallback).toBe(false)
    expect((await getStory(s.story_id)).ok && (await getStory(s.story_id))).toMatchObject({ data: { suggestion: s.suggestion } })
  })

  it('uses the ready-written idea for that question when Gemini gives advice, a link or nothing', async () => {
    for (const bad of ['You should see a therapist together.', 'Download the CoupleTime app at www.x.com', undefined]) {
      configureStorage(createMemoryAdapter())
      fakeAi({ stories: (req) => ({ story_text: story(req), intent_used: req.story_intent, ...(bad ? { suggestion: bad } : {}) }) })
      await pairedCouple()
      await bothAnswer()
      const s = readDb().stories[0]
      expect(s.is_fallback).toBe(false)
      expect(s.suggestion).toBe(QUESTION_SUGGESTIONS[memoryQ.question_id])
      expect(s.suggestion_is_fallback).toBe(true)
    }
  })

  it('a backup-library story still comes with the idea for that question', async () => {
    fakeAi({ stories: () => new Error('{"code":503}') })
    await pairedCouple()
    await bothAnswer()
    const s = readDb().stories[0]
    expect(s.is_fallback).toBe(true)
    expect(s.suggestion).toBe(QUESTION_SUGGESTIONS[memoryQ.question_id])
  })

  it('every question has its own ready-written idea', () => {
    for (const q of QUESTIONS) expect([q.question_id, !!QUESTION_SUGGESTIONS[q.question_id]]).toEqual([q.question_id, true])
  })
})

describe('story generation (acceptance 5 & 6)', () => {
  it('uses a valid Gemini story with both labels, and sends only the minimum fields', async () => {
    const ai = fakeAi()
    await pairedCouple()
    await bothAnswer()
    const s = readDb().stories[0]
    expect(s.is_fallback).toBe(false)
    expect(s.model_name).toBe('fake-flash')
    expect(s.text).toContain('Mama')
    expect(s.text).toContain('Amma')
    expect(readDb().interactions[0].status).toBe('completed')
    expect(Object.keys(ai.calls[0]).sort()).toEqual(
      ['answer_from_parent_a', 'answer_from_parent_b', 'context', 'parent_a_label', 'parent_b_label', 'question', 'story_intent', 'story_pattern'].sort(),
    )
    const sent = JSON.stringify(ai.calls[0])
    expect(sent).not.toMatch(/a@x\\.com|b@x\\.com|usr_|cpl_|int_|7_12/)
    expect(ai.calls[0].answer_from_parent_a).toBe('Dancing in the kitchen')
  })

  it('retries once on invalid output, then succeeds', async () => {
    const ai = fakeAi({
      stories: (req, n) =>
        n === 1 ? { story_text: 'Too short.', intent_used: req.story_intent } : { story_text: `${req.parent_a_label} and ${req.parent_b_label}, I heard you remember it. I liked hearing it.`, intent_used: req.story_intent },
    })
    await pairedCouple()
    await bothAnswer()
    expect(ai.calls).toHaveLength(2)
    expect(readDb().stories[0].is_fallback).toBe(false)
  })

  it('falls back after two invalid outputs; the interaction still completes', async () => {
    const ai = fakeAi({ stories: (req) => ({ story_text: 'Papa and Mumma will go to Paris. They should rest more.', intent_used: req.story_intent }) })
    await pairedCouple()
    await bothAnswer()
    expect(ai.calls).toHaveLength(2)
    const s = readDb().stories[0]
    expect(s.is_fallback).toBe(true)
    expect(s.text).toBe(FALLBACK_STORIES.memory)
    expect(readDb().interactions[0].status).toBe('completed')
    const log = await listAnalytics()
    expect(log.ok && log.data.some((e) => e.name === 'story_fallback_used')).toBe(true)
    expect(JSON.stringify(log)).not.toMatch(/Dancing|rain on the window/)
  })

  it('falls back on call errors (e.g. timeout)', async () => {
    fakeAi({ stories: () => new Error('timeout') })
    await pairedCouple()
    await bothAnswer()
    expect(readDb().stories[0].is_fallback).toBe(true)
  })

  it('passes first names when labels match case-insensitively', async () => {
    const ai = fakeAi()
    await pairedCouple()
    await switchUser('B')
    await updateMe({ parent_label: 'mama', idempotencyKey: k() })
    await switchUser('A')
    await bothAnswer()
    expect([ai.calls[0].parent_a_label, ai.calls[0].parent_b_label]).toEqual(['Mama Priya', 'mama Anika'])
  })
})

describe('story validation rules', () => {
  const base = {
    intent_used: 'memory',
    story_intent: 'memory' as const,
    labels: ['Mama', 'Baba'] as [string, string],
    question: memoryQ.text,
    context: memoryQ.context,
    answers: ['We danced in the kitchen', 'The rain at Lonavala'] as [string, string],
  }
  it('accepts the spec few-shot style', () => {
    expect(validateStory({ ...base, text: 'Mama, Baba, I heard that you both remember the rainy evening in the kitchen. One of you remembers the music, the other remembers laughing. I like that you each keep a different piece of it.' })).toEqual([])
  })
  it('enforces 2–4 sentences, length, labels and intent', () => {
    expect(validateStory({ ...base, text: 'Mama and Baba remembered.' })).toContain('sentence_count')
    expect(validateStory({ ...base, text: 'Mama remembered. Baba did too. ' + 'x'.repeat(700) })).toContain('too_long')
    expect(validateStory({ ...base, text: 'Mama remembered it. I liked it.' })).toContain('missing_label')
    expect(validateStory({ ...base, intent_used: 'present', text: 'Mama remembered it. Baba did too.' })).toContain('intent_mismatch')
  })
  it('rejects labels that were not supplied, invented names and prohibited content', () => {
    expect(validateStory({ ...base, text: 'Mama and Baba remembered it. Papa was there too.' })).toContain('foreign_label')
    expect(validateStory({ ...base, text: 'Mama and Baba remembered it. Aunt Meera was there in Goa.' })).toContain('invented_name')
    expect(validateStory({ ...base, text: 'Mama and Baba remembered it. The trip to Lonavala was lovely.' })).toEqual([])
    expect(validateStory({ ...base, text: 'Mama and Baba remembered it. You should see a therapist.' })).toContain('prohibited_content')
  })
  it('future_plan must look forward and not narrate a memory; memory must not be only future', () => {
    const fp = { ...base, story_intent: 'future_plan' as const, intent_used: 'future_plan' }
    expect(validateStory({ ...fp, text: 'Mama is leaning towards a walk. Baba might like a long breakfast.' })).toEqual([])
    expect(validateStory({ ...fp, text: 'Mama went for a walk. Baba had breakfast.' })).toContain('future_plan_not_forward')
    expect(validateStory({ ...fp, text: 'Mama remembered a walk. Baba might go again.' })).toContain('future_plan_narrates_past')
    expect(validateStory({ ...base, text: 'Mama will dance. Baba will sing.' })).toContain('memory_only_future')
  })
  it('storyLabels adds first names only when labels match', () => {
    expect(storyLabels({ label: 'Mama', name: 'Priya S' }, { label: 'Baba', name: 'Arun' })).toEqual(['Mama', 'Baba'])
    expect(storyLabels({ label: 'Mama', name: 'Priya S' }, { label: 'MAMA', name: 'Anika' })).toEqual(['Mama Priya', 'MAMA Anika'])
  })
  it('a future_plan question produces forward-looking language end to end', async () => {
    fakeAi({ stories: (req) => ({ story_text: `${req.parent_a_label} is leaning towards a picnic. ${req.parent_b_label} might like a film. I wonder if there's room for both.`, intent_used: req.story_intent }) })
    await pairedCouple()
    await bothAnswer(futureQ, 'A picnic', 'A film')
    const s = readDb().stories[0]
    expect(s.is_fallback).toBe(false)
    expect(s.text).toMatch(/leaning|might|wonder/)
  })
})

describe('distress safety path (acceptance 7)', () => {
  it('phrase layer catches the starter phrases, including curly apostrophes', () => {
    expect(phraseFlag('Honestly I can’t cope some days')).toBe(true)
    expect(phraseFlag('I feel hopeless')).toBe(true)
    expect(phraseFlag('He hit me last week')).toBe(true)
    expect(phraseFlag('We hit the road early, white noise helped')).toBe(false)
    expect(phraseFlag('Pancakes in bed')).toBe(false)
  })

  it('partner flagged: no story, support only for them, neutral line for the other, no text stored', async () => {
    const ai = fakeAi()
    await pairedCouple()
    const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Our kitchen dance', consent: true, idempotencyKey: k() })
    if (!c.ok) throw new Error()
    await switchUser('B')
    const r = await respondToInteraction({ interaction_id: c.data.interaction_id, answer: 'I feel worthless lately', consent: true, idempotencyKey: k() })
    await flush()
    expect(r.ok && r.data.status).toBe('safety_held')
    expect(r.ok && r.data.show_support).toBe(true)
    expect(ai.calls).toHaveLength(0)
    expect(readDb().stories).toHaveLength(0)
    const dump = JSON.stringify(readDb())
    expect(dump).not.toContain('worthless')
    expect(dump).not.toContain('Our kitchen dance') // other partner's answer deleted too
    const i = readDb().interactions[0]
    expect(i.distress_flag).toBe(true)
    // the other partner: held status, no support, no reason
    await switchUser('A')
    const viewA = await getInteraction(c.data.interaction_id)
    expect(viewA.ok && viewA.data.status).toBe('safety_held')
    expect(viewA.ok && viewA.data.show_support).toBe(false)
    const home = await getHome()
    expect(home.ok && home.data.recent_closed.map((x) => x.status)).toEqual(['safety_held'])
    const notes = await listNotifications()
    expect(JSON.stringify(notes)).not.toMatch(/worthless|distress|support/i)
  })

  it('classifier layer flags too; classifier errors count as not flagged and are logged as metadata', async () => {
    fakeAi({ distress: (t) => t.includes('heavy') })
    await pairedCouple()
    const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Everything feels heavy and grey', consent: true, idempotencyKey: k() })
    expect(c.ok && c.data.status).toBe('safety_held')
    expect(c.ok && c.data.show_support).toBe(true)
    // initiator-flagged: partner is never notified
    await switchUser('B')
    const n = await listNotifications()
    expect(n.ok && n.data.filter((x) => x.type === 'partner_invitation')).toHaveLength(0)
    await switchUser('A')
    fakeAi({ distress: () => new Error('timeout') })
    const ok = await createInteraction({ question_id: QUESTIONS[1].question_id, answer: 'Lazy pancakes', consent: true, idempotencyKey: k() })
    expect(ok.ok && ok.data.status).toBe('awaiting_partner')
    const log = await listAnalytics()
    expect(log.ok && log.data.some((e) => e.name === 'distress_classifier_error')).toBe(true)
  })

  it('purges the distress flag after 30 days', async () => {
    fakeAi()
    await pairedCouple()
    await createInteraction({ question_id: memoryQ.question_id, answer: 'I want to die', consent: true, idempotencyKey: k() })
    expect(readDb().interactions[0].distress_flag).toBe(true)
    for (let d = 0; d < 4; d++) await advanceClock(168)
    expect(readDb().interactions[0].distress_flag).toBe(true)
    await advanceClock(24)
    await advanceClock(24)
    expect(readDb().interactions[0].distress_flag).toBeNull()
    expect(readDb().responses.every((r) => !r.distress_flag)).toBe(true)
  })
})

describe('story actions', () => {
  it('save and react', async () => {
    fakeAi()
    await pairedCouple()
    await bothAnswer()
    const id = readDb().stories[0].story_id
    expect((await saveStory({ story_id: id, idempotencyKey: k() })).ok).toBe(true)
    const r = await reactToStory({ story_id: id, value: '🥹', idempotencyKey: k() })
    expect(r.ok && r.data.my_reaction).toBe('🥹')
    expect((await reactToStory({ story_id: id, value: '👍' as never, idempotencyKey: k() })).ok).toBe(false)
  })

  it('report hides for the reporter only; admin quarantine hides for both; review shows no raw answers', async () => {
    fakeAi()
    await pairedCouple()
    await bothAnswer()
    const id = readDb().stories[0].story_id
    await reportStory({ story_id: id, reason: 'uncomfortable', idempotencyKey: k() })
    expect((await getStory(id)).ok).toBe(false) // B reported
    await switchUser('A')
    expect((await getStory(id)).ok).toBe(true)
    const reports = await adminListReports()
    expect(reports.ok && reports.data).toHaveLength(1)
    expect(JSON.stringify(reports)).not.toMatch(/Dancing|rain on the window/)
    const rep = readDb().reports[0]
    expect(rep).toMatchObject({ reason: 'uncomfortable', prompt_version: 'story-v2', model_name: 'fake-flash', story_intent: 'memory' })
    await adminReviewReport({ report_id: rep.report_id, outcome: 'quarantined', idempotencyKey: k() })
    expect((await getStory(id)).ok).toBe(false)
    expect(readDb().audit_log.at(-1)).toMatchObject({ action: 'report_quarantined' })
  })

  it('regenerates once within 24h; replaces unsaved story; keeps a saved one', async () => {
    let n = 0
    fakeAi({ stories: (req) => ({ story_text: `${req.parent_a_label} and ${req.parent_b_label}, I heard you remember it. Version ${++n} of me liked it.`, intent_used: req.story_intent }) })
    await pairedCouple()
    await bothAnswer()
    const first = readDb().stories[0]
    const r = await regenerateStory({ story_id: first.story_id, idempotencyKey: k() })
    expect(r.ok).toBe(true)
    expect(readDb().stories).toHaveLength(1)
    expect(readDb().stories[0].regenerated_from_id).toBe(first.story_id)
    const again = await regenerateStory({ story_id: readDb().stories[0].story_id, idempotencyKey: k() })
    expect(again.ok).toBe(false)
  })

  it('a saved story is kept when regenerated, and regenerate is refused after 24h', async () => {
    fakeAi()
    await pairedCouple()
    await bothAnswer()
    const first = readDb().stories[0]
    await saveStory({ story_id: first.story_id, idempotencyKey: k() })
    await regenerateStory({ story_id: first.story_id, idempotencyKey: k() })
    expect(readDb().stories).toHaveLength(2)

    configureStorage(createMemoryAdapter())
    await pairedCouple()
    await bothAnswer()
    await advanceClock(24)
    const late = await regenerateStory({ story_id: readDb().stories[0].story_id, idempotencyKey: k() })
    expect(late.ok).toBe(false)
  })
})
