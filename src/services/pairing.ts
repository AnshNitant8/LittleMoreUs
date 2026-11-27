// Pairing (spec Screens 06–07, Section 4 "Couple settings and labels").
// The couple record is created only when an invitation is accepted.

import { AGE_BAND_LABELS, TIMEZONE_CHANGE_COOLDOWN_HOURS } from '../domain/constants'
import { AGE_BANDS, type AgeBand, type Couple, type Invitation, type InvitationStatus, type Result } from '../domain/types'
import { newId } from '../utils/id'
import { browserTimezone } from '../utils/time'
import { DURATION, nowIso, nowMs } from './clock'
import { activeCoupleOf, activeSession, currentUser, fail, mutate, partnerIdOf, query, registerJob, requireUser, track } from './core'
import { notify } from './notify'
import type { Db } from './storage'

/** Prototype rate limit for creating invitations. */
export const INVITES_PER_DAY = 10

function newToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
}

/** Status as people see it: a sent invitation past its expiry reads as expired. */
function effectiveStatus(inv: Invitation): InvitationStatus {
  return inv.status === 'sent' && Date.parse(inv.expires_at) <= nowMs() ? 'expired' : inv.status
}

// ---------- Views ----------

export interface MyInvitationView {
  token: string
  status: InvitationStatus
  created_at: string
  expires_at: string
}

export interface InvitationView {
  token: string
  status: InvitationStatus
  inviter_name: string
  /** Why the current user may not accept, if they are signed in. */
  problem: 'own_invitation' | 'already_paired' | 'inviter_paired' | null
}

export interface PartnerView {
  display_name: string
  /** Only shown once the partner has confirmed their own label. */
  parent_label: string | null
}

export interface CoupleView {
  couple_id: string
  timezone: string
  timezone_changed_at: string | null
  age_band: AgeBand | null
  created_at: string
  partner: PartnerView
}

function coupleView(db: Db, couple: Couple, userId: string): CoupleView {
  const partner = db.users.find((u) => u.user_id === partnerIdOf(couple, userId))
  return {
    couple_id: couple.couple_id,
    timezone: couple.timezone,
    timezone_changed_at: couple.timezone_changed_at,
    age_band: couple.age_band,
    created_at: couple.created_at,
    partner: {
      display_name: partner?.display_name || 'Your partner',
      parent_label: partner && partner.parent_label ? partner.parent_label : null,
    },
  }
}

/** Couple view for the signed-in user, or null when unpaired. */
export function coupleViewFor(db: Db, userId: string): CoupleView | null {
  const c = activeCoupleOf(db, userId)
  return c ? coupleView(db, c, userId) : null
}

// ---------- Invitations ----------

export async function createInvitation(input: { idempotencyKey: string; timezone?: string }): Promise<Result<MyInvitationView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    if (activeCoupleOf(db, me.user_id)) fail(409, 'You are already connected with a partner.')
    const dayAgo = nowMs() - DURATION.DAY
    const recent = db.invitations.filter((i) => i.inviter_id === me.user_id && Date.parse(i.created_at) > dayAgo).length
    if (recent >= INVITES_PER_DAY) fail(429, 'You have made a lot of invitations today. Please try again tomorrow.')
    // One live invitation at a time: regenerating invalidates the previous link.
    for (const inv of db.invitations) {
      if (inv.inviter_id === me.user_id && inv.status === 'sent') inv.status = 'cancelled'
    }
    const inv: Invitation = {
      token: newToken(),
      inviter_id: me.user_id,
      status: 'sent',
      created_at: nowIso(),
      expires_at: new Date(nowMs() + db.flags.invite_expiry_days * DURATION.DAY).toISOString(),
      responded_by: null,
      timezone: input.timezone || browserTimezone(),
    }
    db.invitations.push(inv)
    track(db, 'invitation_created', { user_id: me.user_id })
    return { token: inv.token, status: 'sent' as const, created_at: inv.created_at, expires_at: inv.expires_at }
  })
}

/** The current user's most recent invitation, with its status. */
export async function getMyInvitation(): Promise<Result<MyInvitationView | null>> {
  return query((db) => {
    const me = requireUser(db)
    const mine = db.invitations.filter((i) => i.inviter_id === me.user_id)
    const latest = mine[mine.length - 1]
    if (!latest) return null
    return { token: latest.token, status: effectiveStatus(latest), created_at: latest.created_at, expires_at: latest.expires_at }
  })
}

export async function getInvitation(token: string): Promise<Result<InvitationView>> {
  return query((db) => {
    const inv = db.invitations.find((i) => i.token === token)
    if (!inv) return fail(404, "We couldn't find this invitation. Please ask your partner for a new link.")
    const inviter = db.users.find((u) => u.user_id === inv.inviter_id)
    const me = currentUser(db)
    let problem: InvitationView['problem'] = null
    if (me) {
      if (me.user_id === inv.inviter_id) problem = 'own_invitation'
      else if (activeCoupleOf(db, me.user_id)) problem = 'already_paired'
    }
    if (!problem && inviter && activeCoupleOf(db, inviter.user_id)) problem = 'inviter_paired'
    return { token, status: effectiveStatus(inv), inviter_name: inviter?.display_name || 'Your partner', problem }
  })
}

/** Remember an invite opened on this device so it survives sign-in. */
export async function rememberInvite(token: string): Promise<Result<true>> {
  return mutate(`remember-invite:${newId('k')}`, (db) => {
    activeSession(db).pending_invite = token
    return true as const
  })
}

