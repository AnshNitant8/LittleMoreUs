// @vitest-environment node
// The real server path end to end: Postgres schema (PGlite), the rpc
// endpoint, two people on two "phones", and a fake Gemini.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAiClient, type AiClient } from '../../src/services/gemini'
import { ConflictError, sqlGateway, type Gateway } from '../gateway'
import { handleRpc, type Caller } from '../rpc'

const SCHEMA = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')

let pg: PGlite
let gateway: Gateway
let n = 0
const k = () => `t:${++n}`

class Phone {
  pending: string | null = null
  readonly caller: Caller | null
  constructor(caller: Caller | null) {
    this.caller = caller
  }
  async call<T = unknown>(fn: string, ...args: unknown[]): Promise<T> {
    const out = await handleRpc({ fn, args, client: { pending_invite: this.pending } }, this.caller, { gateway, adminEmails: ['admin@x.com'] })
    this.pending = out.client.pending_invite
    if (!out.result.ok) throw Object.assign(new Error(out.result.error.message), { error: out.result.error })
    return out.result.data as T
  }
  async attempt(fn: string, ...args: unknown[]) {
    return (await handleRpc({ fn, args, client: { pending_invite: this.pending } }, this.caller, { gateway, adminEmails: ['admin@x.com'] })).result
  }
}

const phone = (email: string | null) => new Phone(email ? { auth_id: `auth-${email}`, email } : null)

function fakeAi() {
  const ai: AiClient = {
    available: true,
    async generateStory(req) {
      return { output: { story_text: `${req.parent_a_label}, ${req.parent_b_label}, I heard you both remember it. I like that you each kept a piece.`, intent_used: req.story_intent }, model: 'fake-lite' }
    },
    async classifyDistress() {
      return false
    },
  }
  setAiClient(ai)
}

async function onboard(p: Phone, name: string, label: string, invite = true) {
  await p.call('completeSignIn', { is_18_confirmed: true })
  await p.call('updateMe', { age_band: '7_12', idempotencyKey: k() })
  await p.call('updateMe', { display_name: name, parent_label: label, idempotencyKey: k() })
  await p.call('updatePreferences', { categories: ['remember_us', 'our_journey', 'little_appreciations', 'what_we_need', 'lets_play'], depth: 'deeper', idempotencyKey: k() })
  if (invite) await p.call('skipInviteStep', { idempotencyKey: k() })
  await p.call('updateMe', { onboarding_complete: true, idempotencyKey: k() })
}

beforeEach(async () => {
  pg = new PGlite()
  await pg.exec(SCHEMA)
  gateway = sqlGateway(pg)
  fakeAi()
})

describe('sign-in on the server', () => {
  it('a new email needs the 18+ confirmation, then gets a profile; signing in again finds it', async () => {
    const anon = phone(null)
    expect(await anon.call('lookupAccount', 'Dolly@Gmail.com')).toEqual({ exists: false, identifier: 'dolly@gmail.com' })
    const dolly = phone('dolly@gmail.com')
    const first = await dolly.attempt('completeSignIn', {})
    expect(!first.ok && first.error.new_account).toBe(true)
    const u = await dolly.call<{ user_id: string; identifier: string }>('completeSignIn', { is_18_confirmed: true })
    expect(u.identifier).toBe('dolly@gmail.com')
    expect(await anon.call('lookupAccount', 'dolly@gmail.com')).toMatchObject({ exists: true })
    const again = await dolly.call<{ user_id: string }>('completeSignIn', {})
    expect(again.user_id).toBe(u.user_id)
  })

  it('re-attaches a profile when the same email signs in with a new sign-in id', async () => {
    const u = await phone('a@x.com').call<{ user_id: string }>('completeSignIn', { is_18_confirmed: true })
    const fresh = new Phone({ auth_id: 'auth-new', email: 'a@x.com' })
    expect((await fresh.call<{ user_id: string }>('completeSignIn', {})).user_id).toBe(u.user_id)
  })

  it('phone numbers are politely refused for now', async () => {
    const r = await phone(null).attempt('lookupAccount', '+919876543210')
    expect(!r.ok && r.error.message).toMatch(/email/)
  })
})

