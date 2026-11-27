// Live dry run: two made-up people (and the admin) go through every feature
// on the real server and database, then everything they created is removed.
// Reached at GET /api/selftest?token=… only when SELFTEST_TOKEN is set.
// Test accounts never get a Supabase sign-in, so no emails are sent.

import type { Result } from '../src/domain/types'
import type { Gateway } from './gateway'
import { createGeminiClient } from '../src/services/gemini'
import { handleRpc, type Caller, type RpcDeps } from './rpc'

export interface Check {
  feature: string
  ok: boolean
  detail?: string
}

const ALL = ['remember_us', 'our_journey', 'little_appreciations', 'what_we_need', 'lets_play']

class Person {
  pending: string | null = null
  readonly caller: Caller | null
  readonly deps: RpcDeps
  constructor(caller: Caller | null, deps: RpcDeps) {
    this.caller = caller
    this.deps = deps
  }
  async try<T = unknown>(fn: string, ...args: unknown[]): Promise<Result<T>> {
    const out = await handleRpc({ fn, args, client: { pending_invite: this.pending } }, this.caller, this.deps)
    this.pending = out.client.pending_invite
    return out.result as Result<T>
  }
  async call<T = unknown>(fn: string, ...args: unknown[]): Promise<T> {
    const r = await this.try<T>(fn, ...args)
    if (!r.ok) throw new Error(`${fn}: ${r.error.message}`)
    return r.data
  }
}

export const SELFTEST_PREFIX = 'selftest-'

/**
 * `ai: 'first'` (default) uses live Gemini only for the first story and the
 * Gemini check; the other steps use the backup library so the whole run fits
 * in one minute. `ai: 'all'` uses Gemini everywhere.
 */
