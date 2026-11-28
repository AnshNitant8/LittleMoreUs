// Disconnect and account deletion (spec Sections 4, 11 and Screen 17).
// Neutral, no-guilt wording. Raw answers are deleted straight away; saved
// stories stay for both until either partner deletes one.

import { ACCOUNT_RECOVERY_DAYS } from '../domain/constants'
import type { Couple, Result } from '../domain/types'
import { DURATION, nowIso, nowMs } from './clock'
import { activeCoupleOf, fail, mutate, partnerIdOf, registerJob, requireUser, track } from './core'
import { OPEN_STATUSES, purgeResponses } from './moments'
import { notify } from './notify'
import type { Db } from './storage'

/** Close the couple: open moments become closed_disconnected and their answers are deleted. */
function closeCouple(db: Db, couple: Couple, actorId: string) {
  const t = nowIso()
  couple.state = 'disconnected'
  couple.disconnected_at = t
  for (const i of db.interactions) {
    if (i.couple_id === couple.couple_id && OPEN_STATUSES.includes(i.status)) {
      i.status = 'closed_disconnected'
      i.closed_at = t
      purgeResponses(db, i.interaction_id)
    }
  }
  notify(db, {
    user_id: partnerIdOf(couple, actorId),
    type: 'pairing_status',
    body: "You're no longer connected with your partner here. Your saved stories are still in your Storybook.",
    dedupe_key: `disconnect:${couple.couple_id}`,
    timeZone: couple.timezone,
  })
}

export async function disconnectCouple(input: { confirm: boolean; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    if (input.confirm !== true) fail(400, 'Please confirm you want to disconnect.')
    const couple = activeCoupleOf(db, me.user_id) ?? fail(403, "You aren't connected with a partner right now.")
    closeCouple(db, couple, me.user_id)
    track(db, 'couple_disconnected', { couple_id: couple.couple_id })
    return true as const
  })
}

export interface DeletionView {
  erase_at: string
}

/**
 * Starts the 7-day recovery window. The user's answers are deleted now, any
 * pairing ends, and they are signed out. Shared stories stay for the partner
 * unless also_delete_shared_stories is ticked; that deletion happens at erasure.
 */
export async function deleteAccount(input: { also_delete_shared_stories: boolean; confirm: boolean; idempotencyKey: string }): Promise<Result<DeletionView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    if (input.confirm !== true) fail(400, 'Please confirm you want to delete your account.')
    if (me.deletion_requested_at) fail(409, 'Your account is already set to be deleted.')
    me.deletion_requested_at = nowIso()
    me.delete_shared_stories = input.also_delete_shared_stories === true
    for (const r of db.responses) {
      if (r.user_id === me.user_id && r.status !== 'deleted') {
        r.text_or_choice = null
        r.status = 'deleted'
        r.delete_after = null
      }
    }
    const couple = activeCoupleOf(db, me.user_id)
    if (couple) closeCouple(db, couple, me.user_id)
    for (const inv of db.invitations) if (inv.inviter_id === me.user_id && inv.status === 'sent') inv.status = 'cancelled'
    for (const slot of Object.values(db.slots)) {
      if (slot.user_id === me.user_id) {
        slot.user_id = null
        slot.drafts = {}
        slot.otp = null
        slot.pending_invite = null
      }
    }
    track(db, 'account_deletion_requested', { also_delete_shared_stories: me.delete_shared_stories })
    return { erase_at: new Date(nowMs() + ACCOUNT_RECOVERY_DAYS * DURATION.DAY).toISOString() }
  })
}

/** Within the recovery window: keep the account. A disconnected couple stays disconnected. */
export async function cancelAccountDeletion(input: { idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    if (!me.deletion_requested_at) fail(409, "Your account isn't set to be deleted.")
    me.deletion_requested_at = null
    me.delete_shared_stories = false
    track(db, 'account_deletion_cancelled', {})
    return true as const
  })
}

// ---------- Irreversible erasure after the recovery window ----------

function eraseUser(db: Db, userId: string) {
  const user = db.users.find((u) => u.user_id === userId)
  if (!user) return
  if (user.delete_shared_stories) {
    const coupleIds = new Set(db.couples.filter((c) => c.member_user_ids.includes(userId)).map((c) => c.couple_id))
    const gone = new Set(db.stories.filter((s) => coupleIds.has(s.couple_id)).map((s) => s.story_id))
    db.stories = db.stories.filter((s) => !gone.has(s.story_id))
    db.reactions = db.reactions.filter((r) => !gone.has(r.story_id))
  }
  // Words a person added to the book leave with them.
  for (const s of db.stories) if (s.keepsake_words?.[userId] !== undefined) delete s.keepsake_words[userId]
  db.users = db.users.filter((u) => u.user_id !== userId)
  db.responses = db.responses.filter((r) => r.user_id !== userId)
  db.reactions = db.reactions.filter((r) => r.user_id !== userId)
  db.notifications = db.notifications.filter((n) => n.user_id !== userId)
  db.entitlements = db.entitlements.filter((e) => e.purchaser_id !== userId)
  db.question_history = db.question_history.filter((h) => h.user_id !== userId)
  db.invitations = db.invitations.filter((i) => i.inviter_id !== userId)
  for (const r of db.reports) if (r.user_id === userId) r.user_id = 'erased'
  for (const k of Object.keys(db.skip_counts)) if (k.startsWith(`${userId}|`)) delete db.skip_counts[k]
  delete db.export_log[userId]
  delete db.otp_challenges[user.identifier]
  for (const e of db.analytics) for (const [k, v] of Object.entries(e.props)) if (v === userId) e.props[k] = 'erased'
}

registerJob('erase_deleted_accounts', (db) => {
  const due = db.users.filter((u) => u.deletion_requested_at && Date.parse(u.deletion_requested_at) + ACCOUNT_RECOVERY_DAYS * DURATION.DAY <= nowMs())
  for (const u of due) eraseUser(db, u.user_id)
  if (due.length) track(db, 'accounts_erased', { count: due.length })
  return due.length
})

/** A snooze ends on its own once its time passes. */
registerJob('end_snoozes', (db) => {
  let n = 0
  for (const u of db.users) {
    if (u.preferences.snoozed_until && Date.parse(u.preferences.snoozed_until) <= nowMs()) {
      u.preferences.snoozed_until = null
      n++
    }
  }
  return n
})
