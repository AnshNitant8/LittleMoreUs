// Story generation and story actions (spec Sections 8, 13).
// Gemini is called only through ./gemini. Validation is deterministic; one
// retry, then the neutral fallback. A fallback still completes the moment.

import { FALLBACK_STORIES } from '../data/fallbackStories'
import { REGENERATE_WINDOW_HOURS } from '../domain/constants'
import { storyLabels, validateStory, type StoryProblem } from '../domain/rules/storyValidation'
import type { Interaction, ReactionValue, Report, ReportReason, Result, Story, StoryIntent } from '../domain/types'
import { ALL_QUESTIONS } from '../data/questions'
import { newId } from '../utils/id'
import { DURATION, nowIso, nowMs } from './clock'
import { cachedResult, fail, mutate, query, requireUser, track } from './core'
import { storyLocked } from './entitlement'
import { getAiClient, type StoryRequest } from './gemini'
import { notify } from './notify'
import { readDb } from './storage'
import type { Db } from './storage'

export const PROMPT_VERSION = 'story-v1'
export const REACTIONS: ReactionValue[] = ['❤️', '😂', '🥹', '🌟']
const RAW_ANSWER_RETENTION_MS = 24 * DURATION.HOUR

interface Composed {
  text: string
  is_fallback: boolean
  model_name: string
}

interface Prepared {
  intent: StoryIntent
  request: StoryRequest
  labels: [string, string]
}

/**
 * Pre-call validation (spec Section 8) and the minimum payload. Returns null
 * if generation must not run. Never includes ids, age band or history.
 */
function prepare(db: Db, interactionId: string, opts: { allowCompleted?: boolean } = {}): Prepared | null {
  const i = db.interactions.find((x) => x.interaction_id === interactionId)
  if (!i || !i.story_intent) return null
  if (i.status !== 'generating' && !(opts.allowCompleted && i.status === 'completed')) return null
  const rs = db.responses.filter((r) => r.interaction_id === i.interaction_id && r.status === 'submitted')
  if (rs.length !== 2) return null
  if (rs.some((r) => r.consent_state !== 'given' || r.distress_flag || !r.text_or_choice?.trim())) return null
  const q = ALL_QUESTIONS.find((x) => x.question_id === i.question_id)
  if (!q || q.version_id !== i.question_version_id) {
    track(db, 'story_precheck_failed', { interaction_id: i.interaction_id, reason: 'question_mismatch' })
    return null
  }
  const initiatorResp = rs.find((r) => r.user_id === i.initiator_id)
  const partnerResp = rs.find((r) => r.user_id !== i.initiator_id)
  if (!initiatorResp || !partnerResp) return null
  const ua = db.users.find((u) => u.user_id === initiatorResp.user_id)
  const ub = db.users.find((u) => u.user_id === partnerResp.user_id)
  if (!ua || !ub) return null
  const labels = storyLabels({ label: ua.parent_label, name: ua.display_name }, { label: ub.parent_label, name: ub.display_name })
  return {
    intent: i.story_intent,
    labels,
    request: {
      question: i.question_text_snapshot,
      context: i.context_snapshot,
      story_intent: i.story_intent,
      story_pattern: q.story_pattern ?? '',
      parent_a_label: labels[0],
      parent_b_label: labels[1],
      answer_from_parent_a: initiatorResp.text_or_choice!.trim(),
      answer_from_parent_b: partnerResp.text_or_choice!.trim(),
    },
  }
}

/** Call Gemini, validate, retry once, then fall back. Logs metadata only. */
async function composeStory(p: Prepared, interactionId: string): Promise<Composed> {
  const ai = getAiClient()
  const failures: (StoryProblem | 'call_error')[] = []
  if (ai.available) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { output, model } = await ai.generateStory(p.request)
        const text = output.story_text.replace(/\s+/g, ' ').trim()
        const problems = validateStory({
          text,
          intent_used: output.intent_used,
          story_intent: p.intent,
          labels: p.labels,
          question: p.request.question,
          context: p.request.context,
          answers: [p.request.answer_from_parent_a, p.request.answer_from_parent_b],
        })
        if (problems.length === 0) return { text, is_fallback: false, model_name: model }
        failures.push(problems[0])
      } catch {
        failures.push('call_error')
      }
    }
  }
  logMeta('story_fallback_used', { interaction_id: interactionId, reason: ai.available ? failures.join(',') : 'no_api_key' })
  return { text: FALLBACK_STORIES[p.intent], is_fallback: true, model_name: 'fallback-library' }
}

function logMeta(name: string, props: Record<string, string | boolean>) {
  void mutate(`log:${newId('k')}`, (db) => {
    track(db, name, props)
    return true
  })
}