export async function runSelftest(base: { gateway: Gateway; adminEmails: string[] }, opts: { ai?: 'first' | 'all' } = {}): Promise<{ ok: boolean; run: string; checks: Check[] }> {
  const offline = createGeminiClient(undefined)
  let live = true
  const deps: RpcDeps = {
    ...base,
    get ai() {
      return live || opts.ai === 'all' ? undefined : offline
    },
  }
  const run = Date.now().toString(36)
  const email = (who: string) => `${SELFTEST_PREFIX}${who}-${run}@example.invalid`
  const person = (who: string) => new Person({ auth_id: `${SELFTEST_PREFIX}${who}-${run}`, email: email(who) }, deps)
  let n = 0
  const k = () => `${SELFTEST_PREFIX}${run}:${++n}`
  const checks: Check[] = []
  const step = async (feature: string, fn: () => Promise<string | void>) => {
    try {
      const detail = await fn()
      checks.push({ feature, ok: true, ...(detail ? { detail } : {}) })
    } catch (e) {
      checks.push({ feature, ok: false, detail: e instanceof Error ? e.message : String(e) })
    }
  }
  const expect = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg)
  }

  const anon = new Person(null, deps)
  const a = person('a')
  const b = person('b')
  const eve = person('eve')
  const admin = deps.adminEmails[0] ? new Person({ auth_id: `${SELFTEST_PREFIX}admin-${run}`, email: deps.adminEmails[0] }, deps) : null
  let token = ''
  let storyId = ''
  let momentId = ''
  let storyText = ''

  try {
    await step('Sign-up asks new people to confirm 18+', async () => {
      const look = await anon.call<{ exists: boolean }>('lookupAccount', email('a'))
      expect(!look.exists, 'new email reported as existing')
      const first = await a.try('completeSignIn', {})
      expect(!first.ok && first.error.new_account, 'account created without 18+')
      await a.call('completeSignIn', { is_18_confirmed: true })
      expect((await anon.call<{ exists: boolean }>('lookupAccount', email('a'))).exists, 'account not found after sign-up')
    })

    await step('Onboarding (stage, name and label, kinds of moments)', async () => {
      await a.call('updateMe', { age_band: '7_12', idempotencyKey: k() })
      await a.call('updateMe', { display_name: 'Test Priya', parent_label: 'Mama', idempotencyKey: k() })
      await a.call('updatePreferences', { categories: ALL, depth: 'mix', idempotencyKey: k() })
      const s = await a.call<{ onboarding_step: string }>('getSession')
      expect(s.onboarding_step === 'invite', `expected the invite step, got ${s.onboarding_step}`)
    })

    await step('Invite link works on another phone before signing in', async () => {
      token = (await a.call<{ token: string }>('createInvitation', { idempotencyKey: k(), timezone: 'Asia/Kolkata' })).token
      const view = await anon.call<{ inviter_name: string; status: string }>('getInvitation', token)
      expect(view.inviter_name === 'Test Priya' && view.status === 'sent', 'invite view wrong')
    })

    await step('Partner signs up from the invite and accepts', async () => {
      b.pending = token
      await b.call('completeSignIn', { is_18_confirmed: true })
      const s = await b.call<{ pending_invite: string | null }>('getSession')
      expect(s.pending_invite === token, 'invite not kept through sign-up')
      const c = await b.call<{ partner: { display_name: string } }>('acceptInvitation', { token, idempotencyKey: k() })
      expect(c.partner.display_name === 'Test Priya', 'couple not linked')
      await b.call('updateMe', { age_band: '7_12', idempotencyKey: k() })
      await b.call('updateMe', { display_name: 'Test Anika', parent_label: 'Amma', idempotencyKey: k() })
      await b.call('updatePreferences', { categories: ALL, depth: 'mix', idempotencyKey: k() })
      await b.call('updateMe', { onboarding_complete: true, idempotencyKey: k() })
      await a.call('updateMe', { onboarding_complete: true, idempotencyKey: k() })
    })

    const question = async (p: Person) => {
      for (const cat of [null, ...ALL]) {
        const m = await p.call<{ kind: string; question?: { question_id: string } }>('getNextMoment', cat)
        if (m.kind === 'question' && m.question) return m.question.question_id
      }
      throw new Error('no question available')
    }

    await step('Moment: answers stay private until both answer', async () => {
      const q = await question(a)
      momentId = (await a.call<{ interaction_id: string }>('createInteraction', { question_id: q, answer: 'Selftest: the rainy walk to the station', consent: true, idempotencyKey: k() })).interaction_id
      const home = await b.call<{ waiting_for_you: { interaction_id: string }[] }>('getHome')
      expect(home.waiting_for_you.some((i) => i.interaction_id === momentId), 'partner does not see the moment')
      expect(!JSON.stringify(home).includes('rainy walk'), "partner can see the other person's answer")
    })

    await step('AI story written for both', async () => {
      await b.call('respondToInteraction', { interaction_id: momentId, answer: 'Selftest: the hot chai afterwards', consent: true, idempotencyKey: k() })
      const v = await a.call<{ status: string; story_id: string | null }>('getInteraction', momentId)
      expect(v.status === 'completed' && v.story_id, `moment status ${v.status}`)
      storyId = v.story_id!
      const sa = await a.call<{ text: string }>('getStory', storyId)
      const sb = await b.call<{ text: string }>('getStory', storyId)
      expect(sa.text && sa.text === sb.text, 'partners see different stories')
      storyText = sa.text
      const status = admin ? await admin.call<{ recent: { story_id: string; source: string; fallback_reason: string | null }[] }>('getAiStatus') : null
      const mine = status?.recent.find((r) => r.story_id === storyId)
      return mine ? (mine.fallback_reason ? `fallback story, reason: ${mine.fallback_reason}` : `written by ${mine.source}`) : undefined
    })

    await step('Gemini answers from the live server', async () => {
      expect(admin, 'ADMIN_EMAILS is not set')
      // testGemini answers with its own shape, not the usual ok/data wrapper.
      const t = (await admin!.try('testGemini')) as unknown as { ok: boolean; model?: string; ms: number; reason?: string; passed_checks?: boolean; error?: { message: string } }
      expect(!t.error, `testGemini: ${t.error?.message}`)
      expect(t.ok, `Gemini call failed after ${t.ms} ms: ${t.reason}`)
      return `${t.model} in ${t.ms} ms${t.passed_checks === false ? ', but the story failed the checks' : ''}`
    })
    live = false

    await step('Story: save, react, Storybook list', async () => {
      await a.call('saveStory', { story_id: storyId, idempotencyKey: k() })
      await b.call('reactToStory', { story_id: storyId, value: '🥹', idempotencyKey: k() })
      const book = await a.call<{ saved: unknown[]; recent: unknown[] }>('listStories')
      expect(book.saved.length + book.recent.length >= 1, 'story missing from Storybook')
    })

    await step('Another person cannot open this couple’s moment or story', async () => {
      await eve.call('completeSignIn', { is_18_confirmed: true })
      expect(!(await eve.try('getInteraction', momentId)).ok, 'stranger opened the moment')
      expect(!(await eve.try('getStory', storyId)).ok, 'stranger opened the story')
    })

    await step('Safety: a distress answer shows support privately and makes no story', async () => {
      const q = await question(a)
      const c = await a.call<{ interaction_id: string; status: string; show_support: boolean }>('createInteraction', { question_id: q, answer: 'Selftest: some days I want to die', consent: true, idempotencyKey: k() })
      expect(c.show_support, 'support card not shown to the writer')
      const theirs = await b.call<{ waiting_for_you: { interaction_id: string }[] }>('getHome')
      expect(!theirs.waiting_for_you.some((i) => i.interaction_id === c.interaction_id), 'partner was asked to answer a held moment')
    })

    await step('Decline and withdraw a moment', async () => {
      const q1 = await question(b)
      const m1 = await b.call<{ interaction_id: string }>('createInteraction', { question_id: q1, answer: 'Selftest: you warmed the milk', consent: true, idempotencyKey: k() })
      const d = await a.call<{ status: string }>('declineInteraction', { interaction_id: m1.interaction_id, idempotencyKey: k() })
      expect(d.status === 'declined', `decline gave ${d.status}`)
      const q2 = await question(a)
      const m2 = await a.call<{ interaction_id: string }>('createInteraction', { question_id: q2, answer: 'Selftest: a slow Sunday', consent: true, idempotencyKey: k() })
      const w = await a.call<{ status: string }>('withdrawInteraction', { interaction_id: m2.interaction_id, idempotencyKey: k() })
      expect(w.status === 'withdrawn', `withdraw gave ${w.status}`)
    })

    await step('Guess My Answer: play and reveal', async () => {
      const g = await a.call<{ kind: string; question?: { question_id: string }; options?: { option_id: string }[] }>('getNextGame')
      expect(g.kind === 'game' && g.question && g.options?.length, `no game (${g.kind})`)
      const game = await a.call<{ interaction_id: string }>('createGame', { question_id: g.question!.question_id, option_id: g.options![0].option_id, acknowledged: true, idempotencyKey: k() })
      await b.call('respondToGame', { interaction_id: game.interaction_id, option_id: g.options![g.options!.length - 1].option_id, acknowledged: true, idempotencyKey: k() })
      const v = await a.call<{ reveal: unknown }>('getInteraction', game.interaction_id)
      expect(v.reveal, 'no reveal after both played')
    })

    await step('Export is locked before the Storybook unlock', async () => {
      const r = await a.try('requestExport', { idempotencyKey: k() })
      expect(!r.ok && r.error.locked, 'export allowed without unlock')
    })

    await step('Payment: reference, admin approval, unlock, export', async () => {
      expect(admin, 'ADMIN_EMAILS is not set')
      await a.call('submitPaymentReference', { payment_reference: `SELFTEST-${run}`.toUpperCase(), idempotencyKey: k() })
      const queue = await admin!.call<{ entitlement_id: string; payment_reference?: string }[]>('adminListPayments')
      const mine = queue.find((q) => JSON.stringify(q).includes(`SELFTEST-${run}`.toUpperCase()))
      expect(mine, 'payment not in the admin queue')
      await admin!.call('adminVerifyPayment', { entitlement_id: mine!.entitlement_id, decision: 'approve', idempotencyKey: k() })
      const ent = await b.call<{ unlocked: boolean }>('getEntitlement')
      expect(ent.unlocked, 'partner not unlocked after approval')
      const exp = await a.try('requestExport', { idempotencyKey: k() })
      expect(exp.ok, `export failed: ${!exp.ok ? exp.error.message : ''}`)
    })

    await step('Report a story and admin review', async () => {
      expect(admin, 'ADMIN_EMAILS is not set')
      await b.call('reportStory', { story_id: storyId, reason: 'uncomfortable', idempotencyKey: k() })
      const reps = await admin!.call<{ report_id: string; story_text: string; outcome: string | null }[]>('adminListReports')
      const rep = reps.find((r) => r.story_text === storyText && !r.outcome)
      expect(rep, 'report not in the admin queue')
      await admin!.call('adminReviewReport', { report_id: rep!.report_id, outcome: 'no_action', idempotencyKey: k() })
    })

    await step('Admin screens are refused to everyone else', async () => {
      const r = await a.try('adminListPayments')
      expect(!r.ok && r.error.code === 403, 'non-admin reached the admin queue')
    })

    await step('Pause and snooze', async () => {
      await a.call('updatePreferences', { paused: true, idempotencyKey: k() })
      await a.call('updatePreferences', { paused: false, idempotencyKey: k() })
      await a.call('updatePreferences', { snooze_days: 3, idempotencyKey: k() })
    })

    await step('Disconnect the couple', async () => {
      await a.call('disconnectCouple', { confirm: true, idempotencyKey: k() })
      expect((await b.call<{ couple: unknown }>('getSession')).couple === null, 'partner still paired')
    })

    await step('Delete account with the 7-day recovery window', async () => {
      const d = await b.call<{ erase_at: string }>('deleteAccount', { also_delete_shared_stories: false, confirm: true, idempotencyKey: k() })
      expect(d.erase_at, 'no erase date')
      const s = await b.call<{ erase_at: string | null }>('getSession')
      expect(s.erase_at, 'recovery window not shown on sign-in')
      await b.call('cancelAccountDeletion', { idempotencyKey: k() })
    })
  } finally {
    const removed = await deps.gateway.cleanupSelftest(`${SELFTEST_PREFIX}`).catch((e) => `cleanup failed: ${e instanceof Error ? e.message : e}`)
    checks.push({ feature: 'Test data removed', ok: typeof removed === 'number', detail: typeof removed === 'number' ? `${removed} records` : removed })
  }
  return { ok: checks.every((c) => c.ok), run, checks }
}
