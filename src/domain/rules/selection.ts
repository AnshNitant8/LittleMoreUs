// Deterministic question selection (spec Section 7). No AI.
import { SKIP_COOLDOWN_DAYS } from '../constants'
import type { AgeBand, CategoryId, Depth, EmotionalIntensity, Question, QuestionHistory } from '../types'

const DAY = 86_400_000

export const INTENSITIES_FOR_DEPTH: Record<Depth, EmotionalIntensity[]> = {
  light: ['low'],
  mix: ['low', 'medium'],
  deeper: ['low', 'medium', 'high'],
}

export interface SelectionContext {
  questions: Question[]
  initiatorId: string
  coupleId: string
  householdAgeBand: AgeBand | null
  initiatorDepth: Depth | null
  /** Union of both partners' muted categories. */
  mutedCategories: CategoryId[]
  history: QuestionHistory[]
  /** Question ids currently in an open interaction for the couple. */
  openQuestionIds: string[]
  /** Intensity of the couple's most recent interaction, if any. */
  lastIntensity: EmotionalIntensity | null
  /** Categories of the couple's recent interactions, newest last. */
  recentCategories: CategoryId[]
  nowMs: number
}

/**
 * A stable shuffle per couple: each couple gets its own order of questions,
 * the same on both partners' phones and on every visit, so new couples don't
 * all start with the same question.
 */
export function coupleOrder(coupleId: string, questionId: string): number {
  let h = 0x811c9dc5
  for (const ch of `${coupleId}|${questionId}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** True if a question's stage tag fits the household band ("other" uses general questions only). */
export function stageMatches(q: Question, band: AgeBand | null): boolean {
  const tags = q.stage_tags as string[]
  if (tags.includes('general')) return true
  return band !== null && band !== 'other' && tags.includes(band)
}

/** All questions eligible for this initiator, in filter order 1–8. */
export function eligibleQuestions(ctx: SelectionContext, category?: CategoryId): Question[] {
  const allowed = INTENSITIES_FOR_DEPTH[ctx.initiatorDepth ?? 'light']
  const mine = ctx.history.filter((h) => h.user_id === ctx.initiatorId)
  const answered = new Set(mine.filter((h) => h.status === 'answered').map((h) => h.question_id))
  const cooling = new Set(
    mine
      .filter((h) => ['skipped', 'dismissed', 'expired'].includes(h.status) && ctx.nowMs - Date.parse(h.updated_at) < SKIP_COOLDOWN_DAYS * DAY)
      .map((h) => h.question_id),
  )
  const retired = new Set(ctx.history.filter((h) => h.couple_id === ctx.coupleId && h.status === 'retired').map((h) => h.topic_id))
  const open = new Set(ctx.openQuestionIds)

  return ctx.questions.filter(
    (q) =>
      q.active && // 1
      q.type === 'paired' &&
      (!category || q.category === category) &&
      !ctx.mutedCategories.includes(q.category) && // 2
      stageMatches(q, ctx.householdAgeBand) && // 3
      allowed.includes(q.emotional_intensity) && // 4
      !answered.has(q.question_id) && // 5
      !retired.has(q.topic_id) && // 6
      !open.has(q.question_id) && // 7
      !cooling.has(q.question_id), // 8
  )
}

/**
 * Pick the single best question. Balancing: never two high-intensity prompts in
 * a row for the couple; rotate categories against the recent mix; then
 * the couple's own shuffled order.
 */
export function selectQuestion(ctx: SelectionContext, opts: { category?: CategoryId; preferred?: CategoryId[] } = {}): Question | null {
  let pool = eligibleQuestions(ctx, opts.category)
  if (ctx.lastIntensity === 'high') pool = pool.filter((q) => q.emotional_intensity !== 'high')
  if (!opts.category && opts.preferred && opts.preferred.length > 0) {
    const preferred = pool.filter((q) => opts.preferred!.includes(q.category))
    if (preferred.length > 0) pool = preferred
  }
  if (pool.length === 0) return null
  const recent = ctx.recentCategories.slice(-5)
  const uses = (c: CategoryId) => recent.filter((x) => x === c).length
  // Most recently used category last among equals.
  const lastSeen = (c: CategoryId) => recent.lastIndexOf(c)
  return [...pool].sort(
    (a, b) =>
      uses(a.category) - uses(b.category) ||
      lastSeen(a.category) - lastSeen(b.category) ||
      coupleOrder(ctx.coupleId, a.question_id) - coupleOrder(ctx.coupleId, b.question_id) ||
      a.question_id.localeCompare(b.question_id),
  )[0]
}