/** Complete an interaction in `generating` with a story. Idempotent per interaction. */
export async function completeWithStory(interactionId: string): Promise<Result<Story | null>> {
  const prepared = prepare(readDb(), interactionId)
  if (!prepared) return { ok: true, data: null }
  const composed = await composeStory(prepared, interactionId)
  return mutate(`complete:${interactionId}`, (db) => {
    // Re-check: a partner may have withdrawn while the story was being written.
    if (!prepare(db, interactionId)) return null
    const i = db.interactions.find((x) => x.interaction_id === interactionId)!
    const couple = db.couples.find((c) => c.couple_id === i.couple_id)!
    const story = newStory(i, prepared.intent, composed, null)
    db.stories.push(story)
    i.status = 'completed'
    // Raw answers are hard-deleted 24 hours after generation.
    const deleteAfter = new Date(nowMs() + RAW_ANSWER_RETENTION_MS).toISOString()
    for (const r of db.responses) if (r.interaction_id === i.interaction_id && r.status === 'submitted') r.delete_after = deleteAfter
    // The topic retires for the couple once both have answered.
    for (const uid of couple.member_user_ids) {
      const h = db.question_history.find((x) => x.user_id === uid && x.question_id === i.question_id)
      if (h) {
        h.status = 'retired'
        h.couple_id = couple.couple_id
        h.updated_at = story.created_at
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

function newStory(i: Interaction, intent: StoryIntent, c: Composed, fromId: string | null): Story {
  return {
    story_id: newId('sty'),
    interaction_id: i.interaction_id,
    couple_id: i.couple_id,
    text: c.text,
    category: i.category,
    story_intent: intent,
    question_text_snapshot: i.question_text_snapshot,
    created_at: nowIso(),
    saved: false,
    is_fallback: c.is_fallback,
    regenerated_from_id: fromId,
    regenerate_used: fromId !== null,
    quarantined: false,
    hidden_for_user_ids: [],
    model_name: c.model_name,
    prompt_version: PROMPT_VERSION,
  }
}

/** On app load: finish any story whose generation was interrupted. */
export async function resumeGeneration(): Promise<number> {
  const pending = readDb().interactions.filter((i) => i.status === 'generating').map((i) => i.interaction_id)
  for (const id of pending) await completeWithStory(id)
  return pending.length
}

// ---------- Story access ----------

export function requireVisibleStory(db: Db, storyId: string, userId: string): Story {
  const s = db.stories.find((x) => x.story_id === storyId)
  if (!s) return fail(404, "We couldn't find this story.")
  const couple = db.couples.find((c) => c.couple_id === s.couple_id)
  // Stories are visible only to the two members of the couple.
  if (!couple || !couple.member_user_ids.includes(userId)) return fail(403, "This story isn't yours to view.")
  if (s.quarantined || s.hidden_for_user_ids.includes(userId)) return fail(404, "This story isn't available.")
  return s
}

/** Visible and not locked: outside the free window without an unlock, only the paywall shows. */
function requireReadableStory(db: Db, storyId: string, userId: string): Story {
  const s = requireVisibleStory(db, storyId, userId)
  if (storyLocked(db, s, userId)) fail(403, 'This story is in your locked Storybook.', { locked: true })
  return s
}

export interface StoryView {
  story_id: string
  interaction_id: string
  text: string
  category: Story['category']
  question_text: string
  created_at: string
  saved: boolean
  my_reaction: ReactionValue | null
  can_regenerate: boolean
}

function storyView(db: Db, s: Story, userId: string): StoryView {
  const raw = db.responses.filter((r) => r.interaction_id === s.interaction_id && r.status === 'submitted').length === 2
  return {
    story_id: s.story_id,
    interaction_id: s.interaction_id,
    text: s.text,
    category: s.category,
    question_text: s.question_text_snapshot,
    created_at: s.created_at,
    saved: s.saved,
    my_reaction: db.reactions.find((r) => r.story_id === s.story_id && r.user_id === userId)?.value ?? null,
    can_regenerate: !s.regenerate_used && raw && nowMs() - Date.parse(s.created_at) < REGENERATE_WINDOW_HOURS * DURATION.HOUR,
  }
}

export async function getStory(storyId: string): Promise<Result<StoryView>> {
  return query((db) => {
    const me = requireUser(db)
    return storyView(db, requireReadableStory(db, storyId, me.user_id), me.user_id)
  })
}

export async function saveStory(input: { story_id: string; idempotencyKey: string }): Promise<Result<StoryView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = requireReadableStory(db, input.story_id, me.user_id)
    s.saved = true
    track(db, 'story_saved', { story_id: s.story_id, category: s.category })
    return storyView(db, s, me.user_id)
  })
}

export async function reactToStory(input: { story_id: string; value: ReactionValue; idempotencyKey: string }): Promise<Result<StoryView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = requireReadableStory(db, input.story_id, me.user_id)
    if (!REACTIONS.includes(input.value)) fail(400, 'Please choose one of the reactions.')
    const existing = db.reactions.find((r) => r.story_id === s.story_id && r.user_id === me.user_id)
    if (existing) {
      existing.value = input.value
      existing.created_at = nowIso()
    } else db.reactions.push({ story_id: s.story_id, user_id: me.user_id, value: input.value, created_at: nowIso() })
    track(db, 'story_reacted', { story_id: s.story_id })
    return storyView(db, s, me.user_id)
  })
}

