// Connection Moments (spec Sections 4, 7, 12). All core-loop rules live here.
// Privacy: views never include the partner's raw answer; notifications and
// analytics never include question or answer text.

import { ANSWER_MAX, CATEGORIES, DISTRESS_FLAG_RETENTION_DAYS, SKIP_LIMIT_PER_CATEGORY_PER_DAY } from '../domain/constants'
import { coupleOrder, selectQuestion, eligibleQuestions, type SelectionContext } from '../domain/rules/selection'
import type {
  CategoryId,
  Couple,
  EmotionalIntensity,
  GameOption,
  Interaction,
  InteractionStatus,
  Question,
  QuestionHistory,
  QuestionHistoryStatus,
  Response,
  Result,
  User,
} from '../domain/types'
import { ALL_QUESTIONS } from '../data/questions'
import { newId } from '../utils/id'
import { localDay } from '../utils/time'
import { DURATION, nowIso, nowMs } from './clock'
import {
  activeCoupleOf,
  activeSession,
  cachedResult,
  defer,
  fail,
  isOffline,
  mutate,
  partnerIdOf,
  query,
  registerJob,
  requireUser,
  track,
} from './core'
import { notify } from './notify'
import { readDb, type Db } from './storage'
import { checkDistress, type DistressResult } from './safety'
import { completeWithStory } from './stories'

export const OPEN_STATUSES: InteractionStatus[] = ['awaiting_partner', 'generating']

// ---------- Helpers ----------

