// Vercel function entry (bundled by scripts/build-vercel.mjs).
// Secrets come from Vercel's Environment Variables and never reach the browser.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin, supabaseGateway } from './gateway-supabase'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { createHandler } from './http'
import type { SigninDeps } from './signin'

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
      // The app's own code emails, sent over SMTP (Gmail by default, with an app password).
      const smtpUser = env.SMTP_USER?.trim()
      const smtpPass = env.SMTP_PASS?.replace(/\s/g, '')
      const signin: SigninDeps | undefined =
        smtpUser && smtpPass
          ? {
              secret: serviceKey!,
              mailer: (() => {
                const t = nodemailer.createTransport({
                  host: env.SMTP_HOST || 'smtp.gmail.com',
                  port: Number(env.SMTP_PORT || 465),
                  secure: Number(env.SMTP_PORT || 465) === 465,
                  auth: { user: smtpUser, pass: smtpPass },
                })
                const from = env.MAIL_FROM || `A Little More Us <${smtpUser}>`
                return { send: async (m) => void (await t.sendMail({ from, ...m })) }
              })(),
              async openSession(email, is18) {
                // A new person gets a confirmed sign-in; then a one-time token becomes a session.
                await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { is_18_confirmed: is18 } }).catch(() => undefined)
                const link = await sb.auth.admin.generateLink({ type: 'magiclink', email })
                if (link.error || !link.data.properties?.hashed_token) throw new Error(`generateLink: ${link.error?.message ?? 'no token'}`)
                const fresh = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
                const v = await fresh.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' })
                if (v.error || !v.data.session) throw new Error(`verifyOtp: ${v.error?.message ?? 'no session'}`)
                return { access_token: v.data.session.access_token, refresh_token: v.data.session.refresh_token }
              },
            }
          : undefined
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
        signin,
        selftestToken: env.SELFTEST_TOKEN && env.SELFTEST_TOKEN.length >= 16 ? env.SELFTEST_TOKEN : undefined,
      })
    })()

export default handler
