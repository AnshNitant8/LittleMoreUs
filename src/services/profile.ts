// Profile and preferences (spec Screens 03–05, 08 and Section 13 "Profile").
// A user can only read and change their own record.

import { PARENT_LABEL_MAX } from '../domain/constants'
import {
  AGE_BANDS,
  CATEGORY_IDS,
  DEPTHS,
  type AgeBand,
  type CategoryId,
  type Depth,
  type NotificationPrefs,
  type Preferences,
  type Result,
  type User,
} from '../domain/types'
import { currentUser, fail, mutate, query, requireUser, track } from './core'

export type OnboardingStep = 'stage' | 'family' | 'moments' | 'notifications' | 'done'

export interface Session {
  user: User | null
  onboarding_step: OnboardingStep | null
}

/** Next onboarding screen for a user, derived from what they have filled in. */
export function onboardingStep(u: User): OnboardingStep {
  if (u.onboarding_complete) return 'done'
  if (!u.age_band) return 'stage'
  if (!u.display_name || !u.parent_label) return 'family'
  if (u.preferences.categories.length === 0 || !u.preferences.depth) return 'moments'
  return 'notifications'
}

export async function getSession(): Promise<Result<Session>> {
  return query((db) => {
    const u = currentUser(db)
    return { user: u ? structuredClone(u) : null, onboarding_step: u ? onboardingStep(u) : null }
  })
}

export async function getMe(): Promise<Result<User>> {
  return query((db) => structuredClone(requireUser(db)))
}

/** Count user-perceived characters so labels in any script are measured fairly. */
export function charLength(s: string): number {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length
  } catch {
    return Array.from(s).length
  }
}

export function validateParentLabel(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ')
  const n = charLength(v)
  if (n < 1 || n > PARENT_LABEL_MAX) fail(400, `Your parent label needs 1 to ${PARENT_LABEL_MAX} characters.`)
  return v
}

export function validateDisplayName(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ')
  const n = charLength(v)
  if (n < 1 || n > 40) fail(400, 'Please enter a name of 1 to 40 characters.')
  return v
}

export interface UpdateMeInput {
  display_name?: string
  parent_label?: string
  age_band?: AgeBand
  onboarding_complete?: true
  idempotencyKey: string
}

export async function updateMe(input: UpdateMeInput): Promise<Result<User>> {
  return mutate(input.idempotencyKey, (db) => {
    const u = requireUser(db)
    if (input.display_name !== undefined) u.display_name = validateDisplayName(input.display_name)
    if (input.parent_label !== undefined) u.parent_label = validateParentLabel(input.parent_label)
    if (input.age_band !== undefined) {
      if (!AGE_BANDS.includes(input.age_band)) fail(400, 'Please choose a parenthood stage.')
      // Pre-pairing the age band lives on the user. Household age band arrives with pairing (Stage 3).
      u.age_band = input.age_band
    }
    if (input.onboarding_complete) {
      if (onboardingStep(u) !== 'notifications') fail(400, 'Please finish the earlier steps first.')
      u.onboarding_complete = true
      track(db, 'onboarding_completed', { user_id: u.user_id })
    }
    return structuredClone(u)
  })
}

export interface PreferencesView {
  preferences: Preferences
  notification_prefs: NotificationPrefs
}

export async function getPreferences(): Promise<Result<PreferencesView>> {
  return query((db) => {
    const u = requireUser(db)
    return { preferences: structuredClone(u.preferences), notification_prefs: structuredClone(u.notification_prefs) }
  })
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface UpdatePreferencesInput {
  categories?: CategoryId[]
  depth?: Depth
  muted_categories?: CategoryId[]
  notification_prefs?: NotificationPrefs
  idempotencyKey: string
}

export async function updatePreferences(input: UpdatePreferencesInput): Promise<Result<PreferencesView>> {
  return mutate(input.idempotencyKey, (db) => {
    const u = requireUser(db)
    if (input.categories !== undefined) {
      const cats = [...new Set(input.categories)]
      if (cats.length === 0) fail(400, 'Please choose at least one kind of moment.')
      if (cats.some((c) => !CATEGORY_IDS.includes(c))) fail(400, 'Unknown category.')
      u.preferences.categories = cats
    }
    if (input.depth !== undefined) {
      if (!DEPTHS.includes(input.depth)) fail(400, 'Please choose how deep you would like to go.')
      u.preferences.depth = input.depth
    }
    if (input.muted_categories !== undefined) {
      if (input.muted_categories.some((c) => !CATEGORY_IDS.includes(c))) fail(400, 'Unknown category.')
      u.preferences.muted_categories = [...new Set(input.muted_categories)]
    }
    if (input.notification_prefs !== undefined) {
      const n = input.notification_prefs
      for (const t of [n.window.start, n.window.end, n.quiet_hours.start, n.quiet_hours.end]) {
        if (!HM.test(t)) fail(400, 'Please use times like 09:00.')
      }
      if (n.window.start === n.window.end) fail(400, 'Your notification window needs a different start and end time.')
      u.notification_prefs = {
        window: { ...n.window },
        quiet_hours: { ...n.quiet_hours },
        toggles: {
          app_suggestions: !!n.toggles.app_suggestions,
          partner_invitations: !!n.toggles.partner_invitations,
          pending_reminders: !!n.toggles.pending_reminders,
        },
      }
    }
    track(db, 'preferences_updated', { user_id: u.user_id })
    return { preferences: structuredClone(u.preferences), notification_prefs: structuredClone(u.notification_prefs) }
  })
}
