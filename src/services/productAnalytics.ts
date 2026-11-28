// Anonymous product analytics with PostHog. Off unless VITE_POSTHOG_KEY is set.
//
// Privacy rules (answers are promised private):
// - Only named events with a short allow-list of properties (category, mode,
//   counts). Never answer text, stories, ideas, names, emails or tokens.
// - No autocapture, no session recording, no page titles; page URLs are
//   reduced to the screen name (no story ids or invite tokens).
// - People are identified only by the app's internal user id.

import type { PostHog } from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

const SAFE_PROPS = new Set(['category', 'mode', 'kind', 'count', 'unlocked', 'source', 'included'])

let client: Promise<PostHog | null> | null = null
let identified: string | null = null

function ph(): Promise<PostHog | null> {
  if (!KEY || typeof window === 'undefined') return Promise.resolve(null)
  client ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: 'identified_only',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        // Only our own end-to-end check turns off PostHog's bot filter.
        opt_out_useragent_filter: (() => { try { return localStorage.getItem('almu.analytics_e2e') === '1' } catch { return false } })(),
        // Keep page addresses and titles out of every event.
        sanitize_properties: (props) => {
          const out = { ...props }
          for (const k of ['$current_url', '$referrer', '$initial_referrer', '$initial_current_url']) {
            if (typeof out[k] === 'string') out[k] = screenUrl(out[k] as string)
          }
          delete out.$title
          return out
        },
      })
      return posthog
    })
    .catch(() => null)
  return client
}

/** "https://x/#/story/sty_123" → "https://x/#/story" (drops ids and tokens). */
function screenUrl(url: string): string {
  try {
    const u = new URL(url)
    const screen = u.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
    return `${u.origin}/#/${screen}`
  } catch {
    return ''
  }
}

function clean(props: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(props)) {
    if (!SAFE_PROPS.has(k)) continue
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && v.length <= 40) out[k] = v
  }
  return out
}

export const analyticsEnabled = () => !!KEY

/** A named product event with allow-listed properties only. */
export function trackEvent(name: string, props?: Record<string, unknown>) {
  void ph().then((p) => p?.capture(name, clean(props)))
}

/** One screen view, by screen name only. */
export function trackScreen(screen: string) {
  void ph().then((p) => p?.capture('$pageview', { $current_url: `${window.location.origin}/#/${screen}` }))
}

/** Tie events to the app's internal user id (never email or name). */
export function identifyUser(userId: string | null) {
  void ph().then((p) => {
    if (!p) return
    if (userId && userId !== identified) {
      p.identify(userId)
      identified = userId
    } else if (!userId && identified) {
      p.reset()
      identified = null
    }
  })
}

/** Service calls that become product events when they succeed. */
const CALL_EVENTS: Record<string, (args: unknown[], data: unknown) => [string, Record<string, unknown>?] | null> = {
  verifyOtp: () => ['signed_in'],
  createInvitation: () => ['invite_sent'],
  acceptInvitation: () => ['invite_accepted'],
  createInteraction: (_a, d) => ['answer_submitted', { kind: 'first', category: (d as { category?: string })?.category }],
  respondToInteraction: (_a, d) => ['answer_submitted', { kind: 'second', category: (d as { category?: string })?.category }],
  createGame: () => ['game_started'],
  respondToGame: () => ['game_answered'],
  saveStory: () => ['story_saved'],
  reactToStory: () => ['story_reacted'],
  regenerateStory: () => ['story_regenerated'],
  reportStory: () => ['story_reported'],
  setKeepsakeWords: (_a, d) => ['keepsake_words', { included: (d as { included?: boolean })?.included }],
  submitPaymentReference: () => ['payment_submitted'],
  requestExport: () => ['stories_exported'],
  deleteStory: () => ['story_deleted'],
  updateMe: (a) => ((a[0] as { onboarding_complete?: boolean })?.onboarding_complete ? ['onboarding_completed'] : null),
  disconnectCouple: () => ['couple_disconnected'],
  deleteAccount: () => ['account_deletion_requested'],
}

/** Wraps a service function so a successful call records its event. */
export function withEvent<F extends (...args: never[]) => Promise<unknown>>(name: string, fn: F): F {
  const ev = CALL_EVENTS[name]
  if (!ev || !KEY) return fn
  return (async (...args: never[]) => {
    const r = (await fn(...args)) as { ok?: boolean; data?: unknown }
    if (r?.ok) {
      const e = ev(args, r.data)
      if (e) trackEvent(e[0], e[1])
    }
    return r
  }) as F
}
