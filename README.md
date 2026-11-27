# A Little More Us (prototype)

Mobile-first, browser-only usability prototype. Two partners each answer a
private question, and the app turns both answers into a short story in the
imagined voice of their baby. React + TypeScript + Tailwind, a simulated
backend in `localStorage`, and Gemini through `@google/genai`.

## Run it

```bash
npm install
cp .env.example .env.local   # then set VITE_GEMINI_API_KEY (optional)
npm run dev                  # http://localhost:5173 (best at phone width)
npm test                     # 107 unit and component tests
npm run typecheck && npm run build
```

Without a Gemini key the app still works: every story comes from the
ready-written fallback library, and the distress check uses the phrase list
only.

Open **Prototype Controls** with the yellow gear (top right) to switch between
Partner A and Partner B, move the simulated clock (+1 hour to +7 days), change
feature flags, simulate offline, read the notification inbox and analytics log,
approve payments, review reports, and read the Assumptions page.

OTP code for every account: `123456`.

## Server mode (Vercel + Supabase)

When the build has a Supabase address, the same app runs against a real
server: each partner signs in with an emailed code on their own phone, and
all rules run in a Vercel function (`server/`). Gemini is called only from
the server with `GEMINI_API_KEY`, so no key ships to browsers.

- `supabase/schema.sql`: tables, Row Level Security (no client access at all)
  and the five `app_*` functions the server calls. Every Vercel deploy
  applies it automatically (`scripts/build-vercel.mjs`).
- `server/rpc.ts`: one endpoint. It loads the caller's couple, runs the same
  service functions as the prototype, and saves the changes in one versioned
  write (retried if the partner saved at the same moment).
- Local server mode without Supabase: `npm run dev:server` (Postgres in
  process via PGlite, code 123456) and `npm run dev:app`.
- `npm test` includes server tests with two simulated phones.

## What was built

All seven stages of the build spec:

1. Foundation: service layer, storage, simulated clock, Prototype Controls.
2. Onboarding and profiles, with an 18+ gate and OTP sign-in.
3. Pairing by invite link, with the household stage and a shared timezone.
4. Connection Moments: deterministic question selection, atomic creation, frozen
   wording, decline, withdraw, expiry, one reminder, daily cap, offline retry.
5. AI stories and safety: Gemini with validation, one retry, then the fallback
   library; two-layer distress check with a private support card; reports and
   rewrite.
6. Storybook and payments: saved timeline, Recent, free window and locked
   previews, prototype QR paywall with manual approval, export, delete for both.
7. Guess My Answer, profile management, pause and snooze, disconnect, account
   deletion with a 7-day recovery window, error boundary and accessibility pass.

## Project structure

```
src/
  app/          App shell, hash router, tabs
  components/   Shared UI (Prototype Controls, cards, toasts, QR placeholder)
  data/         Question library, fallback stories, sample moment, assumptions
  domain/       Types, constants, pure rules (question selection, story validation)
  hooks/        useService, useAction, useSubmitWithRetry
  screens/      One folder per area: auth, onboarding, pairing, moments, storybook, account
  services/     The service layer; the UI only calls src/services/api.ts
    gemini.ts   The only module that talks to Gemini
  utils/        Time, ids, download
```

## Not production-ready

- `localStorage` is not a secure multi-user datastore. The Partner A / B switch
  simulates two phones; it is not real account isolation.
- The Gemini key is built into the browser bundle and can be extracted. Move both
  AI calls behind a server before launch (only `gemini.ts` would change).
- OTP, push notifications and payments are simulated. The QR image encodes nothing.
- The distress phrase list and the helpline numbers must be clinically and
  locally reviewed before launch.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for what was tested at
each stage and the acceptance checklist results.
