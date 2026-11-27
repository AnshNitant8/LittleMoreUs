# A Little More Us: implementation plan

Built in seven reviewable stages (spec Section 1). A stage is ticked only after
`npm run typecheck`, `npm test`, `npm run build` and a browser check passed.

- [x] **Stage 1: Project foundation.** Vite + React 19 + TypeScript + Tailwind v4.
  Domain types (Section 14), design tokens, simulated clock, storage adapter with
  atomic `transact` and invalid-data recovery, service-layer foundations
  (error format, idempotency keys, metadata-only analytics, scheduled-jobs
  runner), app shell with bottom navigation, Prototype Controls drawer
  (switch user, clock, flags, inbox, analytics, admin placeholder,
  assumptions, reset), in-app Assumptions list, toast for simulated push.
- [x] **Stage 2: Onboarding and profiles.** Welcome, OTP auth (123456,
  10-min expiry, 5-fail 15-min lockout, 30-s resend, one account per
  identifier, duplicate → log in), 18+ age gate, Terms/Privacy pages,
  parenthood stage, family profile (presets + custom 1–20 chars), moment
  preferences (≥1 category + depth), notification window/quiet hours/toggles,
  logout. Service: requestOtp, verifyOtp, logout, getMe, updateMe,
  getPreferences, updatePreferences.
- [x] **Stage 3: Pairing.** Invite step in onboarding (Skip for now) and from
  Home; one-time expiring links with Copy, WhatsApp (wa.me), Cancel,
  Regenerate (old token invalid) and status; prototype "Open as partner";
  Accept screen with token validation (exists, unexpired, unused, not own,
  not already paired), sign-in/create-account path that keeps the token,
  Decline; couple created only on acceptance with inviter timezone and age
  band; invitee onboarding with prefilled stage; partner label hidden until
  set; unpaired Home invitation card and read-only Sample moment; couple
  timezone (once per 24h) and household age band with neutral partner
  notice. Service: createInvitation, getInvitation, acceptInvitation,
  declineInvitation, cancelInvitation, getCouple, updateCouple.
  `disconnectCouple` arrives in Stage 7 with pause/disconnect/delete.
- [x] **Stage 4: Connection Moments.** Seed library (21 paired + 3 game
  questions, verbatim), deterministic selection (filters 1–8, no
  back-to-back high intensity, category rotation, editorial order), skips
  (5/category/day, no cap impact), device-local drafts, consent, atomic
  createInteraction with frozen snapshot + counter + one partner
  notification, duplicate-question redirect, daily cap with replies still
  open, optional pacing label, respond / decline / withdraw (both roles),
  expiry, one reminder deferred into the notification window, raw-answer
  purge 24h after generation, app suggestions, offline queue with
  idempotent retry. Screens: paired Home (featured, Waiting for you, On
  their way, New stories), Explore (new-dot, explored-all, cap message),
  Question/Answer for both roles, Waiting (all states), core Story view.
  Story text is the neutral fallback until Stage 5.
- [ ] **Stage 5: AI stories and safety.** Gemini story generation, validation,
  retry, fallback, distress checks, private support card.
- [ ] **Stage 6: Storybook and payments.** Saved/recent stories, locked
  previews, export, deletion, QR paywall, admin verification.
- [ ] **Stage 7: Remaining features and hardening.** Guess My Answer, profile
  management, pause/disconnect/delete account, notifications, accessibility,
  error states, full acceptance checklist.

## Stage 1 checks
- Type check: pass. Build: pass. Unit tests: 14/14 pass.
- Browser (Chromium, 390×844): shell renders, tab switching, drawer opens,
  clock +5 days, switch to Partner B persists across reload, no console
  errors, no horizontal scroll.

## Stage 2 checks
- Type check: pass. Build: pass. Tests: 31/31 pass (17 new: identifiers,
  age gate, duplicates, OTP expiry/resend/lockout on the simulated clock,
  onboarding order, label validation, full UI sign-up → Home flow).