/** "a little Remember Us", but "a Little Appreciations" (never "a little Little …"). */
export function aLittle(category: CategoryId): string {
  const name = CATEGORIES[category].name
  return /^little\b/i.test(name) ? `a ${name}` : `a little ${name}`
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function questionById(id: string): Question | undefined {
  return ALL_QUESTIONS.find((q) => q.question_id === id)
}

function requireCouple(db: Db, user: User): Couple {
  return activeCoupleOf(db, user.user_id) ?? fail(403, 'Moments begin once your partner joins.')
}

export function coupleToday(couple: Couple): string {
  return localDay(nowMs(), couple.timezone)
}

/** New interactions created today by this couple (all outcomes count on their creation day). */
export function createdToday(couple: Couple): number {
  const today = coupleToday(couple)
  return couple.daily_counter.date === today ? couple.daily_counter.count : 0
}

export function capReached(db: Db, couple: Couple): boolean {
  return db.flags.cap_enabled && createdToday(couple) >= db.flags.daily_cap
}

function setHistory(db: Db, entry: Omit<QuestionHistory, 'updated_at' | 'delivered_at' | 'answered_at'> & Partial<QuestionHistory>) {
  const existing = db.question_history.find((h) => h.user_id === entry.user_id && h.question_id === entry.question_id)
  const t = nowIso()
  if (existing) {
    existing.status = entry.status
    existing.couple_id = entry.couple_id
    existing.updated_at = t
    if (entry.status === 'answered') existing.answered_at = t
  } else {
    db.question_history.push({
      delivered_at: null,
      answered_at: entry.status === 'answered' ? t : null,
      ...entry,
      updated_at: t,
    })
  }
}

function setHistoryStatus(db: Db, userId: string, couple: Couple, q: { question_id: string; topic_id: string }, status: QuestionHistoryStatus) {
  setHistory(db, { user_id: userId, couple_id: couple.couple_id, question_id: q.question_id, topic_id: q.topic_id, status })
}

/** Hard-delete raw answer text for an interaction (spec: immediately on decline/expiry/withdrawal/hold). */
export function purgeResponses(db: Db, interactionId: string, userId?: string) {
  for (const r of db.responses) {
    if (r.interaction_id === interactionId && (!userId || r.user_id === userId) && r.status !== 'deleted') {
      r.text_or_choice = null
      r.status = 'deleted'
      r.delete_after = null
    }
  }
}

function validateAnswer(answer: string, consent: boolean): string {
  if (consent !== true) fail(422, 'Please tick the box to agree before sending.')
  const text = (answer ?? '').trim()
  if (!text) fail(400, 'Please write a few words first.')
  if (Array.from(text).length > ANSWER_MAX) fail(400, `Please keep your answer to ${ANSWER_MAX} characters.`)
  return text
}

function selectionContext(db: Db, user: User, couple: Couple): SelectionContext {
  const partner = db.users.find((u) => u.user_id === partnerIdOf(couple, user.user_id))
  const coupleInteractions = db.interactions
    .filter((i) => i.couple_id === couple.couple_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const last = coupleInteractions[coupleInteractions.length - 1]
  return {
    questions: ALL_QUESTIONS,
    initiatorId: user.user_id,
    coupleId: couple.couple_id,
    householdAgeBand: couple.age_band,
    initiatorDepth: user.preferences.depth,
    mutedCategories: [...new Set([...user.preferences.muted_categories, ...(partner?.preferences.muted_categories ?? [])])],
    history: db.question_history,
    openQuestionIds: coupleInteractions.filter((i) => OPEN_STATUSES.includes(i.status)).map((i) => i.question_id),
    lastIntensity: last ? ((questionById(last.question_id)?.emotional_intensity ?? null) as EmotionalIntensity | null) : null,
    recentCategories: coupleInteractions.map((i) => i.category),
    nowMs: nowMs(),
  }
}

// ---------- Views ----------

export interface MomentQuestionView {
  question_id: string
  category: CategoryId
  text: string
  context: string
}

export type NextMoment =
  | { kind: 'question'; question: MomentQuestionView; pacing: PacingView }
  | { kind: 'cap_reached'; pacing: PacingView }
  | { kind: 'skip_limit' }
  | { kind: 'explored_all' }

export interface PacingView {
  /** Shown only when both cap_enabled and show_pacing_label are on. */
  show_label: boolean
  remaining: number | null
}

function pacing(db: Db, couple: Couple): PacingView {
  const show = db.flags.cap_enabled && db.flags.show_pacing_label
  return { show_label: show, remaining: db.flags.cap_enabled ? Math.max(0, db.flags.daily_cap - createdToday(couple)) : null }
}

export interface InteractionView {
  interaction_id: string
  category: CategoryId
  /** Frozen snapshot: character-identical wherever it is shown. */
  question_text: string
  context: string
  status: InteractionStatus
  role: 'initiator' | 'partner'
  created_at: string
  expires_at: string
  /** The viewer's own response only. Never the partner's text. */
  my_response: { text: string | null; submitted_at: string } | null
  partner_has_answered: boolean
  initiator_label: string
  story_id: string | null
  /** Only ever true for the person whose own answer was flagged. Never for the partner. */
  show_support: boolean
  type: 'paired' | 'game'
  /** Game only: the fixed options. */
  options: GameOption[] | null
  partner_label: string
  /** Game only, and only once both have chosen: the two selected options. Never free text. */
  reveal: { mine: string; theirs: string; same: boolean } | null
}

function interactionView(db: Db, i: Interaction, viewerId: string): InteractionView {
  const mine = db.responses.find((r) => r.interaction_id === i.interaction_id && r.user_id === viewerId && r.status === 'submitted')
  const theirs = db.responses.find((r) => r.interaction_id === i.interaction_id && r.user_id !== viewerId && r.status === 'submitted')
  const initiator = db.users.find((u) => u.user_id === i.initiator_id)
  const story = db.stories.filter((s) => s.interaction_id === i.interaction_id).pop()
  const couple = db.couples.find((c) => c.couple_id === i.couple_id)
  const partner = couple ? db.users.find((u) => u.user_id === partnerIdOf(couple, viewerId)) : null
  const options = i.type === 'game' ? (questionById(i.question_id)?.options ?? []) : null
  const label = (id: string | null | undefined) => options?.find((o) => o.option_id === id)?.label ?? null
  const mineLabel = label(mine?.text_or_choice)
  const theirsLabel = label(theirs?.text_or_choice)
  return {
    interaction_id: i.interaction_id,
    category: i.category,
    question_text: i.question_text_snapshot,
    context: i.context_snapshot,
    status: i.status,
    role: i.initiator_id === viewerId ? 'initiator' : 'partner',
    created_at: i.created_at,
    expires_at: i.expires_at,
    my_response: mine ? { text: mine.text_or_choice, submitted_at: mine.submitted_at } : null,
    partner_has_answered: !!theirs,
    initiator_label: initiator?.parent_label || 'Your partner',
    story_id: story?.story_id ?? null,
    show_support:
      i.status === 'safety_held' &&
      i.distress_flag === true &&
      db.responses.some((r) => r.interaction_id === i.interaction_id && r.user_id === viewerId && r.distress_flag),
    type: i.type,
    options,
    partner_label: partner?.parent_label || 'Your partner',
    // Revealed only after both respond (status completed), and only the chosen options.
    reveal:
      i.type === 'game' && i.status === 'completed' && mineLabel && theirsLabel
        ? { mine: mineLabel, theirs: theirsLabel, same: mine!.text_or_choice === theirs!.text_or_choice }
        : null,
  }
}

function requireMemberInteraction(db: Db, user: User, interactionId: string): Interaction {
  const i = db.interactions.find((x) => x.interaction_id === interactionId)
  if (!i) return fail(404, "We couldn't find this moment.")
  const couple = db.couples.find((c) => c.couple_id === i.couple_id)
  if (!couple || !couple.member_user_ids.includes(user.user_id)) return fail(403, "This moment isn't yours to view.")
  return i
}

// ---------- Question selection ----------

/** The next eligible question; with no category, the Home featured moment. */
export async function getNextMoment(category?: CategoryId | null): Promise<Result<NextMoment>> {
  return query((db) => {
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    const p = pacing(db, couple)
    if (capReached(db, couple)) return { kind: 'cap_reached', pacing: p }
    if (category && skipsToday(db, me, couple, category) >= SKIP_LIMIT_PER_CATEGORY_PER_DAY) return { kind: 'skip_limit' }
    const q = selectQuestion(selectionContext(db, me, couple), {
      category: category ?? undefined,
      preferred: me.preferences.categories,
    })
    if (!q) return { kind: 'explored_all' }
    return { kind: 'question', question: { question_id: q.question_id, category: q.category, text: q.text, context: q.context }, pacing: p }
  })
}

export interface ExploreCategoryView {
  category: CategoryId
  has_new: boolean
  muted: boolean
}

export interface ExploreView {
  categories: ExploreCategoryView[]
  cap_reached: boolean
  waiting_for_you: number
  /** Guess My Answer: null when the game is turned off or Let's Play is muted. */
  game: { has_new: boolean } | null
}

export async function getExplore(): Promise<Result<ExploreView>> {
  return query((db) => {
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    const ctx = selectionContext(db, me, couple)
    const cats = Object.keys(CATEGORIES) as CategoryId[]
    return {
      categories: cats.map((c) => ({
        category: c,
        muted: ctx.mutedCategories.includes(c),
        has_new: eligibleQuestions(ctx, c).length > 0,
      })),
      cap_reached: capReached(db, couple),
      waiting_for_you: waitingFor(db, me, couple).length,
      game: db.flags.game_enabled && !ctx.mutedCategories.includes('lets_play') ? { has_new: eligibleGames(db, me, couple).length > 0 } : null,
    }
  })
}

function skipKey(userId: string, day: string, category: CategoryId) {
  return `${userId}|${day}|${category}`
}

function skipsToday(db: Db, user: User, couple: Couple, category: CategoryId) {
  return db.skip_counts[skipKey(user.user_id, coupleToday(couple), category)] ?? 0
}

/** Skip the proposed question. Creates no interaction and never counts toward the cap. */
export async function skipMoment(input: { question_id: string; idempotencyKey: string }): Promise<Result<{ skips_left: number }>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    const q = questionById(input.question_id) ?? fail(404, "We couldn't find that question.")
    const key = skipKey(me.user_id, coupleToday(couple), q.category)
    const used = db.skip_counts[key] ?? 0
    if (used >= SKIP_LIMIT_PER_CATEGORY_PER_DAY) fail(429, 'Check back later for more moments here.')
    db.skip_counts[key] = used + 1
    setHistoryStatus(db, me.user_id, couple, q, 'skipped')
    track(db, 'moment_skipped', { question_id: q.question_id, category: q.category })
    return { skips_left: SKIP_LIMIT_PER_CATEGORY_PER_DAY - used - 1 }
  })
}

