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
- [ ] **Stage 2: Onboarding and profiles.** Welcome, OTP auth (123456, expiry,
  lockout, resend), age gate, parenthood stage, family profile, moment
  preferences, notification settings.
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
