// Storybook (spec Screen 14, Sections 10 and 11): saved timeline, Recent,
// locked previews, delete for both (with the unlock), and the JSON export (needs the unlock).

import { CATEGORIES } from '../domain/constants'
import type { CategoryId, Result, Story } from '../domain/types'
import { formatDate, localDay } from '../utils/time'
import { DURATION, nowIso, nowMs } from './clock'
import { activeCoupleOf, fail, mutate, query, registerJob, requireUser, track } from './core'
import { FREE_STORIES, storyLocked, unlockedBy } from './entitlement'
import type { Db } from './storage'
import { requireVisibleStory } from './stories'

const PREVIEW_CHARS = 90

export interface StoryCard {
  story_id: string
  /** Category plus date. */
  title: string
  category: CategoryId
  /** The question this story answered (shown on locked cards too; never the story itself). */
  question: string
  created_at: string
  saved: boolean
  locked: boolean
  /** Opening words, only when readable. A locked preview shows date and category only. */
  preview: string | null
  /** For Recent: when the unsaved story will be removed. */
  removed_at: string | null
}

export interface StorybookView {
  saved: StoryCard[]
  recent: StoryCard[]
  unlocked: boolean
  free_window_days: number
  /** Stories a couple can read without the unlock. */
  free_stories: number
  /** How many of our stories are locked right now. */
  locked_count: number
  recent_days: number
}

function timeZoneFor(db: Db, s: Story): string {
  return db.couples.find((c) => c.couple_id === s.couple_id)?.timezone ?? 'UTC'
}

export function storyTitle(db: Db, s: Story): string {
  return `${CATEGORIES[s.category].name} · ${formatDate(s.created_at, timeZoneFor(db, s))}`
}

/** Stories I can see: my couples (current or former), not quarantined, not hidden by my report. */
function myStories(db: Db, userId: string): Story[] {
  const coupleIds = new Set(db.couples.filter((c) => c.member_user_ids.includes(userId)).map((c) => c.couple_id))
  return db.stories
    .filter((s) => coupleIds.has(s.couple_id) && !s.quarantined && !s.hidden_for_user_ids.includes(userId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function card(db: Db, s: Story, userId: string): StoryCard {
  const locked = storyLocked(db, s, userId)
  const preview = locked ? null : s.text.length > PREVIEW_CHARS ? `${s.text.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, '')}…` : s.text
  return {
    story_id: s.story_id,
    title: storyTitle(db, s),
    category: s.category,
    question: s.question_text_snapshot,
    created_at: s.created_at,
    saved: s.saved,
    locked,
    preview,
    removed_at: s.saved ? null : new Date(Date.parse(s.created_at) + db.flags.recent_days * DURATION.DAY).toISOString(),
  }
}

export async function listStories(): Promise<Result<StorybookView>> {
  return query((db) => {
    const me = requireUser(db)
    const all = myStories(db, me.user_id)
    const saved = all.filter((s) => s.saved).map((s) => card(db, s, me.user_id))
    const recent = all.filter((s) => !s.saved).map((s) => card(db, s, me.user_id))
    return {
      saved,
      recent,
      free_stories: FREE_STORIES,
      locked_count: [...saved, ...recent].filter((c) => c.locked).length,
      unlocked: unlockedBy(db, me.user_id) !== null,
      free_window_days: db.flags.free_window_days,
      recent_days: db.flags.recent_days,
    }
  })
}

function removeStory(db: Db, storyId: string) {
  db.stories = db.stories.filter((s) => s.story_id !== storyId)
  db.reactions = db.reactions.filter((r) => r.story_id !== storyId)
}

/** Either partner may delete a story, saved or locked; it is removed for both. Free. */
export async function deleteStory(input: { story_id: string; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = requireVisibleStory(db, input.story_id, me.user_id)
    // Product decision: deleting stories comes with the full Storybook unlock.
    if (!unlockedBy(db, me.user_id)) fail(403, 'Deleting stories comes with the full Storybook. Unlock it to delete.', { locked: true })
    removeStory(db, s.story_id)
    track(db, 'story_deleted', { story_id: s.story_id, category: s.category, was_saved: s.saved })
    return true as const
  })
}

// ---------- Export (with the full Storybook unlock, once per day, no raw answers) ----------

export interface ExportFile {
  filename: string
  json: string
}

export async function requestExport(input: { idempotencyKey: string }): Promise<Result<ExportFile>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    // Product decision (overrides the spec's "export is free"): export comes with the unlock.
    if (!unlockedBy(db, me.user_id)) fail(403, 'Export comes with the full Storybook. Unlock it to download your stories.', { locked: true })
    const couple = activeCoupleOf(db, me.user_id)
    const tz = couple?.timezone ?? 'UTC'
    const today = localDay(nowMs(), tz)
    if (db.export_log[me.user_id] === today) fail(429, "You've already exported today. You can export again tomorrow.")
    db.export_log[me.user_id] = today
    const partner = couple ? db.users.find((u) => u.user_id !== me.user_id && couple.member_user_ids.includes(u.user_id)) : null
    // Deliberately built field by field: responses (raw answers) are never included.
    const data = {
      format: 'a-little-more-us-export',
      version: 1,
      exported_at: nowIso(),
      profile: {
        display_name: me.display_name,
        parent_label: me.parent_label,
        identifier: me.identifier,
        age_band: me.age_band,
        preferences: me.preferences,
        notification_prefs: me.notification_prefs,
      },
      couple: couple
        ? { partner_label: partner?.parent_label ?? null, timezone: couple.timezone, age_band: couple.age_band, paired_since: couple.created_at }
        : null,
      stories: myStories(db, me.user_id).map((s) => ({
        title: storyTitle(db, s),
        category: CATEGORIES[s.category].name,
        created_at: s.created_at,
        saved: s.saved,
        question: s.question_text_snapshot,
        text: s.text,
        imaginative_writing: true,
        my_reaction: db.reactions.find((r) => r.story_id === s.story_id && r.user_id === me.user_id)?.value ?? null,
      })),
    }
    track(db, 'export_requested', { story_count: data.stories.length })
    return { filename: `a-little-more-us-export-${today}.json`, json: JSON.stringify(data, null, 2) }
  })
}

// ---------- Retention: unsaved stories leave Recent after recent_days ----------

registerJob('cleanup_recent_stories', (db) => {
  const cutoff = nowMs() - db.flags.recent_days * DURATION.DAY
  const stale = db.stories.filter((s) => !s.saved && Date.parse(s.created_at) <= cutoff)
  for (const s of stale) removeStory(db, s.story_id)
  return stale.length
})