// ---------- Drafts (local to this simulated device; never shared) ----------

export async function getDraft(key: string): Promise<Result<string>> {
  return query((db) => activeSession(db).drafts[key] ?? '')
}

export async function saveDraft(key: string, text: string): Promise<Result<true>> {
  return mutate(`draft:${newId('k')}`, (db) => {
    const drafts = activeSession(db).drafts
    if (text.trim()) drafts[key] = text.slice(0, ANSWER_MAX * 2)
    else delete drafts[key]
    return true as const
  })
}

// ---------- Interactions ----------

/**
 * Run the distress check before the write. The text is held only in memory
 * for the check. Skipped when the write would be a no-op (repeat key, offline,
 * or obviously invalid input that the service will reject anyway).
 */
async function preCheck(idempotencyKey: string, answer: string, consent: boolean): Promise<DistressResult | null> {
  const db = readDb()
  if (cachedResult(idempotencyKey) || isOffline(db)) return null
  if (consent !== true || !(answer ?? '').trim() || Array.from(answer.trim()).length > ANSWER_MAX) return null
  return checkDistress(answer.trim())
}

/** Spec Section 9: hold the interaction, delete answer text, keep only a boolean flag. */
function holdForSafety(db: Db, i: Interaction) {
  i.status = 'safety_held'
  i.safety_held_at = nowIso()
  i.closed_at = i.safety_held_at
  i.distress_flag = true
  purgeResponses(db, i.interaction_id)
}

function flaggedResponse(interactionId: string, userId: string): Response {
  const t = nowIso()
  return {
    response_id: newId('rsp'),
    interaction_id: interactionId,
    user_id: userId,
    text_or_choice: null, // flagged text is never stored
    consent_state: 'given',
    consent_at: t,
    status: 'deleted',
    delete_after: null,
    distress_flag: true,
    submitted_at: t,
  }
}

export interface CreateInteractionInput {
  question_id: string
  answer: string
  consent: boolean
  idempotencyKey: string
}

/**
 * Initiator's atomic create-and-submit: validation, interaction, first
 * response, daily counter and partner notification commit together or not at all.
 */