export async function forgetInvite(): Promise<Result<true>> {
  return mutate(`forget-invite:${newId('k')}`, (db) => {
    activeSession(db).pending_invite = null
    return true as const
  })
}

function openInvitation(db: Db, token: string): Invitation {
  const inv = db.invitations.find((i) => i.token === token)
  if (!inv) return fail(404, "We couldn't find this invitation. Please ask your partner for a new link.")
  const status = effectiveStatus(inv)
  if (status !== 'sent') return fail(410, 'This link has expired or was already used. Please ask your partner for a new one.')
  return inv
}

export async function acceptInvitation(input: { token: string; idempotencyKey: string }): Promise<Result<CoupleView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const inv = openInvitation(db, input.token)
    if (inv.inviter_id === me.user_id) fail(400, "This is your own invitation. Share it with your partner instead.")
    if (activeCoupleOf(db, me.user_id)) fail(409, 'You are already connected with a partner.')
    const inviter = db.users.find((u) => u.user_id === inv.inviter_id)
    if (!inviter) fail(410, 'This invitation is no longer valid. Please ask your partner for a new link.')
    if (activeCoupleOf(db, inviter!.user_id)) fail(409, 'Your partner is already connected with someone. Please ask them for a new link.')

    const couple: Couple = {
      couple_id: newId('cpl'),
      member_user_ids: [inviter!.user_id, me.user_id],
      timezone: inv.timezone,
      timezone_changed_at: null,
      // Copied from the inviter; the invitee sees it prefilled and may change it.
      age_band: inviter!.age_band,
      state: 'paired',
      created_at: nowIso(),
      disconnected_at: null,
      daily_counter: { date: '', count: 0 },
    }
    db.couples.push(couple)
    inv.status = 'accepted'
    inv.responded_by = me.user_id
    // Any other live invitations from either person are no longer needed.
    for (const other of db.invitations) {
      if (other !== inv && other.status === 'sent' && (other.inviter_id === me.user_id || other.inviter_id === inviter!.user_id)) {
        other.status = 'cancelled'
      }
    }
    me.invite_step_done = true
    activeSession(db).pending_invite = null
    track(db, 'invitation_accepted', { couple_id: couple.couple_id })
    return coupleView(db, couple, me.user_id)
  })
}

export async function declineInvitation(input: { token: string; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const inv = openInvitation(db, input.token)
    const me = currentUser(db)
    if (me && me.user_id === inv.inviter_id) fail(400, 'This is your own invitation. You can cancel it instead.')
    inv.status = 'declined'
    inv.responded_by = me?.user_id ?? null
    activeSession(db).pending_invite = null
    track(db, 'invitation_declined', {})
    return true as const
  })
}

export async function cancelInvitation(input: { idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const live = db.invitations.filter((i) => i.inviter_id === me.user_id && i.status === 'sent')
    if (live.length === 0) fail(404, 'There is no open invitation to cancel.')
    live.forEach((i) => (i.status = 'cancelled'))
    track(db, 'invitation_cancelled', { user_id: me.user_id })
    return true as const
  })
}

/** Mark the onboarding invite step as seen without sending ("Skip for now"). */
export async function skipInviteStep(input: { idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    me.invite_step_done = true
    track(db, 'invite_skipped', { user_id: me.user_id })
    return true as const
  })
}

// ---------- Couple ----------

export async function getCouple(): Promise<Result<CoupleView | null>> {
  return query((db) => coupleViewFor(db, requireUser(db).user_id))
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Set the household age band and give the partner a neutral notice if it changed. */
export function setHouseholdAgeBand(db: Db, couple: Couple, actorId: string, band: AgeBand) {
  if (couple.age_band === band) return
  couple.age_band = band
  notify(db, {
    user_id: partnerIdOf(couple, actorId),
    type: 'household_notice',
    body: `Your household stage is now ${AGE_BAND_LABELS[band]}. This only shapes future moments.`,
    dedupe_key: `age-band:${couple.couple_id}:${nowMs()}`,
    timeZone: couple.timezone,
  })
  track(db, 'household_age_band_changed', { couple_id: couple.couple_id, age_band: band })
}

export async function updateCouple(input: { timezone?: string; age_band?: AgeBand; idempotencyKey: string }): Promise<Result<CoupleView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const couple = activeCoupleOf(db, me.user_id) ?? fail(403, 'Connect with your partner first.')
    if (input.timezone !== undefined && input.timezone !== couple.timezone) {
      if (!isValidTimezone(input.timezone)) fail(400, 'Please choose a valid timezone.')
      if (couple.timezone_changed_at) {
        const next = Date.parse(couple.timezone_changed_at) + TIMEZONE_CHANGE_COOLDOWN_HOURS * DURATION.HOUR
        if (next > nowMs()) fail(429, 'The shared timezone can only be changed once every 24 hours.')
      }
      couple.timezone = input.timezone
      couple.timezone_changed_at = nowIso()
      track(db, 'couple_timezone_changed', { couple_id: couple.couple_id })
    }
    if (input.age_band !== undefined) {
      if (!AGE_BANDS.includes(input.age_band)) fail(400, 'Please choose a parenthood stage.')
      setHouseholdAgeBand(db, couple, me.user_id, input.age_band)
    }
    return coupleView(db, couple, me.user_id)
  })
}

// ---------- Scheduled job ----------

registerJob('expire_invitations', (db) => {
  let n = 0
  for (const inv of db.invitations) {
    if (inv.status === 'sent' && Date.parse(inv.expires_at) <= nowMs()) {
      inv.status = 'expired'
      n++
    }
  }
  return n
})
