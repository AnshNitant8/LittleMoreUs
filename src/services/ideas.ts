// "Did you two try it?": one gentle check-in on a story's small idea, asked
// only after the idea's own timeframe has passed (the next day for "today",
// a week for "this week", about a month for "this month"). Either partner can
// answer, for both. "Yes" marks that page of the book "We did this". "Not yet"
// asks once more later, then never again. Nothing is counted.

import { timeframeFromText } from '../data/suggestions'
import type { CategoryId, IdeaTimeframe, Result, Story } from '../domain/types'
import { localDay } from '../utils/time'
import { nowIso, nowMs } from './clock'
import { activeCoupleOf, fail, mutate, query, requireUser, track } from './core'
import type { Db } from './storage'

/** Days after the story before the first ask (weekend is handled separately). */
const FIRST_ASK_DAYS: Record<IdeaTimeframe, number> = { today: 1, few_days: 3, weekend: 0, week: 7, month: 30 }
/** Days after a "Not yet" before the one and only second ask. */
const SECOND_ASK_DAYS: Record<IdeaTimeframe, number> = { today: 3, few_days: 4, weekend: 7, week: 7, month: 14 }

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function ideaTimeframe(s: Story): IdeaTimeframe {
  return s.suggestion_timeframe ?? timeframeFromText(s.suggestion ?? '')
}

/** The couple's local day on which "Did you two try it?" is next due, or null if it is never asked again. */
export function ideaDueDay(s: Story, timeZone: string): string | null {
  if (!s.suggestion) return null
  const tf = ideaTimeframe(s)
  const c = s.idea_checkin
  if (c && c.status !== 'not_yet') return null
  if (c) return addDays(localDay(Date.parse(c.at), timeZone), SECOND_ASK_DAYS[tf])
  const made = localDay(Date.parse(s.created_at), timeZone)
  if (tf === 'weekend') {
    // The Monday after the story was made (a story made on Monday waits a week).
    const dow = new Date(`${made}T00:00:00Z`).getUTCDay()
    return addDays(made, (8 - dow) % 7 || 7)
  }
  return addDays(made, FIRST_ASK_DAYS[tf])
}

export interface IdeaCheckinView {
  story_id: string
  category: CategoryId
  suggestion: string
  /** This is the second (and last) time we ask. */
  asked_before: boolean
}

/** The one check-in that is due for this couple now (the oldest), or null. */
export function dueIdeaCheckin(db: Db, userId: string): IdeaCheckinView | null {
  const couple = activeCoupleOf(db, userId)
  if (!couple) return null
  const today = localDay(nowMs(), couple.timezone)
  const superseded = new Set(db.stories.map((s) => s.regenerated_from_id).filter(Boolean))
  const due = db.stories
    .filter((s) => s.couple_id === couple.couple_id && !s.quarantined && !s.hidden_for_user_ids.includes(userId) && !superseded.has(s.story_id))
    .map((s) => ({ s, day: ideaDueDay(s, couple.timezone) }))
    .filter((x): x is { s: Story; day: string } => x.day !== null && x.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day) || a.s.created_at.localeCompare(b.s.created_at))[0]
  if (!due) return null
  return { story_id: due.s.story_id, category: due.s.category, suggestion: due.s.suggestion!, asked_before: due.s.idea_checkin?.status === 'not_yet' }
}

export interface IdeaReminderView {
  story_id: string
  category: CategoryId
  suggestion: string
  timeframe: 'week' | 'month'
  /** Days until we'd ask "Did you two try it?". */
  days_left: number
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * A warm reminder of a "this week" or "this month" idea, on the days after the
 * story and before the check-in. Never shown while a check-in is due, and gone
 * once the couple says they did it.
 */
export function ideaReminder(db: Db, userId: string): IdeaReminderView | null {
  const couple = activeCoupleOf(db, userId)
  if (!couple || dueIdeaCheckin(db, userId)) return null
  const today = localDay(nowMs(), couple.timezone)
  const superseded = new Set(db.stories.map((s) => s.regenerated_from_id).filter(Boolean))
  const s = db.stories
    .filter((s) => s.couple_id === couple.couple_id && !!s.suggestion && !s.idea_checkin && !s.quarantined && !s.hidden_for_user_ids.includes(userId) && !superseded.has(s.story_id))
    .filter((s) => {
      const tf = ideaTimeframe(s)
      const due = ideaDueDay(s, couple.timezone)
      return (tf === 'week' || tf === 'month') && !!due && localDay(Date.parse(s.created_at), couple.timezone) < today && today < due
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!s) return null
  return { story_id: s.story_id, category: s.category, suggestion: s.suggestion!, timeframe: ideaTimeframe(s) as 'week' | 'month', days_left: dayDiff(today, ideaDueDay(s, couple.timezone)!) }
}

export async function getIdeaCheckin(): Promise<Result<IdeaCheckinView | null>> {
  return query((db) => dueIdeaCheckin(db, requireUser(db).user_id))
}

/** Answer "Did you two try it?" for both partners. */
export async function answerIdeaCheckin(input: { story_id: string; tried: boolean; idempotencyKey: string }): Promise<Result<{ status: 'tried' | 'not_yet' | 'closed' }>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = db.stories.find((x) => x.story_id === input.story_id)
    const couple = activeCoupleOf(db, me.user_id)
    if (!s || !couple || s.couple_id !== couple.couple_id || s.quarantined || s.hidden_for_user_ids.includes(me.user_id)) fail(404, "We couldn't find this idea.")
    const story = s!
    if (!story.suggestion) fail(404, "We couldn't find this idea.")
    const prev = story.idea_checkin?.status
    if (prev === 'tried' || prev === 'closed') return { status: prev }
    const status = input.tried ? 'tried' : prev === 'not_yet' ? 'closed' : 'not_yet'
    story.idea_checkin = { status, at: nowIso(), by: me.user_id }
    track(db, 'idea_checkin_answered', { story_id: story.story_id, tried: input.tried, second_ask: prev === 'not_yet', timeframe: ideaTimeframe(story) })
    return { status }
  })
}