export async function createInteraction(input: CreateInteractionInput): Promise<Result<InteractionView>> {
  const safety = await preCheck(input.idempotencyKey, input.answer, input.consent)
  return mutate(input.idempotencyKey, (db) => {
    if (isOffline(db)) fail(503, "You're offline. We'll keep trying.")
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    const text = validateAnswer(input.answer, input.consent)
    const q = questionById(input.question_id)
    if (!q || !q.active || q.type !== 'paired') fail(404, "We couldn't find that question.")
    const question = q!

    const open = db.interactions.find(
      (i) => i.couple_id === couple.couple_id && i.question_id === question.question_id && OPEN_STATUSES.includes(i.status),
    )
    if (open) fail(409, 'This moment is already waiting for you both.', { interaction_id: open.interaction_id })
    const eligible = eligibleQuestions(selectionContext(db, me, couple)).some((x) => x.question_id === question.question_id)
    if (!eligible) fail(409, "This one isn't available right now. Let's find you another.")
    if (capReached(db, couple)) fail(409, "That's all the new moments for today. Replies to waiting moments are still open.")

    const now = nowMs()
    const today = coupleToday(couple)
    const interaction: Interaction = {
      interaction_id: newId('int'),
      couple_id: couple.couple_id,
      question_id: question.question_id,
      question_version_id: question.version_id,
      question_text_snapshot: question.text,
      context_snapshot: question.context,
      category: question.category,
      story_intent: question.story_intent,
      initiator_id: me.user_id,
      type: 'paired',
      status: 'awaiting_partner',
      created_at: new Date(now).toISOString(),
      created_local_day: today,
      expires_at: new Date(now + db.flags.expiry_days * DURATION.DAY).toISOString(),
      reminder_sent_at: null,
      safety_held_at: null,
      distress_flag: null,
      first_responder_id: me.user_id,
    }
    const response: Response = {
      response_id: newId('rsp'),
      interaction_id: interaction.interaction_id,
      user_id: me.user_id,
      text_or_choice: text,
      consent_state: 'given',
      consent_at: interaction.created_at,
      status: 'submitted',
      delete_after: null,
      distress_flag: false,
      submitted_at: interaction.created_at,
    }
    couple.daily_counter = couple.daily_counter.date === today ? { date: today, count: couple.daily_counter.count + 1 } : { date: today, count: 1 }
    delete activeSession(db).drafts[`q:${question.question_id}`]
    if (safety?.classifier_error) track(db, 'distress_classifier_error', { stage: 'create' })
    if (safety?.flagged) {
      // Held privately: no story, no partner notification, no text stored.
      db.interactions.push(interaction)
      db.responses.push(flaggedResponse(interaction.interaction_id, me.user_id))
      holdForSafety(db, interaction)
      setHistoryStatus(db, me.user_id, couple, question, 'dismissed')
      return interactionView(db, interaction, me.user_id)
    }
    db.interactions.push(interaction)
    db.responses.push(response)
    setHistoryStatus(db, me.user_id, couple, question, 'answered')

    const partnerId = partnerIdOf(couple, me.user_id)
    setHistory(db, {
      user_id: partnerId,
      couple_id: couple.couple_id,
      question_id: question.question_id,
      topic_id: question.topic_id,
      status: 'delivered',
      delivered_at: nowIso(),
    })
    notify(db, {
      user_id: partnerId,
      type: 'partner_invitation',
      body: `${me.parent_label || 'Your partner'} started a little moment for you both.`,
      category: question.category,
      dedupe_key: `invite:${interaction.interaction_id}`,
      timeZone: couple.timezone,
    })
    track(db, 'interaction_created', { interaction_id: interaction.interaction_id, category: question.category, consent: true })
    return interactionView(db, interaction, me.user_id)
  })
}

