// Prototype diagnostics for AI stories (Prototype Controls → AI). Metadata
// only: no story text, answers or identifiers are shown or sent.

import type { Result } from '../domain/types'
import { DURATION } from './clock'
import { query } from './core'
import { getAiClient, MODELS, type StoryRequest } from './gemini'
import { classifyAiError } from './stories'
import { validateStory } from '../domain/rules/storyValidation'

export interface AiStatus {
  key_configured: boolean
  models: string[]
  recent: { story_id: string; created_at: string; source: string; fallback_reason: string | null }[]
  gemini_count: number
  fallback_count: number
}

export async function getAiStatus(): Promise<Result<AiStatus>> {
  return query((db) => {
    const recent = [...db.stories].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10)
    return {
      key_configured: getAiClient().available,
      models: [...MODELS],
      recent: recent.map((s) => ({
        story_id: s.story_id,
        created_at: s.created_at,
        source: s.is_fallback ? 'fallback library' : s.model_name,
        fallback_reason: s.is_fallback ? (s.fallback_reason ?? 'unknown') : null,
      })),
      gemini_count: db.stories.filter((s) => !s.is_fallback).length,
      fallback_count: db.stories.filter((s) => s.is_fallback).length,
    }
  })
}

/** A made-up couple, so no real answers ever leave the device for a test. */
const TEST_REQUEST: StoryRequest = {
  question: 'What is one small thing you appreciated this week?',
  context: 'Small things count.',
  story_intent: 'appreciation',
  story_pattern: '',
  parent_a_label: 'Mama',
  parent_b_label: 'Papa',
  answer_from_parent_a: 'You made tea when I was tired',
  answer_from_parent_b: 'You let me sleep in on Sunday',
}

export type AiTestResult =
  | { ok: true; model: string; ms: number; passed_checks: boolean; text: string }
  | { ok: false; ms: number; reason: string }

export async function testGemini(): Promise<AiTestResult> {
  const ai = getAiClient()
  const t = Date.now()
  if (!ai.available) return { ok: false, ms: 0, reason: 'no_api_key' }
  try {
    const { output, model } = await ai.generateStory(TEST_REQUEST)
    const problems = validateStory({
      text: output.story_text,
      intent_used: output.intent_used,
      story_intent: 'appreciation',
      labels: ['Mama', 'Papa'],
      question: TEST_REQUEST.question,
      context: TEST_REQUEST.context,
      answers: [TEST_REQUEST.answer_from_parent_a, TEST_REQUEST.answer_from_parent_b],
    })
    return { ok: true, model, ms: Date.now() - t, passed_checks: problems.length === 0, text: output.story_text }
  } catch (e) {
    return { ok: false, ms: Math.min(Date.now() - t, 60 * DURATION.SECOND), reason: classifyAiError(e) }
  }
}
