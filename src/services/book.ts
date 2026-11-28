// The full Storybook as a keepsake book (with the unlock): chapters by month,
// each saved story with its question, the small idea, reactions, and the
// partners' own words — only the words each partner chose to add.

import { CATEGORIES } from '../domain/constants'
import type { CategoryId, Result, Story } from '../domain/types'
import { formatDate } from '../utils/time'
import { activeCoupleOf, fail, mutate, query, requireUser, track } from './core'
import { storyLocked, unlockedBy } from './entitlement'
import type { Db } from './storage'
import { requireVisibleStory } from './stories'

export interface BookWords {
  label: string
  text: string
}

export interface BookEntry {
  story_id: string
  category: CategoryId
  category_name: string
  date: string
  question: string
  text: string
  suggestion: string | null
  /** "We did this": the couple tried the small idea. */
  idea_tried?: boolean
  words: BookWords[]
  reactions: string[]
}

export interface BookChapter {
  title: string
  entries: BookEntry[]
}

export interface BookView {
  title: string
  /** "Mama (Priya) & Papa (Arjun)" style names for the cover. */
  couple: string
  since: string | null
  stats: { stories: number; words: number; ideas: number; kinds: number }
  chapters: BookChapter[]
  sample: boolean
}

const monthTitle = (iso: string, tz: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: tz }).format(new Date(iso))

function who(db: Db, userId: string): string {
  const u = db.users.find((x) => x.user_id === userId)
  if (!u) return 'A parent'
  const name = u.display_name?.trim().split(/\s+/)[0]
  return u.parent_label ? (name ? `${u.parent_label} (${name})` : u.parent_label) : name || 'A parent'
}

/** Stories in the book: saved, readable, oldest first. */
function bookStories(db: Db, userId: string): Story[] {
  const coupleIds = new Set(db.couples.filter((c) => c.member_user_ids.includes(userId)).map((c) => c.couple_id))
  return db.stories
    .filter((s) => coupleIds.has(s.couple_id) && s.saved && !s.quarantined && !s.hidden_for_user_ids.includes(userId) && !storyLocked(db, s, userId))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function buildBook(db: Db, userId: string): BookView {
  const couple = activeCoupleOf(db, userId) ?? db.couples.find((c) => c.member_user_ids.includes(userId)) ?? null
  const tz = couple?.timezone ?? 'UTC'
  const stories = bookStories(db, userId)
  const chapters: BookChapter[] = []
  let words = 0
  for (const s of stories) {
    const title = monthTitle(s.created_at, tz)
    let ch = chapters[chapters.length - 1]
    if (!ch || ch.title !== title) chapters.push((ch = { title, entries: [] }))
    const w = Object.entries(s.keepsake_words ?? {}).map(([uid, text]) => ({ label: who(db, uid), text }))
    words += w.length
    ch.entries.push({
      story_id: s.story_id,
      category: s.category,
      category_name: CATEGORIES[s.category].name,
      date: formatDate(s.created_at, tz),
      question: s.question_text_snapshot,
      text: s.text,
      suggestion: s.suggestion ?? null,
      idea_tried: s.idea_checkin?.status === 'tried',
      words: w,
      reactions: db.reactions.filter((r) => r.story_id === s.story_id).map((r) => r.value),
    })
  }
  return {
    title: 'Our Little Storybook',
    couple: couple ? couple.member_user_ids.map((id) => who(db, id)).join(' & ') : who(db, userId),
    since: stories[0] ? monthTitle(stories[0].created_at, tz) : null,
    stats: { stories: stories.length, words, ideas: stories.filter((s) => s.suggestion).length, kinds: new Set(stories.map((s) => s.category)).size },
    chapters,
    sample: false,
  }
}

/** The couple's book. Comes with the full Storybook unlock. */
export async function getBook(): Promise<Result<BookView>> {
  return query((db) => {
    const me = requireUser(db)
    if (!unlockedBy(db, me.user_id)) fail(403, 'Your Storybook book comes with the full Storybook.', { locked: true })
    return buildBook(db, me.user_id)
  })
}

/**
 * Add (or take back) my own answer to this story's page in our book. Only
 * possible while the answer is still kept (24 hours after the story).
 * My partner will see these words in the book.
 */
export async function setKeepsakeWords(input: { story_id: string; include: boolean; idempotencyKey: string }): Promise<Result<{ included: boolean }>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const s = requireVisibleStory(db, input.story_id, me.user_id)
    if (!input.include) {
      if (s.keepsake_words) delete s.keepsake_words[me.user_id]
      track(db, 'keepsake_words_removed', { story_id: s.story_id })
      return { included: false }
    }
    const mine = db.responses.find((r) => r.interaction_id === s.interaction_id && r.user_id === me.user_id && r.status === 'submitted')
    const text = mine?.text_or_choice?.trim()
    if (!text) fail(410, 'Your answer has already been cleared, so it can no longer be added. Answers are kept for 24 hours after a story.')
    s.keepsake_words = { ...(s.keepsake_words ?? {}), [me.user_id]: text! }
    track(db, 'keepsake_words_added', { story_id: s.story_id })
    return { included: true }
  })
}