export async function listInteractions(status?: InteractionStatus): Promise<Result<InteractionView[]>> {
  return query((db) => {
    const me = requireUser(db)
    const couple = activeCoupleOf(db, me.user_id)
    if (!couple) return []
    return db.interactions
      .filter((i) => i.couple_id === couple.couple_id && (!status || i.status === status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((i) => interactionView(db, i, me.user_id))
  })
}

function waitingFor(db: Db, me: User, couple: Couple): Interaction[] {
  return db.interactions.filter(
    (i) =>
      i.couple_id === couple.couple_id &&
      i.status === 'awaiting_partner' &&
      i.initiator_id !== me.user_id &&
      !db.responses.some((r) => r.interaction_id === i.interaction_id && r.user_id === me.user_id && r.status === 'submitted'),
  )
}

export interface HomeView {
  featured: NextMoment
  waiting_for_you: InteractionView[]
  my_open: InteractionView[]
  recent_stories: { interaction_id: string; story_id: string; category: CategoryId }[]
  /** Moments of mine that closed without a story in the last day (neutral wording only). */
  recent_closed: InteractionView[]
  /** Guess My Answer games both of us finished in the last day, ready to reveal. */
  recent_games: InteractionView[]
}

export async function getHome(): Promise<Result<HomeView>> {
  const featured = await getNextMoment(null)
  if (!featured.ok) return featured
  return query((db) => {
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    const waiting = waitingFor(db, me, couple).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const myOpen = db.interactions.filter(
      (i) =>
        i.couple_id === couple.couple_id &&
        OPEN_STATUSES.includes(i.status) &&
        !waiting.includes(i) &&
        db.responses.some((r) => r.interaction_id === i.interaction_id && r.user_id === me.user_id && r.status === 'submitted'),
    )
    const dayAgo = nowMs() - DURATION.DAY
    const recent = db.stories
      .filter((s) => s.couple_id === couple.couple_id && Date.parse(s.created_at) > dayAgo && !s.quarantined && !s.hidden_for_user_ids.includes(me.user_id))
      .map((s) => ({ interaction_id: s.interaction_id, story_id: s.story_id, category: s.category }))
    const closed = db.interactions.filter(
      (i) =>
        i.couple_id === couple.couple_id &&
        ['declined', 'expired', 'safety_held'].includes(i.status) &&
        !!i.closed_at &&
        nowMs() - Date.parse(i.closed_at) < DURATION.DAY &&
        db.responses.some((r) => r.interaction_id === i.interaction_id && r.user_id === me.user_id),
    )
    const games = db.interactions.filter(
      (i) => i.couple_id === couple.couple_id && i.type === 'game' && i.status === 'completed' && !!i.closed_at && nowMs() - Date.parse(i.closed_at) < DURATION.DAY,
    )
    return {
      featured: featured.data,
      recent_games: games.map((i) => interactionView(db, i, me.user_id)),
      recent_closed: closed.map((i) => interactionView(db, i, me.user_id)),
      waiting_for_you: waiting.map((i) => interactionView(db, i, me.user_id)),
      my_open: myOpen.map((i) => interactionView(db, i, me.user_id)),
      recent_stories: recent,
    }
  })
}

export async function getInteraction(interactionId: string): Promise<Result<InteractionView>> {
  return query((db) => {
    const me = requireUser(db)
    return interactionView(db, requireMemberInteraction(db, me, interactionId), me.user_id)
  })
}

function requireOpenForPartner(db: Db, me: User, i: Interaction) {
  if (i.initiator_id === me.user_id) fail(400, 'You already answered this one.')
  if (i.status === 'awaiting_partner' && Date.parse(i.expires_at) <= nowMs()) fail(410, 'This moment has expired.')
  if (i.status !== 'awaiting_partner') fail(410, 'This moment is no longer open.')
  if (db.responses.some((r) => r.interaction_id === i.interaction_id && r.user_id === me.user_id && r.status === 'submitted')) {
    fail(409, 'You already answered this one.')
  }
}

/** Partner's reply. Never consumes allowance, even when the cap is reached. */
export async function respondToInteraction(input: { interaction_id: string; answer: string; consent: boolean; idempotencyKey: string }): Promise<Result<InteractionView>> {
  const safety = await preCheck(input.idempotencyKey, input.answer, input.consent)
  const res = await mutate(input.idempotencyKey, (db) => {
    if (isOffline(db)) fail(503, "You're offline. We'll keep trying.")
    const me = requireUser(db)
    const i = requireMemberInteraction(db, me, input.interaction_id)
    const couple = requireCouple(db, me)
    if (i.couple_id !== couple.couple_id) fail(410, 'This moment has closed.')
    if (i.type !== 'paired') fail(400, 'This one is a game. Pick one of the options instead.')
    requireOpenForPartner(db, me, i)
    const text = validateAnswer(input.answer, input.consent)
    if (safety?.classifier_error) track(db, 'distress_classifier_error', { stage: 'respond' })
    if (safety?.flagged) {
      const q0 = questionById(i.question_id)!
      db.responses.push(flaggedResponse(i.interaction_id, me.user_id))
      holdForSafety(db, i) // also deletes the initiator's answer
      setHistoryStatus(db, me.user_id, couple, q0, 'dismissed')
      setHistoryStatus(db, i.initiator_id, couple, q0, 'dismissed')
      delete activeSession(db).drafts[`i:${i.interaction_id}`]
      return interactionView(db, i, me.user_id)
    }
    const t = nowIso()
    db.responses.push({
      response_id: newId('rsp'),
      interaction_id: i.interaction_id,
      user_id: me.user_id,
      text_or_choice: text,
      consent_state: 'given',
      consent_at: t,
      status: 'submitted',
      delete_after: null,
      distress_flag: false,
      submitted_at: t,
    })
    const q = questionById(i.question_id)!
    setHistoryStatus(db, me.user_id, couple, q, 'answered')
    delete activeSession(db).drafts[`i:${i.interaction_id}`]
    i.status = 'generating'
    track(db, 'interaction_answered', { interaction_id: i.interaction_id, category: i.category, consent: true })
    return interactionView(db, i, me.user_id)
  })
  // Generation is asynchronous: kick it off after the answer is safely stored.
  if (res.ok && res.data.status === 'generating') defer(() => generateFor(res.data.interaction_id))
  return res
}

/** Run story generation for an interaction in `generating`. Safe to call repeatedly. */
export async function generateFor(interactionId: string): Promise<void> {
  await completeWithStory(interactionId)
}

/** Partner declines: "Not this one". Raw answers are deleted immediately. */
export async function declineInteraction(input: { interaction_id: string; idempotencyKey: string }): Promise<Result<InteractionView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const i = requireMemberInteraction(db, me, input.interaction_id)
    if (i.initiator_id === me.user_id) fail(400, 'You started this one. You can withdraw your answer instead.')
    if (i.status !== 'awaiting_partner') fail(410, 'This moment is no longer open.')
    const couple = db.couples.find((c) => c.couple_id === i.couple_id)!
    i.status = 'declined'
    i.closed_at = nowIso()
    purgeResponses(db, i.interaction_id)
    const q = questionById(i.question_id)!
    setHistoryStatus(db, me.user_id, couple, q, 'dismissed')
    setHistoryStatus(db, i.initiator_id, couple, q, 'dismissed')
    track(db, 'interaction_declined', { interaction_id: i.interaction_id, category: i.category })
    return interactionView(db, i, me.user_id)
  })
}

