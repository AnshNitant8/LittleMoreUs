// Bundles and starts the local server (server/dev.ts) the same way Vercel's
// function is bundled, so local runs match production.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
mkdirSync('.data', { recursive: true })
await build({
  entryPoints: ['server/dev.ts'],
  outfile: '.data/dev-server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  define: { 'import.meta.env': '{}' },
  logLevel: 'warning',
})
await import(new URL('../.data/dev-server.mjs', import.meta.url).href)