/** Report hides the story for the reporter only; the partner still sees it unless quarantined. */
export async function reportStory(input: { story_id: string; reason: ReportReason; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = requireReadableStory(db, input.story_id, me.user_id)
    if (!['inaccurate', 'uncomfortable', 'other'].includes(input.reason)) fail(400, 'Please choose a reason.')
    const report: Report = {
      report_id: newId('rpt'),
      story_id: s.story_id,
      user_id: me.user_id,
      reason: input.reason,
      story_text_snapshot: s.text,
      story_intent: s.story_intent,
      question_text_snapshot: s.question_text_snapshot,
      prompt_version: s.prompt_version,
      model_name: s.model_name,
      reviewed_by: null,
      reviewed_at: null,
      outcome: null,
      created_at: nowIso(),
    }
    db.reports.push(report)
    s.hidden_for_user_ids.push(me.user_id)
    track(db, 'story_reported', { story_id: s.story_id, reason: input.reason })
    return true as const
  })
}

/**
 * Once per story, within 24 hours of generation, by either partner, using the
 * same consented answers. The new story replaces the old one for both unless
 * the old one was saved.
 */
export async function regenerateStory(input: { story_id: string; idempotencyKey: string }): Promise<Result<StoryView>> {
  const cached = cachedResult<StoryView>(input.idempotencyKey)
  if (cached) return cached
  const check = await query((db) => {
    const me = requireUser(db)
    const s = requireReadableStory(db, input.story_id, me.user_id)
    if (!storyView(db, s, me.user_id).can_regenerate) fail(409, 'This story can only be rewritten once, within a day of being made.')
    const p = prepare(db, s.interaction_id, { allowCompleted: true })
    if (!p) fail(410, "This story can't be rewritten any more.")
    return { p: p!, interactionId: s.interaction_id }
  })
  if (!check.ok) return check
  const composed = await composeStory(check.data.p, check.data.interactionId)
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const old = requireReadableStory(db, input.story_id, me.user_id)
    if (old.regenerate_used) fail(409, 'This story can only be rewritten once.')
    const i = db.interactions.find((x) => x.interaction_id === old.interaction_id)!
    const fresh = newStory(i, old.story_intent, composed, old.story_id)
    old.regenerate_used = true
    if (!old.saved) db.stories = db.stories.filter((x) => x.story_id !== old.story_id)
    db.stories.push(fresh)
    track(db, 'story_regenerated', { story_id: fresh.story_id, from: old.story_id, is_fallback: fresh.is_fallback })
    return storyView(db, fresh, me.user_id)
  })
}

// ---------- Admin: review reports (Prototype Controls) ----------

export interface ReportReviewView {
  report_id: string
  reason: ReportReason
  story_text: string
  story_intent: StoryIntent
  question_text: string
  created_at: string
  outcome: Report['outcome']
  quarantined: boolean
}

/** Shows story text, intent and question only. Never raw answers. */
export async function adminListReports(): Promise<Result<ReportReviewView[]>> {
  return query((db) =>
    [...db.reports].reverse().map((r) => ({
      report_id: r.report_id,
      reason: r.reason,
      story_text: r.story_text_snapshot,
      story_intent: r.story_intent,
      question_text: r.question_text_snapshot,
      created_at: r.created_at,
      outcome: r.outcome,
      quarantined: db.stories.find((s) => s.story_id === r.story_id)?.quarantined ?? false,
    })),
  )
}

export async function adminReviewReport(input: { report_id: string; outcome: 'quarantined' | 'no_action'; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const r = db.reports.find((x) => x.report_id === input.report_id) ?? fail(404, 'Report not found.')
    r.outcome = input.outcome
    r.reviewed_by = 'prototype-admin'
    r.reviewed_at = nowIso()
    if (input.outcome === 'quarantined') {
      const s = db.stories.find((x) => x.story_id === r.story_id)
      if (s) s.quarantined = true
    }
    db.audit_log.push({ actor: 'prototype-admin', action: `report_${input.outcome}`, target: r.report_id, timestamp: nowIso() })
    return true as const
  })
}