/**
 * Initiator withdraws: interaction closes, both answers are discarded and the
 * question becomes eligible again after 30 days. Partner withdraws before
 * generation finishes: only their answer is deleted and the moment waits again.
 */
export async function withdrawInteraction(input: { interaction_id: string; idempotencyKey: string }): Promise<Result<InteractionView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const i = requireMemberInteraction(db, me, input.interaction_id)
    const couple = db.couples.find((c) => c.couple_id === i.couple_id)!
    const q = questionById(i.question_id)!
    const hasStory = db.stories.some((s) => s.interaction_id === i.interaction_id)
    if (hasStory || i.status === 'completed') fail(410, 'Your story has already been made. You can delete it from your Storybook instead.')
    if (i.initiator_id === me.user_id) {
      if (!OPEN_STATUSES.includes(i.status)) fail(410, 'This moment is no longer open.')
      i.status = 'withdrawn'
      i.closed_at = nowIso()
      purgeResponses(db, i.interaction_id)
      setHistoryStatus(db, me.user_id, couple, q, 'dismissed')
      const partnerId = partnerIdOf(couple, me.user_id)
      setHistoryStatus(db, partnerId, couple, q, 'available')
    } else {
      if (i.status !== 'generating') fail(410, "There's no answer of yours to withdraw here.")
      purgeResponses(db, i.interaction_id, me.user_id)
      i.status = 'awaiting_partner'
      setHistoryStatus(db, me.user_id, couple, q, 'delivered')
    }
    track(db, 'interaction_withdrawn', { interaction_id: i.interaction_id, by_initiator: i.initiator_id === me.user_id })
    return interactionView(db, i, me.user_id)
  })
}

// ---------- Guess My Answer (spec Screen 15) ----------
// Options only: no free text, no story, no score. Choices are revealed to
// both only after both have responded. A game counts as a new interaction.

export type NextGame =
  | { kind: 'game'; question: MomentQuestionView; options: GameOption[]; pacing: PacingView }
  | { kind: 'disabled' }
  | { kind: 'cap_reached'; pacing: PacingView }
  | { kind: 'explored_all' }

function eligibleGames(db: Db, me: User, couple: Couple): Question[] {
  const ctx = selectionContext(db, me, couple)
  if (ctx.mutedCategories.includes('lets_play')) return []
  const recent = nowMs() - 30 * DURATION.DAY
  return ALL_QUESTIONS.filter((q) => {
    if (q.type !== 'game' || !q.active) return false
    if (ctx.openQuestionIds.includes(q.question_id)) return false
    const h = db.question_history.find((x) => x.user_id === me.user_id && x.question_id === q.question_id)
    if (h?.status === 'answered' || h?.status === 'retired') return false
    if (h && (h.status === 'skipped' || h.status === 'dismissed') && Date.parse(h.updated_at) > recent) return false
    return true
  }).sort((a, b) => coupleOrder(couple.couple_id, a.question_id) - coupleOrder(couple.couple_id, b.question_id))
}

export async function getNextGame(): Promise<Result<NextGame>> {
  return query((db) => {
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    if (!db.flags.game_enabled) return { kind: 'disabled' }
    const p = pacing(db, couple)
    if (capReached(db, couple)) return { kind: 'cap_reached', pacing: p }
    const q = eligibleGames(db, me, couple)[0]
    if (!q) return { kind: 'explored_all' }
    return { kind: 'game', question: { question_id: q.question_id, category: q.category, text: q.text, context: q.context }, options: q.options ?? [], pacing: p }
  })
}