describe('two partners on two phones', () => {
  it('invite, accept, answer privately, and both see one Gemini story', async () => {
    const a = phone('priya@x.com')
    await a.call('completeSignIn', { is_18_confirmed: true })
    await a.call('updateMe', { age_band: '7_12', idempotencyKey: k() })
    await a.call('updateMe', { display_name: 'Priya', parent_label: 'Mama', idempotencyKey: k() })
    const inv = await a.call<{ token: string }>('createInvitation', { idempotencyKey: k(), timezone: 'Asia/Kolkata' })

    // Partner opens the link on their own phone, not signed in yet.
    const b = phone('anika@x.com')
    b.pending = inv.token
    const view = await new Phone(null).call<{ inviter_name: string; status: string }>('getInvitation', inv.token)
    expect(view).toMatchObject({ inviter_name: 'Priya', status: 'sent' })
    await b.call('completeSignIn', { is_18_confirmed: true })
    expect(await b.call('getSession')).toMatchObject({ pending_invite: inv.token })
    const couple = await b.call<{ partner: { display_name: string }; timezone: string }>('acceptInvitation', { token: inv.token, idempotencyKey: k() })
    expect(couple).toMatchObject({ partner: { display_name: 'Priya' }, timezone: 'Asia/Kolkata' })
    expect(b.pending).toBeNull()

    await a.call('updatePreferences', { categories: ['remember_us', 'our_journey', 'little_appreciations', 'what_we_need', 'lets_play'], depth: 'deeper', idempotencyKey: k() })
    await a.call('updateMe', { onboarding_complete: true, idempotencyKey: k() })
    await onboard(b, 'Anika', 'Amma', false)

    const next = await a.call<{ kind: string; question: { question_id: string; text: string } }>('getNextMoment', null)
    expect(next.kind).toBe('question')
    const created = await a.call<{ interaction_id: string }>('createInteraction', { question_id: next.question.question_id, answer: 'Dancing in the kitchen', consent: true, idempotencyKey: k() })

    const home = await b.call<{ waiting_for_you: { interaction_id: string; question: { text: string } }[] }>('getHome')
    expect(home.waiting_for_you[0].interaction_id).toBe(created.interaction_id)
    expect(JSON.stringify(home)).not.toContain('Dancing in the kitchen')

    await b.call('respondToInteraction', { interaction_id: created.interaction_id, answer: 'The rain on the window', consent: true, idempotencyKey: k() })
    const done = await a.call<{ status: string; story_id: string }>('getInteraction', created.interaction_id)
    expect(done.status).toBe('completed')
    const story = await b.call<{ text: string; source: string }>('getStory', done.story_id)
    expect(story.text).toContain('Mama')
    expect(story.text).toContain('Amma')
    const book = await a.call<{ saved: unknown[]; recent: unknown[] }>('listStories')
    expect(book.saved.length + book.recent.length).toBe(1)

    // Saved data never holds Partner A's answer in B's notifications.
    const notes = await pg.query<{ data: unknown }>('select data from app_notifications')
    expect(JSON.stringify(notes.rows)).not.toContain('Dancing')
  })

  it('a stranger cannot read another couple’s moment', async () => {
    const a = phone('a@x.com')
    const b = phone('b@x.com')
    await onboard(a, 'Priya', 'Mama')
    const inv = await a.call<{ token: string }>('createInvitation', { idempotencyKey: k(), timezone: 'UTC' })
    await onboard(b, 'Anika', 'Amma')
    await b.call('acceptInvitation', { token: inv.token, idempotencyKey: k() })
    const q = await a.call<{ question: { question_id: string } }>('getNextMoment', null)
    const c = await a.call<{ interaction_id: string }>('createInteraction', { question_id: q.question.question_id, answer: 'x y z', consent: true, idempotencyKey: k() })
    const eve = phone('eve@x.com')
    await onboard(eve, 'Eve', 'Mum')
    const r = await eve.attempt('getInteraction', c.interaction_id)
    expect(r.ok).toBe(false)
  })
})

describe('access rules', () => {
  it('refuses unknown, prototype-only and admin actions', async () => {
    const a = phone('a@x.com')
    await a.call('completeSignIn', { is_18_confirmed: true })
    for (const fn of ['switchUser', 'advanceClock', 'resetAllPrototypeData', 'verifyOtp', 'nope']) {
      const r = await a.attempt(fn)
      expect(!r.ok && r.error.code).toBe(404)
    }
    const r = await a.attempt('adminListPayments')
    expect(!r.ok && r.error.code).toBe(403)
    const anon = await phone(null).attempt('getHome')
    expect(!anon.ok && anon.error.code).toBe(401)
    const admin = phone('admin@x.com')
    expect(Array.isArray(await admin.call('adminListPayments'))).toBe(true)
  })

  it('retries when the partner saved at the same moment', async () => {
    const a = phone('a@x.com')
    await a.call('completeSignIn', { is_18_confirmed: true })
    let conflicts = 1
    const real = gateway
    gateway = { ...real, commit: async (ops) => (conflicts-- > 0 ? Promise.reject(new ConflictError('x')) : real.commit(ops)) }
    await a.call('updateMe', { display_name: 'Priya', idempotencyKey: k() })
    gateway = real
    expect(await a.call('getMe')).toMatchObject({ display_name: 'Priya' })
  })
})

describe('live dry run (selftest)', () => {
  it('passes every feature on a fresh database and leaves nothing behind', async () => {
    const { runSelftest } = await import('../selftest')
    const before = await pg.query<{ n: number }>('select count(*)::int as n from app_users')
    const out = await runSelftest({ gateway, adminEmails: ['admin@x.com'] })
    const failed = out.checks.filter((c) => !c.ok)
    expect(failed).toEqual([])
    const after = await pg.query<{ n: number }>('select count(*)::int as n from app_users')
    expect(after.rows[0].n).toBe(before.rows[0].n)
    for (const t of ['couples', 'interactions', 'responses', 'stories', 'notifications', 'entitlements', 'invitations']) {
      const r = await pg.query<{ n: number }>(`select count(*)::int as n from app_${t}`)
      expect([t, r.rows[0].n]).toEqual([t, 0])
    }
  }, 60_000)
})
