// Live AI evaluation. Runs the real story pipeline (distress check, Gemini
// story + small idea, validation, retry, fallback) on the cases in ./cases.ts.
// Not part of `npm test`: run with `npm run eval:ai` (needs a Gemini key in
// .env.local or GEMINI_API_KEY). Writes eval/results/latest.{json,md}.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createInteraction, respondToInteraction, switchUser } from '../src/services/api'
import { createGeminiClient, setAiClient } from '../src/services/gemini'
import { configureStorage, createMemoryAdapter, readDb } from '../src/services/storage'
import { IDEA_TIMEFRAMES } from '../src/data/suggestions'
import { k, pairedCouple } from '../src/test/helpers'
import { CASES } from './cases'

function key(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    return readFileSync('.env.local', 'utf8').match(/^(?:VITE_)?GEMINI_API_KEY=(.*)$/m)?.[1].trim() ?? ''
  } catch {
    return ''
  }
}

interface Row {
  id: string
  group: string
  expect: string
  note: string
  outcome: 'ai_story' | 'fallback_story' | 'held' | 'error'
  held_at: 'first' | 'second' | null
  model: string | null
  fallback_reason: string | null
  story: string | null
  idea: string | null
  idea_source: 'ai' | 'ready-written' | null
  timeframe: string | null
  ms: number
  pass: boolean
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

it('runs the live AI evaluation', { timeout: 1_200_000 }, async () => {
  const apiKey = key()
  expect(apiKey, 'Gemini key needed').toBeTruthy()
  const rows: Row[] = []
  for (const c of CASES) {
    configureStorage(createMemoryAdapter())
    setAiClient(createGeminiClient(apiKey))
    await pairedCouple()
    const t0 = Date.now()
    const row: Row = { id: c.id, group: c.group, expect: c.expect, note: c.note, outcome: 'error', held_at: null, model: null, fallback_reason: null, story: null, idea: null, idea_source: null, timeframe: null, ms: 0, pass: false }
    try {
      await switchUser('A')
      const first = await createInteraction({ question_id: c.question_id, answer: c.a, consent: true, idempotencyKey: k() })
      if (!first.ok) throw new Error(first.error.message)
      if (first.data.status === 'safety_held') {
        row.outcome = 'held'
        row.held_at = 'first'
      } else {
        await switchUser('B')
        const second = await respondToInteraction({ interaction_id: first.data.interaction_id, answer: c.b, consent: true, idempotencyKey: k() })
        if (!second.ok) throw new Error(second.error.message)
        if (second.data.status === 'safety_held') {
          row.outcome = 'held'
          row.held_at = 'second'
        } else {
          for (let i = 0; i < 120; i++) {
            const it = readDb().interactions.find((x) => x.interaction_id === first.data.interaction_id)
            if (it && it.status !== 'generating') break
            await wait(500)
          }
          const s = readDb().stories.find((x) => x.interaction_id === first.data.interaction_id)
          if (!s) throw new Error('no story')
          row.outcome = s.is_fallback ? 'fallback_story' : 'ai_story'
          row.model = s.model_name
          row.fallback_reason = s.fallback_reason ?? null
          row.story = s.text
          row.idea = s.suggestion ?? null
          row.idea_source = s.suggestion ? (s.suggestion_is_fallback ? 'ready-written' : 'ai') : null
          row.timeframe = s.suggestion_timeframe ?? null
        }
      }
    } catch (e) {
      row.fallback_reason = e instanceof Error ? e.message : String(e)
    }
    row.ms = Date.now() - t0
    const storyOk = (row.outcome === 'ai_story' || row.outcome === 'fallback_story') && !!row.idea && IDEA_TIMEFRAMES.includes(row.timeframe as never)
    row.pass = c.expect === 'held' ? row.outcome === 'held' : c.expect === 'story' ? row.outcome === 'ai_story' && storyOk : storyOk
    rows.push(row)
    console.log(`${row.id} ${row.outcome} ${row.pass ? 'PASS' : 'FAIL'} ${row.ms}ms ${row.fallback_reason ?? ''}`)
  }
  mkdirSync('eval/results', { recursive: true })
  writeFileSync('eval/results/latest.json', JSON.stringify({ ran_at: new Date().toISOString(), rows }, null, 2))
  writeFileSync('eval/results/latest.md', report(rows))
})

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}% (${n}/${d})` : 'n/a'
}

function report(rows: Row[]): string {
  const stories = rows.filter((r) => r.outcome === 'ai_story' || r.outcome === 'fallback_story')
  const ai = stories.filter((r) => r.outcome === 'ai_story')
  const unsafe = rows.filter((r) => r.group === 'unsafe')
  const safe = rows.filter((r) => r.group !== 'unsafe')
  const ms = stories.map((r) => r.ms).sort((a, b) => a - b)
  const lines = [
    `# AI evaluation, ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Live Gemini, same code path as the app (distress check → story + small idea → checks → one retry → ready-written fallback). ${rows.length} made-up answer pairs: ${rows.filter((r) => r.group === 'normal').length} normal, ${rows.filter((r) => r.group === 'edge').length} edge cases, ${unsafe.length} unsafe.`,
    '',
    '| Measure | Result |',
    '| --- | --- |',
    `| Cases that met expectations | ${pct(rows.filter((r) => r.pass).length, rows.length)} |`,
    `| Stories written by Gemini and passing all checks | ${pct(ai.length, stories.length)} |`,
    `| Stories that fell back to the ready-written library | ${pct(stories.length - ai.length, stories.length)} |`,
    `| Unsafe answers caught before any story was written | ${pct(unsafe.filter((r) => r.outcome === 'held').length, unsafe.length)} |`,
    `| Safe answers wrongly held (false alarms) | ${pct(safe.filter((r) => r.outcome === 'held').length, safe.length)} |`,
    `| Stories with a small idea | ${pct(stories.filter((r) => r.idea).length, stories.length)} |`,
    `| Small ideas written by Gemini (rest ready-written) | ${pct(stories.filter((r) => r.idea_source === 'ai').length, stories.length)} |`,
    `| Small ideas with a valid timeframe | ${pct(stories.filter((r) => IDEA_TIMEFRAMES.includes(r.timeframe as never)).length, stories.length)} |`,
    `| Time from second answer to story, median / slowest | ${ms.length ? `${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)}s / ${(ms[ms.length - 1] / 1000).toFixed(1)}s` : 'n/a'} |`,
    '',
    '## Every case',
    '',
    '| Case | Group | Expected | Outcome | Pass | Idea | Timeframe | Note |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.id} | ${r.group} | ${r.expect} | ${r.outcome}${r.held_at ? ` (${r.held_at} answer)` : ''}${r.fallback_reason ? ` · ${r.fallback_reason}` : ''} | ${r.pass ? 'yes' : 'no'} | ${r.idea_source ?? '-'} | ${r.timeframe ?? '-'} | ${r.note} |`),
    '',
    '## Stories and ideas',
    '',
    ...stories.flatMap((r) => [`**${r.id}** (${r.note}, ${r.model})`, '', `> ${r.story}`, '', `Idea (${r.timeframe}): ${r.idea}`, '']),
  ]
  return lines.join('\n')
}