function validateChoice(q: Question, optionId: string, acknowledged: boolean): string {
  if (acknowledged !== true) fail(422, 'Please confirm you are happy for your choice to be revealed.')
  if (!q.options?.some((o) => o.option_id === optionId)) fail(400, 'Please pick one of the options.')
  return optionId
}

export async function createGame(input: { question_id: string; option_id: string; acknowledged: boolean; idempotencyKey: string }): Promise<Result<InteractionView>> {
  return mutate(input.idempotencyKey, (db) => {
    if (isOffline(db)) fail(503, "You're offline. We'll keep trying.")
    const me = requireUser(db)
    const couple = requireCouple(db, me)
    if (!db.flags.game_enabled) fail(404, 'Guess My Answer is turned off.')
    const q = questionById(input.question_id)
    if (!q || q.type !== 'game' || !q.active) fail(404, "We couldn't find that game.")
    const game = q!
    const choice = validateChoice(game, input.option_id, input.acknowledged)
    const open = db.interactions.find((i) => i.couple_id === couple.couple_id && i.question_id === game.question_id && OPEN_STATUSES.includes(i.status))
    if (open) fail(409, 'This game is already waiting for you both.', { interaction_id: open.interaction_id })
    if (!eligibleGames(db, me, couple).some((x) => x.question_id === game.question_id)) fail(409, "This one isn't available right now.")
    if (capReached(db, couple)) fail(409, "That's all the new moments for today. Replies to waiting moments are still open.")
    const now = nowMs()
    const today = coupleToday(couple)
    const t = new Date(now).toISOString()
    const interaction: Interaction = {
      interaction_id: newId('int'),
      couple_id: couple.couple_id,
      question_id: game.question_id,
      question_version_id: game.version_id,
      question_text_snapshot: game.text,
      context_snapshot: game.context,
      category: game.category,
      story_intent: null,
      initiator_id: me.user_id,
      type: 'game',
      status: 'awaiting_partner',
      created_at: t,
      created_local_day: today,
      expires_at: new Date(now + db.flags.expiry_days * DURATION.DAY).toISOString(),
      reminder_sent_at: null,
      safety_held_at: null,
      distress_flag: null,
      first_responder_id: me.user_id,
    }
    db.interactions.push(interaction)
    db.responses.push({
      response_id: newId('rsp'),
      interaction_id: interaction.interaction_id,
      user_id: me.user_id,
      text_or_choice: choice,
      consent_state: 'given',
      consent_at: t,
      status: 'submitted',
      delete_after: null,
      distress_flag: false,
      submitted_at: t,
    })
    couple.daily_counter = couple.daily_counter.date === today ? { date: today, count: couple.daily_counter.count + 1 } : { date: today, count: 1 }
    setHistoryStatus(db, me.user_id, couple, game, 'answered')
    const partnerId = partnerIdOf(couple, me.user_id)
    setHistory(db, { user_id: partnerId, couple_id: couple.couple_id, question_id: game.question_id, topic_id: game.topic_id, status: 'delivered', delivered_at: t })
    notify(db, {
      user_id: partnerId,
      type: 'partner_invitation',
      body: `${me.parent_label || 'Your partner'} started a little moment for you both.`,
      category: game.category,
      dedupe_key: `invite:${interaction.interaction_id}`,
      timeZone: couple.timezone,
    })
    track(db, 'game_created', { interaction_id: interaction.interaction_id, category: game.category })
    return interactionView(db, interaction, me.user_id)
  })
}

/** Partner's guess. Completes the game and reveals both choices to both. Never counts toward the cap. */
export async function respondToGame(input: { interaction_id: string; option_id: string; acknowledged: boolean; idempotencyKey: string }): Promise<Result<InteractionView>> {
  return mutate(input.idempotencyKey, (db) => {
    if (isOffline(db)) fail(503, "You're offline. We'll keep trying.")
    const me = requireUser(db)
    const i = requireMemberInteraction(db, me, input.interaction_id)
    const couple = requireCouple(db, me)
    if (i.couple_id !== couple.couple_id) fail(410, 'This moment has closed.')
    if (i.type !== 'game') fail(400, 'This moment needs a written answer.')
    requireOpenForPartner(db, me, i)
    const q = questionById(i.question_id)!
    const choice = validateChoice(q, input.option_id, input.acknowledged)
    const t = nowIso()
    db.responses.push({
      response_id: newId('rsp'),
      interaction_id: i.interaction_id,
      user_id: me.user_id,
      text_or_choice: choice,
      consent_state: 'given',
      consent_at: t,
      status: 'submitted',
      delete_after: null,
      distress_flag: false,
      submitted_at: t,
    })
    // Choices are kept for a day so both can see the reveal, then deleted like answers.
    const deleteAfter = new Date(nowMs() + DURATION.DAY).toISOString()
    for (const r of db.responses) if (r.interaction_id === i.interaction_id && r.status === 'submitted') r.delete_after = deleteAfter
    i.status = 'completed'
    i.closed_at = t
    setHistoryStatus(db, me.user_id, couple, q, 'answered')
    notify(db, {
      user_id: i.initiator_id,
      type: 'game_ready',
      body: 'Your guessing game is ready to reveal.',
      category: i.category,
      dedupe_key: `game:${i.interaction_id}`,
      timeZone: couple.timezone,
    })
    track(db, 'game_answered', { interaction_id: i.interaction_id })
    return interactionView(db, i, me.user_id)
  })
}

