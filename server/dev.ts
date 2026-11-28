// Local server-mode development without Supabase: Postgres in-process (PGlite,
// saved under .data/), and a stand-in sign-in where the code is 123456.
// Start with `npm run dev:server`, then `npm run dev:app`.

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { sqlGateway } from './gateway'
import { createHandler } from './http'

const dir = process.env.PGLITE_DIR ?? '.data/pglite'
const pg = new PGlite(dir === 'memory' ? undefined : dir)
await pg.exec(readFileSync('supabase/schema.sql', 'utf8'))

const handler = createHandler({
  gateway: sqlGateway(pg),
  // Dev tokens look like "dev:<email>" and are only accepted here.
  async verify(token) {
    if (!token.startsWith('dev:')) return null
    const email = token.slice(4).toLowerCase()
    return { auth_id: `dev-${email}`, email }
  },
  adminEmails: (process.env.ADMIN_EMAILS ?? 'admin@example.com').split(',').map((s) => s.trim().toLowerCase()),
  geminiKey: process.env.GEMINI_API_KEY,
  cronSecret: 'dev-cron',
  // DEV_EMAIL_CODES=1: try the app's own code emails; the "email" is printed here.
  signin:
    process.env.DEV_EMAIL_CODES === '1'
      ? {
          secret: 'dev',
          mailer: { send: async (m) => console.log(`[dev-mail] to ${m.to}: ${m.subject}`) },
          openSession: async (email) => ({ access_token: `dev:${email}`, refresh_token: 'dev' }),
        }
      : undefined,
})

const port = Number(process.env.PORT ?? 8787)
createServer((req, res) => void handler(req, res)).listen(port, () => console.log(`[dev-server] http://localhost:${port}/api/rpc`))
