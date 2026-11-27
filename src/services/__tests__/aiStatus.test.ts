import { beforeEach, describe, expect, it } from 'vitest'
import { createInteraction, getAiStatus, respondToInteraction, switchUser, testGemini } from '../api'
import { setAiClient, type AiClient } from '../gemini'
import { classifyAiError } from '../stories'
import { configureStorage, createMemoryAdapter, readDb } from '../storage'
import { QUESTIONS } from '../../data/questions'
import { k, pairedCouple } from '../../test/helpers'

const flush = () => new Promise((r) => setTimeout(r, 30))
const memoryQ = QUESTIONS.find((q) => q.story_intent === 'memory')!

function failingAi(message: string): AiClient {
  return { available: true, generateStory: () => Promise.reject(new Error(message)), classifyDistress: async () => false }
}

async function makeStory() {
  const c = await createInteraction({ question_id: memoryQ.question_id, answer: 'Dancing', consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  await respondToInteraction({ interaction_id: c.data.interaction_id, answer: 'Rain', consent: true, idempotencyKey: k() })
  await flush()
}

beforeEach(() => configureStorage(createMemoryAdapter()))

describe('AI diagnostics', () => {
  it('names the kind of Gemini failure without any text', () => {
    expect(classifyAiError(new Error('timeout'))).toBe('timeout')
    expect(classifyAiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe('overloaded')
    expect(classifyAiError(new Error('{"error":{"code":429}}'))).toBe('rate_limited')
    expect(classifyAiError(new Error('{"error":{"code":400,"message":"API key not valid"}}'))).toBe('key_rejected')
    expect(classifyAiError(new Error('{"error":{"code":404,"message":"no longer available"}}'))).toBe('model_unavailable')
  })

  it('records why a story fell back, and reports it in the AI status', async () => {
    await pairedCouple()
    setAiClient(failingAi('{"error":{"code":503,"status":"UNAVAILABLE"}}'))
    await makeStory()
    const s = readDb().stories[0]
    expect(s.is_fallback).toBe(true)
    expect(s.fallback_reason).toBe('overloaded,overloaded')
    const st = await getAiStatus()
    expect(st.ok && st.data).toMatchObject({ key_configured: true, fallback_count: 1, gemini_count: 0 })
    expect(st.ok && st.data.recent[0].fallback_reason).toBe('overloaded,overloaded')
  })

  it('says when there is no key', async () => {
    await pairedCouple()
    await makeStory() // test setup installs the offline client
    expect(readDb().stories[0].fallback_reason).toBe('no_api_key')
    expect(await testGemini()).toEqual({ ok: false, ms: 0, reason: 'no_api_key' })
  })

  it('test call uses a made-up sample and reports the model', async () => {
    const seen: string[] = []
    setAiClient({
      available: true,
      generateStory: async (req) => {
        seen.push(JSON.stringify(req))
        return { output: { story_text: 'Mama, you made tea when Papa was tired. Papa, you let Mama sleep in on Sunday. I see you both.', intent_used: 'appreciation' }, model: 'fake-lite' }
      },
      classifyDistress: async () => false,
    })
    const r = await testGemini()
    expect(r).toMatchObject({ ok: true, model: 'fake-lite', passed_checks: true })
    expect(seen[0]).toContain('You made tea when I was tired')
  })
})