// ---------- Scheduled jobs ----------

// Runs before expiry, so a large clock jump still sends the one reminder that fell due before the moment expired.
registerJob('send_reminders', (db) => {
  let n = 0
  for (const i of db.interactions) {
    if (i.status !== 'awaiting_partner' || i.reminder_sent_at) continue
    const due = Date.parse(i.created_at) + db.flags.reminder_delay_hours * DURATION.HOUR
    if (nowMs() < due || due >= Date.parse(i.expires_at)) continue
    const couple = db.couples.find((c) => c.couple_id === i.couple_id && c.state === 'paired')
    if (!couple) continue
    // At most one reminder, ever. Delivery is deferred into the partner's window by notify().
    i.reminder_sent_at = nowIso()
    notify(db, {
      user_id: partnerIdOf(couple, i.initiator_id),
      type: 'pending_reminder',
      body: `Whenever you're ready, ${aLittle(i.category)} moment is still here for you both.`,
      category: i.category,
      dedupe_key: `reminder:${i.interaction_id}`,
      timeZone: couple.timezone,
    })
    n++
  }
  return n
})

registerJob('expire_interactions', (db) => {
  let n = 0
  for (const i of db.interactions) {
    if (i.status === 'awaiting_partner' && Date.parse(i.expires_at) <= nowMs()) {
      i.status = 'expired'
      i.closed_at = nowIso()
      purgeResponses(db, i.interaction_id)
      const couple = db.couples.find((c) => c.couple_id === i.couple_id)
      const q = questionById(i.question_id)
      if (couple && q) for (const uid of couple.member_user_ids) setHistoryStatus(db, uid, couple, q, 'expired')
      n++
    }
  }
  return n
})

registerJob('purge_raw_answers', (db) => {
  let n = 0
  for (const r of db.responses) {
    if (r.status === 'submitted' && r.delete_after && Date.parse(r.delete_after) <= nowMs()) {
      r.text_or_choice = null
      r.status = 'deleted'
      r.delete_after = null
      n++
    }
  }
  return n
})

/** One app suggestion per person per day at most, never for the third allowance. */
registerJob('app_suggestions', (db) => {
  let n = 0
  for (const couple of db.couples.filter((c) => c.state === 'paired')) {
    const today = coupleToday(couple)
    const created = couple.daily_counter.date === today ? couple.daily_counter.count : 0
    if (created >= 2 || capReached(db, couple)) continue
    for (const uid of couple.member_user_ids) {
      const user = db.users.find((u) => u.user_id === uid)
      if (!user || !user.onboarding_complete) continue
      const p = user.preferences
      if (p.paused || (p.snoozed_until && Date.parse(p.snoozed_until) > nowMs())) continue
      const sentToday = db.notifications.filter((x) => x.user_id === uid && x.type === 'app_suggestion' && x.dedupe_key.endsWith(`:${today}`)).length
      if (sentToday >= Math.min(1, db.flags.suggestions_per_day)) continue
      const q = selectQuestion(selectionContext(db, user, couple), { preferred: p.categories })
      if (!q) continue
      if (
        notify(db, {
          user_id: uid,
          type: 'app_suggestion',
          body: `${capitalise(aLittle(q.category))} moment is here when you are.`,
          category: q.category,
          dedupe_key: `suggest:${uid}:${today}`,
          timeZone: couple.timezone,
        })
      )
        n++
    }
  }
  return n
})


/** Distress flags are kept as a boolean only, and purged after 30 simulated days. */
registerJob('purge_distress_flags', (db) => {
  let n = 0
  for (const i of db.interactions) {
    if (i.distress_flag !== null && i.safety_held_at && nowMs() - Date.parse(i.safety_held_at) >= DISTRESS_FLAG_RETENTION_DAYS * DURATION.DAY) {
      i.distress_flag = null
      for (const r of db.responses) if (r.interaction_id === i.interaction_id) r.distress_flag = false
      n++
    }
  }
  return n
})

/** Country for the support card: India when the phone or couple timezone says so, otherwise unknown. */
export async function getSupportRegion(): Promise<Result<'IN' | null>> {
  return query((db) => {
    const me = requireUser(db)
    const couple = activeCoupleOf(db, me.user_id)
    const tz = couple?.timezone ?? ''
    return me.identifier.startsWith('+91') || tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' ? 'IN' : null
  })
}
