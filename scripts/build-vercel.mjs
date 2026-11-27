// Runs after `vite build` on Vercel (or with --force locally):
//  1. brings the Supabase database up to date with supabase/schema.sql
//     (safe to repeat), using the Postgres address the Vercel Supabase
//     integration provides;
//  2. bundles the server into Vercel functions and writes the deployment in
//     Vercel's Build Output format (.vercel/output).
import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = process.env
if (!env.VERCEL && !process.argv.includes('--force')) {
  console.log('[build-vercel] not on Vercel: skipped')
  process.exit(0)
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || ''
if (!supabaseUrl) {
  // No database connected yet: deploy the browser-only prototype from dist/ as before.
  console.log('[build-vercel] no Supabase connected: deploying the browser-only prototype')
  process.exit(0)
}

const dbUrl = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL
if (dbUrl && !process.argv.includes('--no-migrate')) {
  const { default: pg } = await import('pg')
  // Supabase requires TLS; its pooler certificate is not in Node's default store.
  const url = new URL(dbUrl)
  url.searchParams.delete('sslmode')
  const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(readFileSync('supabase/schema.sql', 'utf8'))
  await client.end()
  console.log('[build-vercel] database schema is up to date')
} else {
  console.warn('[build-vercel] no POSTGRES_URL: database schema not applied (add the Supabase integration in Vercel)')
}

const out = resolve('.vercel/output')
rmSync(out, { recursive: true, force: true })
mkdirSync(`${out}/functions/api`, { recursive: true })

const fn = `${out}/functions/api/rpc.func`
await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  sourcemap: false,
  define: { 'import.meta.env': '{}', __SUPABASE_URL__: JSON.stringify(supabaseUrl) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
})
const vc = { runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60, regions: [env.FUNCTION_REGION || 'bom1'] }
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify(vc, null, 2))
cpSync(fn, `${out}/functions/api/cron.func`, { recursive: true })
cpSync(fn, `${out}/functions/api/health.func`, { recursive: true })
cpSync(fn, `${out}/functions/api/selftest.func`, { recursive: true, force: true })

cpSync('dist', `${out}/static`, { recursive: true })
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
      ],
      // Daily clean-up across all couples (Vercel's Hobby plan allows one run a day).
      crons: [{ path: '/api/cron', schedule: '30 21 * * *' }],
    },
    null,
    2,
  ),
)
console.log('[build-vercel] wrote .vercel/output (static site + /api/rpc + /api/cron)')
