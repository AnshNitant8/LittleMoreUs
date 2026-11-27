// Decisions made where the spec was silent, and known prototype limitations.
// Shown on the in-app Assumptions page in Prototype Controls.

export interface Assumption {
  stage: number
  topic: string
  text: string
  important?: boolean
}

export const ASSUMPTIONS: Assumption[] = [
  {
    stage: 1,
    topic: 'Security',
    important: true,
    text:
      'Browser localStorage is not a secure multi-user datastore. The Partner A / Partner B switch is a usability-test simulation, not real account isolation. Nothing in this prototype (authentication, payments, notifications, data isolation) is production-secure.',
  },
  {
    stage: 1,
    topic: 'Gemini API key',
    important: true,
    text:
      'Gemini is read from the VITE_GEMINI_API_KEY environment variable at build time. A key delivered to the browser is extractable; this is a documented prototype limitation. Without a key, story generation uses the neutral fallback library and the distress check uses the phrase list only. The Gemini code is isolated in src/services/gemini.ts so it can move behind a server endpoint.',
  },
  {
    stage: 1,
    topic: 'Primary colour',
    text:
      'Coral buttons use #C0482F (a darker shade of the suggested #F2765D) so white text meets WCAG AA contrast (4.99:1). #F2765D is used for decoration only.',
  },
  {
    stage: 1,
    topic: 'Two devices on one screen',
    text:
      'Partner A and Partner B are two simulated device slots. Each slot keeps its own signed-in session and local drafts. Switching slot in Prototype Controls is equivalent to picking up the other phone.',
  },
  {
    stage: 1,
    topic: 'Simulated clock',
    text:
      'All time-based rules read a simulated clock (real time plus an offset). The clock can only be moved forward, by +1 hour, +24 hours, +5 days or +7 days. Scheduled jobs run on load, on user switch and after every clock change.',
  },
  {
    stage: 1,
    topic: 'Storage recovery',
    text:
      'If stored data is missing, unreadable or from a different schema version, the app starts with empty data rather than failing. If the browser blocks storage, the app runs in memory for the session and Prototype Controls shows a notice.',
  },
  {
    stage: 1,
    topic: 'Analytics guard',
    text:
      'Analytics events accept only IDs, categories, enums, numbers and booleans. Any string value longer than 64 characters or containing whitespace is dropped before storage, as a defence against answer text reaching analytics.',
  },
  {
    stage: 1,
    topic: 'Support numbers',
    important: true,
    text: 'Verify all numbers before launch. (Tele-MANAS 14416, emergency services 112, Women Helpline 181.)',
  },
  {
    stage: 2,
    topic: 'Prototype sign-in',
    important: true,
    text:
      'Any valid phone number (10–15 digits, optional +) or email is accepted and the code is always 123456. No SMS or email is sent. Codes expire after 10 minutes, resend unlocks after 30 seconds, and 5 wrong codes lock that identifier for 15 minutes. A new code does not lift an active lockout.',
  },
  {
    stage: 2,
    topic: 'One person per simulated device',
    text:
      'The same account cannot be signed in as both Partner A and Partner B at once, because each slot stands for a different person.',
  },
  {
    stage: 2,
    topic: 'Display name and labels',
    text:
      'Display name is 1–40 characters. Parent labels are 1–20 user-perceived characters (grapheme clusters), so labels in any script are counted fairly. Extra spaces are collapsed.',
  },
  {
    stage: 2,
    topic: 'Default notification settings',
    text:
      'Defaults: notification window 09:00–21:00, quiet hours 22:00–07:00, all three toggles on. The window start and end must differ.',
  },
  {
    stage: 2,
    topic: 'Onboarding order',
    text:
      'Onboarding runs: parenthood stage, family profile, choose moments, notification preferences. The invite-partner step is added between moments and notifications with pairing (stage 3). Back lets people revisit earlier steps without losing what they entered.',
  },
  {
    stage: 2,
    topic: 'Terms and Privacy',
    text: 'Terms and Privacy pages hold short prototype placeholder text, not legal documents.',
  },
]
