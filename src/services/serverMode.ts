/**
 * Server mode: a real backend (Supabase + Vercel functions) when the build has
 * a Supabase address. Without one the app runs as the single-device prototype
 * with everything in this browser's storage (used by tests and offline demos).
 */
export const SERVER_MODE = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
