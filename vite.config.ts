/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

/** Short commit hash of this build, shown in Prototype Controls. Vercel provides it; locally we ask git. */
function buildCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // The Vercel Supabase integration names these SUPABASE_* / NEXT_PUBLIC_SUPABASE_*.
  // Only the public address and the public (anon) key go into the browser.
  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || ''
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
  // With a server, Gemini runs there: never put a Gemini key in the browser bundle.
  const serverMode = Boolean(supabaseUrl && supabaseAnon)
  return {
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    ...(serverMode
      ? {
          'import.meta.env.VITE_GEMINI_API_KEY': 'undefined',
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
          'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnon),
        }
      : {}),
  },
  server: {
    // Local server-mode development: `npm run dev:server` serves /api.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    // The live AI evaluation runs separately (npm run eval:ai).
    exclude: ['**/node_modules/**', 'eval/**'],
  },
  }
})
