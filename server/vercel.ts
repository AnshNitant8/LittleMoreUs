// Vercel function entry (bundled by scripts/build-vercel.mjs).
// Secrets come from Vercel's Environment Variables and never reach the browser.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin, supabaseGateway } from './gateway-supabase'
import { createHandler } from './http'

const env = process.env
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || __SUPABASE_URL__
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const missing = [!url && 'SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean)

const handler = missing.length
  ? (_req: IncomingMessage, res: ServerResponse) => {
      // Names only, never values.
      console.error(`[api] server is not configured: missing ${missing.join(', ')}`)
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ result: { ok: false, error: { code: 500, message: 'The server is not set up yet. Please try again later.' } }, client: { pending_invite: null } }))
    }
  : (() => {
      const sb = supabaseAdmin(url!, serviceKey!)
      return createHandler({
        gateway: supabaseGateway(sb),
        async verify(token) {
          const { data, error } = await sb.auth.getUser(token)
          if (error || !data.user?.email) return null
          return { auth_id: data.user.id, email: data.user.email.toLowerCase(), is_18_confirmed: data.user.user_metadata?.is_18_confirmed === true }
        },
        adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        // The older VITE_ name still works; in server mode it never reaches the browser.
        geminiKey: env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY,
        cronSecret: env.CRON_SECRET,
        selftestToken: env.SELFTEST_TOKEN && env.SELFTEST_TOKEN.length >= 16 ? env.SELFTEST_TOKEN : undefined,
      })
    })()

export default handler