- Browser (Chromium, 390×844): sign-up with phone, OTP, all four onboarding
  steps, reload keeps session, Profile → Log out returns to Welcome. No
  console errors, no horizontal scroll, no visible targets under 44px.

## Stage 3 checks
- Type check: pass. Build: pass. Tests: 43/43 pass (12 new pairing tests:
  regenerate, cancel, rate limit, expiry via clock, own/unknown token,
  decline, couple creation, invitee onboarding and age-band notice,
  partner-label visibility, timezone cooldown, pairing required).
- Browser (Chromium, 390×844): A signs up → invite step → link, copy,
  WhatsApp URL, regenerate → Open as partner → B creates account → Accept →
  B onboarding (stage prefilled, 4 steps) → B Home shows partner; old link
  shows the friendly expired message; A finishes onboarding and Profile
  shows Anika and her label. No console errors, no horizontal scroll.

## Stage 4 checks
- Type check: pass. Build: pass. Tests: 69/69 pass (26 new: no moment before
  pairing; nothing created before submit; one generic partner notification;
  identical frozen wording and no raw-text leak; consent/empty/500 limits;
  idempotent and offline retry; duplicate redirect; drafts per device;
  story + story-ready to first responder only + 24h purge + topic retired;
  decline; expiry at +7 days; initiator and partner withdraw; one reminder,
  deferred out of quiet hours; cap 4th refused with replies allowed and
  next-day reset; withdrawn counts on creation day; pacing label flags;
  skip limit; depth, high-intensity spacing, muting, "other" band,
  rotation; suggestions once a day and toggle respected).
- Browser (Chromium, 390×844): two partners pair through the UI; A starts the
  featured moment while simulated offline ("Sending…"), goes through when
  back online; B sees the identical wording in "Waiting for you" and never
  A's text; B answers → story; B starts a moment from Explore, A declines →
  neutral "Not this one". Analytics contain no answer text. No console
  errors, no horizontal scroll.

## Stage 5 checks
- Type check: pass. Build: pass. Tests: 89/89 pass (stories and safety:
  minimal Gemini payload with no identifiers or age band; validation rules
  incl. labels, intent shape, invented names, prohibited content; retry once
  then verbatim fallback; timeouts and bad JSON fall back; distress phrase
  list and classifier, classifier error treated as not flagged; flagged
  answers purged with only the flag kept and purged at 30 days; support card
  only for the flagged person; save, react, report hides for the reporter,
  regenerate once; admin review without raw answers; thanks screen stays
  after reporting).
- Browser (Chromium, 390×844, live Gemini): two partners answer a moment and
  a live Gemini story renders (about 18 s with a rate-limited first try);
  React, Save, Report and "Thanks for telling us" work; B's distress answer
  shows the private support card, A sees nothing and the answer text is not
  in storage; analytics contain no answer text. No horizontal scroll.

## Stage 6 checks
- Type check: pass. Build: pass. Tests: 98/98 pass (9 new: saved timeline
  with category-plus-date titles and Recent; unsaved stories removed after
  5 days, saved kept; locked previews hide text, the service refuses locked
  reads, locked stories never deleted; delete by either partner removes for
  both; pending purchase stays locked, Approve unlocks for both partners,
  partner sees "Already unlocked"; Reject stays locked and allows a retry;
  reference validation, kept out of analytics; entitlement stays with the
  purchaser after a disconnect; export has no raw answers, once per day).
- Browser (Chromium, 390×844): save a story → Storybook timeline; free window
  set to 5 days and clock +5 days → locked preview without story text; tap →
  paywall with QR placeholder → reference → "We're checking your payment";
  Admin Approve → unlocked; partner A reads the story and sees "Already
  unlocked"; export downloads JSON with no raw answers, second export the
  same day refused; delete confirmation → removed for both partners.
  Analytics contain no answer text or payment reference. No horizontal scroll.
