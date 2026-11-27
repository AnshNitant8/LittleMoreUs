// Storybook unlock (spec Sections 4 and 10). Prototype only: no real payment
// is taken. A reference is submitted, then approved or rejected by hand in
// Prototype Controls → Admin. Entitlement belongs to the purchaser and covers
// whichever couple the purchaser is currently in.

import { STORYBOOK_PRICE_LABEL, STORYBOOK_PRODUCT_ID } from '../domain/constants'
import type { Entitlement, EntitlementStatus, Result, Story } from '../domain/types'
import { newId } from '../utils/id'
import { DURATION, nowIso, nowMs } from './clock'
import { activeCoupleOf, fail, mutate, partnerIdOf, query, requireUser, track } from './core'
import type { Db } from './storage'

function hasActive(db: Db, userId: string): boolean {
  return db.entitlements.some((e) => e.purchaser_id === userId && e.status === 'active')
}

/** Who, if anyone, unlocks the full Storybook for this user right now. */
export function unlockedBy(db: Db, userId: string): 'me' | 'partner' | null {
  if (hasActive(db, userId)) return 'me'
  const couple = activeCoupleOf(db, userId)
  if (couple && hasActive(db, partnerIdOf(couple, userId))) return 'partner'
  return null
}

export function withinFreeWindow(db: Db, s: Story): boolean {
  return nowMs() - Date.parse(s.created_at) < db.flags.free_window_days * DURATION.DAY
}

/**
 * A story is readable within the free window, or with an unlock. A partner's
 * unlock only covers stories of the couple they are in with the purchaser, so
 * after a disconnect the non-purchasing partner returns to the free window.
 */
export function storyLocked(db: Db, s: Story, userId: string): boolean {
  if (withinFreeWindow(db, s)) return false
  if (hasActive(db, userId)) return false
  const couple = activeCoupleOf(db, userId)
  if (couple && couple.couple_id === s.couple_id && hasActive(db, partnerIdOf(couple, userId))) return false
  return true
}

export interface EntitlementView {
  price: string
  free_window_days: number
  unlocked: boolean
  unlocked_by: 'me' | 'partner' | null
  /** Status of my most recent purchase, if any. */
  my_status: EntitlementStatus | null
}

function latestOf(db: Db, userId: string): Entitlement | null {
  const mine = db.entitlements.filter((e) => e.purchaser_id === userId)
  return mine.length ? mine[mine.length - 1] : null
}

function viewFor(db: Db, userId: string): EntitlementView {
  const by = unlockedBy(db, userId)
  return {
    price: STORYBOOK_PRICE_LABEL,
    free_window_days: db.flags.free_window_days,
    unlocked: by !== null,
    unlocked_by: by,
    my_status: hasActive(db, userId) ? 'active' : (latestOf(db, userId)?.status ?? null),
  }
}

export async function getEntitlement(): Promise<Result<EntitlementView>> {
  return query((db) => viewFor(db, requireUser(db).user_id))
}

const REFERENCE = /^[A-Za-z0-9-]{6,30}$/

export async function submitPaymentReference(input: { payment_reference: string; idempotencyKey: string }): Promise<Result<EntitlementView>> {
  return mutate(input.idempotencyKey, (db) => {
    const me = requireUser(db)
    const ref = input.payment_reference.replace(/\s+/g, '')
    if (unlockedBy(db, me.user_id)) fail(409, 'Already unlocked')
    if (db.entitlements.some((e) => e.purchaser_id === me.user_id && e.status === 'pending')) {
      fail(409, "We're already checking a payment from you. Your stories stay safe meanwhile.")
    }
    if (!REFERENCE.test(ref)) fail(400, 'Please enter the reference from your payment app: 6 to 30 letters or numbers.')
    db.entitlements.push({
      entitlement_id: newId('ent'),
      purchaser_id: me.user_id,
      product_id: STORYBOOK_PRODUCT_ID,
      status: 'pending',
      payment_reference: ref,
      purchased_at: nowIso(),
    })
    // The reference itself never goes to analytics.
    track(db, 'payment_reference_submitted', { user_id: me.user_id })
    return viewFor(db, me.user_id)
  })
}

// ---------- Admin: verify payment queue (Prototype Controls) ----------

export interface PaymentQueueItem {
  entitlement_id: string
  purchaser: string
  payment_reference: string
  status: EntitlementStatus
  purchased_at: string
}

export async function adminListPayments(): Promise<Result<PaymentQueueItem[]>> {
  return query((db) =>
    [...db.entitlements]
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.purchased_at.localeCompare(a.purchased_at))
      .map((e) => {
        const u = db.users.find((x) => x.user_id === e.purchaser_id)
        return {
          entitlement_id: e.entitlement_id,
          purchaser: u ? `${u.display_name || 'Unnamed'} (${u.parent_label || 'no label'})` : 'Deleted account',
          payment_reference: e.payment_reference,
          status: e.status,
          purchased_at: e.purchased_at,
        }
      }),
  )
}

export async function adminVerifyPayment(input: { entitlement_id: string; decision: 'approve' | 'reject'; idempotencyKey: string }): Promise<Result<true>> {
  return mutate(input.idempotencyKey, (db) => {
    const e = db.entitlements.find((x) => x.entitlement_id === input.entitlement_id) ?? fail(404, 'Payment not found.')
    if (e.status !== 'pending') fail(409, 'This payment has already been reviewed.')
    e.status = input.decision === 'approve' ? 'active' : 'rejected'
    db.audit_log.push({ actor: 'prototype-admin', action: `payment_${input.decision}`, target: e.entitlement_id, timestamp: nowIso() })
    track(db, `payment_${input.decision === 'approve' ? 'approved' : 'rejected'}`, { entitlement_id: e.entitlement_id })
    return true as const
  })
}
