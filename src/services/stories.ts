// Story completion (spec Section 8 lifecycle). In this build stage the story
// text is always the neutral, intent-matched fallback; the Gemini composer,
// validation, retry and safety checks plug into `composeStory` next stage.

import { FALLBACK_STORIES } from '../data/fallbackStories'
import type { Result, Story, StoryIntent } from '../domain/types'
import { newId } from '../utils/id'
import { DURATION, nowIso, nowMs } from './clock'
import { fail, mutate, query, requireUser, track } from './core'
import { notify } from './notify'
import { readDb } from './storage'
import type { Db } from './storage'

export const PROMPT_VERSION = 'story-v1'
const RAW_ANSWER_RETENTION_MS = 24 * DURATION.HOUR

interface Composed {
  text: string
  is_fallback: boolean
  model_name: string
}

/** Produce story text for a validated interaction. Stage 4: fallback only. */
async function composeStory(intent: StoryIntent): Promise<Composed> {
  return { text: FALLBACK_STORIES[intent], is_fallback: true, model_name: 'fallback-library' }
}

/** Pre-call validation (spec Section 8). Returns the intent, or null if generation must not run. */
function validateForGeneration(db: Db, interactionId: string): StoryIntent | null {
  const i = db.interactions.find((x) => x.interaction_id === interactionId)
  if (!i || i.status !== 'generating' || !i.story_intent) return null
  const rs = db.responses.filter((r) => r.interaction_id === i.interaction_id && r.status === 'submitted')
  if (rs.length !== 2) return null
  if (rs.some((r) => r.consent_state !== 'given' || r.distress_flag || !r.text_or_choice?.trim())) return null
  return i.story_intent
}

/** Complete an interaction in `generating` with a story. Idempotent per interaction. */
export async function completeWithStory(interactionId: string): Promise<Result<Story | null>> {
  const intent = validateForGeneration(readDb(), interactionId)
  if (!intent) return { ok: true, data: null }
  const composed = await composeStory(intent)
  return mutate(`complete:${interactionId}`, (db) => {
    // Re-check: a partner may have withdrawn while the story was being written.
    if (validateForGeneration(db, interactionId) !== intent) return null
    const i = db.interactions.find((x) => x.interaction_id === interactionId)!
    const couple = db.couples.find((c) => c.couple_id === i.couple_id)!
    const t = nowIso()
    const story: Story = {
      story_id: newId('sty'),
      interaction_id: i.interaction_id,
      couple_id: i.couple_id,
      text: composed.text,
      category: i.category,
      story_intent: intent,
      question_text_snapshot: i.question_text_snapshot,
      created_at: t,
      saved: false,
      is_fallback: composed.is_fallback,
      regenerated_from_id: null,
      regenerate_used: false,
      quarantined: false,
      hidden_for_user_ids: [],
      model_name: composed.model_name,
      prompt_version: PROMPT_VERSION,
    }
    db.stories.push(story)
    i.status = 'completed'
    // Raw answers are hard-deleted 24 hours after generation.
    const deleteAfter = new Date(nowMs() + RAW_ANSWER_RETENTION_MS).toISOString()
    for (const r of db.responses) if (r.interaction_id === i.interaction_id && r.status === 'submitted') r.delete_after = deleteAfter
    // Topic retires for the couple once both have answered.
    for (const uid of couple.member_user_ids) {
      const h = db.question_history.find((x) => x.user_id === uid && x.question_id === i.question_id)
      if (h) {
        h.status = 'retired'
        h.couple_id = couple.couple_id
        h.updated_at = t
      }
    }
    notify(db, {
      user_id: i.first_responder_id,
      type: 'story_ready',
      body: 'Your little story is ready.',
      category: i.category,
      dedupe_key: `story:${i.interaction_id}`,
      timeZone: couple.timezone,
    })
    track(db, 'story_completed', { interaction_id: i.interaction_id, story_id: story.story_id, is_fallback: story.is_fallback, category: i.category })
    return story
  })
}

/** On app load: finish any story whose generation was interrupted. */
export async function resumeGeneration(): Promise<number> {
  const pending = readDb().interactions.filter((i) => i.status === 'generating').map((i) => i.interaction_id)
  for (const id of pending) await completeWithStory(id)
  return pending.length
}

export interface StoryView {
  story_id: string
  interaction_id: string
  text: string
  category: Story['category']
  question_text: string
  created_at: string
  is_fallback: boolean
  saved: boolean
}

export async function getStory(storyId: string): Promise<Result<StoryView>> {
  return query((db) => {
    const me = requireUser(db)
    const s = db.stories.find((x) => x.story_id === storyId)
    if (!s) return fail(404, "We couldn't find this story.")
    const couple = db.couples.find((c) => c.couple_id === s.couple_id)
    // Stories are visible only to the two members of the couple.
    if (!couple || !couple.member_user_ids.includes(me.user_id)) return fail(403, "This story isn't yours to view.")
    if (s.quarantined || s.hidden_for_user_ids.includes(me.user_id)) return fail(404, "This story isn't available.")
    return {
      story_id: s.story_id,
      interaction_id: s.interaction_id,
      text: s.text,
      category: s.category,
      question_text: s.question_text_snapshot,
      created_at: s.created_at,
      is_fallback: s.is_fallback,
      saved: s.saved,
    }
  })
}
