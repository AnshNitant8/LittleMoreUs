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
- [ ] **Stage 3: Pairing.** Invitations, accept/decline, couple creation,
  unpaired state with sample moment.
- [ ] **Stage 4: Connection Moments.** Question selection, Explore, drafts,
  consent, atomic interaction creation, waiting states, withdraw, decline,
  expiry, daily cap, reminders, scheduled jobs.
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
