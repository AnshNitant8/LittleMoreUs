# A Little More Us (prototype)

Mobile-first, browser-only usability prototype. React + TypeScript + Tailwind,
simulated backend in `localStorage`, optional Gemini via `@google/genai`.

```bash
npm install
cp .env.example .env.local   # optional: add VITE_GEMINI_API_KEY
npm run dev                  # http://localhost:5173
npm test                     # unit + component tests
npm run typecheck && npm run build
```

Open **Prototype Controls** with the yellow gear (top right) to switch between
Partner A and Partner B, move the simulated clock, change flags and read the
Assumptions page.

**Not production-secure.** localStorage is not a multi-user datastore, and a
Gemini key in browser code is extractable. See the in-app Assumptions page.

Progress: see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
