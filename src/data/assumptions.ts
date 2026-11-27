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
]
