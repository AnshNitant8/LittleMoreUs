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
  {
    stage: 3,
    topic: 'Invitations',
    text:
      'Each person has at most one live invite link; making a new one cancels the old one. Links expire after invite_expiry_days (default 7). As a prototype rate limit, a person can create at most 10 invitations in 24 hours. Pairing accepted or declined shows as a status on the inviter’s invite card and screen, not as a notification.',
  },
  {
    stage: 3,
    topic: 'Invite links on one device',
    text:
      'Invite links are hash URLs (#/invite/<token>) on the same browser. The token opened on a device is remembered through sign-up or log-in until it is accepted or declined. "Open as partner" switches to the other simulated device and opens the link there.',
  },
  {
    stage: 3,
    topic: 'Declining without an account',
    text: 'An invitation can be declined without signing in. The inviter sees a neutral "Declined" status.',
  },
  {
    stage: 3,
    topic: 'Couple defaults',
    text:
      'The couple timezone is the inviter’s browser timezone when the link was made. The household age band is copied from the inviter. The invitee confirms or changes it in their own onboarding, and any change sends the other partner one neutral in-app notice.',
  },
  {
    stage: 3,
    topic: 'Who can join whom',
    text:
      'You cannot accept your own link, accept while already paired, or join an inviter who has since paired with someone else. When a couple forms, any other open links from either person are cancelled.',
  },
  {
    stage: 3,
    topic: 'Sample story',
    text: 'The unpaired sample moment uses a pre-written story with the labels Mama and Papa, clearly marked Sample. It is static example text, not generated.',
  },
  {
    stage: 4,
    topic: 'Stories in this build',
    important: true,
    text:
      'Until Gemini story generation is connected (stage 5), every completed moment uses the spec’s neutral, intent-matched fallback story and is marked is_fallback. The interaction still completes and raw answers still follow the 24-hour deletion rule.',
  },
  {
    stage: 4,
    topic: 'Question context lines and stage tags',
    text:
      'The spec gives question wording but not context lines, so short neutral context lines were written. Most questions are tagged general. "First hour after our baby arrived" is tagged 1–6 and 7–12 months, and "silliest thing our baby has done lately" is tagged 7–12 and 13–18 months. "Other / prefer not to say" households get general questions only.',
  },
  {
    stage: 4,
    topic: 'When questions come back',
    text:
      'Skipped, declined ("Not this one"), withdrawn and expired questions are held back for that person for 30 days. A question you answered is never offered to you again, and a topic both partners answered is retired for the couple.',
  },
  {
    stage: 4,
    topic: 'Home featured moment',
    text:
      'Home features one question chosen deterministically from the categories you picked during onboarding (falling back to any eligible category). Explore lets you pick any category that neither partner has muted.',
  },
  {
    stage: 4,
    topic: 'Second partner "Skip"',
    text: 'For the second partner, Skip means "not now": it leaves the moment waiting and changes nothing. "Not this one" declines it.',
  },
  {
    stage: 4,
    topic: 'Notification timing',
    text:
      'Push-style notifications (suggestions, partner invitations, reminders, story ready) are created immediately but delivered at the next time inside the person’s notification window and outside quiet hours, in the couple’s timezone. If they fall outside, they wait; they are never dropped. App suggestions: at most one per person per day, and none once the couple has already started two new moments that day.',
  },
  {
    stage: 4,
    topic: 'Reminder copy',
    text: 'The single reminder reads: "Whenever you’re ready, a little [Category] moment is still here for you both." It is sent reminder_delay_hours after the moment starts, at most once.',
  },
  {
    stage: 4,
    topic: 'Offline sending',
    text:
      'Prototype Controls has a "Simulate offline" switch (the real browser offline state also counts). While offline, a submitted answer shows "Sending…" and retries every 2 seconds with the same idempotency key, so it can never create a duplicate moment.',
  },
  {
    stage: 4,
    topic: 'Switching partner',
    text: 'Switching partner in Prototype Controls opens the other partner on their Home screen, like picking up their phone.',
  },
  {
    stage: 5,
    topic: 'Gemini model and timing',
    text: 'Stories use gemini-3.5-flash first (override with VITE_GEMINI_MODEL), then gemini-3.8-flash, with 12 seconds per model. The distress classifier uses one model with a 6 second limit. If Gemini is slow, rate-limited or unavailable, the moment still completes with a library story.',
  },
  {
    stage: 5,
    topic: 'API key in the browser',
    text: 'Prototype only: the Gemini key is read from VITE_GEMINI_API_KEY and ships to the browser, where it can be extracted. A real launch must move both AI calls behind a server. gemini.ts is the only module that would change.',
  },
  {
    stage: 5,
    topic: 'Support region',
    text: 'India contacts are shown when the sign-in identifier is a +91 number or the device time zone is Asia/Kolkata. Everyone else sees the general wording. The helpline numbers still need checking before launch (see Support numbers).',
  },
  {
    stage: 5,
    topic: 'Flagged first answer',
    text: 'If the first answer of a moment is flagged, the moment is held at once and never shown to the partner: no notification and no "Waiting for you" entry. Both answers are purged and only the flag is kept, for 30 days.',
  },
  {
    stage: 5,
    topic: 'Write it again',
    text: '"Write it again" sits inside "Something doesn\'t feel right". It can be used once per story, within 24 hours, while the raw answers still exist. If the first version was already saved to the Storybook, it is kept and the new version appears alongside it.',
  },
  {
    stage: 5,
    topic: 'Dismiss and Done',
    text: 'Dismiss and Done both return Home and leave the story unsaved, so it stays in recent stories but not in the Storybook.',
  },
  {
    stage: 6,
    topic: 'Free window',
    text: 'A story is free to read for free_window_days (30 by default, 5 in Prototype Controls) from the day it was written. After that it shows as a locked preview with only its category and date, and is never deleted.',
  },
  {
    stage: 6,
    topic: 'Who an unlock covers',
    text: "The purchaser can read every story they can see, in any couple. Their partner can read the couple's older stories only while paired with the purchaser. After a disconnect, the other partner goes back to the free window.",
  },
  {
    stage: 6,
    topic: 'Payment reference',
    text: 'The QR image is a decorative placeholder and encodes nothing. A reference must be 6 to 30 letters, numbers or hyphens. Only one payment can be pending at a time, and a rejected payment can be tried again. The reference never goes to analytics.',
  },
  {
    stage: 6,
    topic: 'Export',
    text: 'Changed at your request: export is available only with the full Storybook unlock (the spec had it free). It can be used once per day (in the couple time zone). Without the unlock, Storybook and Profile point to the paywall instead. The JSON holds your profile, your couple settings, and every story you can see, including the text of locked ones, plus the question and your own reaction. It never holds raw answers or your partner\'s reactions.',
  },
  {
    stage: 6,
    topic: 'Deleting a story',
    text: 'Either partner can delete any story they can see, saved, recent or locked. It is removed for both straight away, with its reactions, after a confirmation that says so.',
  },
  {
    stage: 7,
    topic: 'Guess My Answer',
    text: 'Found under Explore. The person who starts picks the option they would choose, and the partner guesses from the same options. Both tick that their pick will be revealed. Once both have picked, both see the two options with a playful line ("Great minds!" or "Ooh, a little surprise!"). No score, no story, no free text. Picks are deleted a day after the reveal. A game counts as a new moment for the daily cap; a guess does not.',
  },
  {
    stage: 7,
    topic: 'Pause and snooze',
    text: 'Pause and snooze only stop app suggestions. Moments your partner starts still appear on Home and still notify you, following your notification settings. A snooze ends by itself after 3 or 7 days.',
  },
  {
    stage: 7,
    topic: 'Disconnect',
    text: 'Either partner can disconnect. Open moments close (closed_disconnected) and their answers are deleted. Saved stories stay for both until either deletes one. The other partner gets a neutral in-app notice. Both can pair again with a new invite.',
  },
  {
    stage: 7,
    topic: 'Account deletion',
    text: 'Deleting an account deletes that person\'s answers at once, ends any pairing and signs them out. Signing in within 7 days offers "Keep my account". After 7 days the account is erased. If "Also delete our shared stories for both of us" was ticked, the couple\'s stories are removed at erasure, so they come back if the account is kept.',
  },
  {
    stage: 7,
    topic: 'Category names in notifications',
    text: 'The spec copy "A little [Category] moment" would read "A little Little Appreciations moment", so for that category it reads "A Little Appreciations moment".',
  },
]
