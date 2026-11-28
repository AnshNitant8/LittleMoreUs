// Deterministic post-call validation of AI stories (spec Section 8).
import { PARENT_LABEL_PRESETS } from '../constants'
import type { StoryIntent } from '../types'

export interface StoryValidationInput {
  text: string
  intent_used: string
  story_intent: StoryIntent
  /** Labels as they must appear (with first names when labels matched). */
  labels: [string, string]
  question: string
  context: string
  answers: [string, string]
}

export type StoryProblem =
  | 'sentence_count'
  | 'too_long'
  | 'missing_label'
  | 'intent_mismatch'
  | 'foreign_label'
  | 'future_plan_not_forward'
  | 'future_plan_narrates_past'
  | 'memory_only_future'
  | 'invented_name'
  | 'prohibited_content'
  | 'empty'

export const MAX_STORY_CHARS = 650 // "at most about 600"

/** Common parent words that must not appear unless supplied by the couple. */
const PARENT_WORDS = [
  ...PARENT_LABEL_PRESETS,
  'Mum', 'Mom', 'Mommy', 'Mummy', 'Mumma', 'Momma', 'Mother', 'Daddy', 'Dada', 'Father', 'Papa', 'Pappa', 'Amma', 'Appa', 'Abba', 'Ammi', 'Maa', 'Baba',
]

const FORWARD = /\b(will|might|may|maybe|could|would|leaning|lean|hope|hoping|wonder|someday|soon|next|plan|planning|looking forward|going to|perhaps)\b/i
const PAST_NARRATION = /\b(remember(ed|s)?|used to|back when|years ago|that day|once upon)\b/i
const PAST_MARKERS = /\b(remember\w*|was|were|did|had|used to|back then|before)\b|\b\w{3,}ed\b/i

const PROHIBITED: RegExp[] = [
  /\bdiagnos\w*/i,
  /\b(depress\w*|anxiety disorder|postpartum|disorder|symptom\w*|medicat\w*|medicine|doctor|therap\w*|counsel\w*)\b/i,
  /\b(you should|you need to|you must|you ought|try to|make sure you|it'?s important to)\b/i,
  /\b(blame|fault|selfish|lazy|neglect\w*|disappoint\w*)\b/i,
  /\b(better|worse) (parent|mum|mom|dad|than)\b/i,
  /\bmore than (mama|papa|mumma|dad|mum|mom|baba|ammi)\b/i,
  /\b(guilt\w*|ashamed|shame|sad because of you|you made me (sad|cry))\b/i,
  /\b(sex\w*|naked|nude|kiss(ed|ing)? passionately)\b/i,
]

const ALLOWED_CAPITALISED = new Set([
  'I', "I'm", "I'd", "I'll", "I've", 'OK',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Sundays', 'Saturdays',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
])

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])["'”’)]*\s+(?=["'“‘(]?[A-Z0-9\p{Lu}])/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Lower-case words, also without a possessive 's ("Riya's" gives "riya's" and "riya"). */
const words = (s: string) => (s.toLowerCase().replace(/’/g, "'").match(/[\p{L}\p{N}']+/gu) ?? []).flatMap((w) => (/'s$/.test(w) ? [w, w.slice(0, -2)] : [w]))

export function validateStory(input: StoryValidationInput): StoryProblem[] {
  const problems: StoryProblem[] = []
  const text = input.text.trim()
  if (!text) return ['empty']
  const sentences = splitSentences(text)
  if (sentences.length < 2 || sentences.length > 4) problems.push('sentence_count')
  if (text.length > MAX_STORY_CHARS) problems.push('too_long')
  if (input.labels.some((l) => !text.includes(l))) problems.push('missing_label')
  if (input.intent_used !== input.story_intent) problems.push('intent_mismatch')

  const source = `${input.question} ${input.context} ${input.answers.join(' ')}`
  const sourceWords = new Set(words(source))
  const labelWords = new Set(input.labels.flatMap((l) => words(l)))

  for (const w of PARENT_WORDS) {
    const lw = w.toLowerCase()
    if (labelWords.has(lw) || sourceWords.has(lw)) continue
    if (new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text)) {
      problems.push('foreign_label')
      break
    }
  }

  if (input.story_intent === 'future_plan') {
    if (!FORWARD.test(text)) problems.push('future_plan_not_forward')
    if (PAST_NARRATION.test(text)) problems.push('future_plan_narrates_past')
  }
  if (input.story_intent === 'memory' && !PAST_MARKERS.test(text)) problems.push('memory_only_future')

  // Named entities: capitalised words mid-sentence that appear nowhere in the inputs.
  for (const sentence of sentences) {
    const tokens = sentence.match(/[\p{L}'’]+/gu) ?? []
    tokens.slice(1).forEach((tok) => {
      const clean = tok.replace(/[’']s$/, '')
      if (!/^\p{Lu}/u.test(clean) || ALLOWED_CAPITALISED.has(clean)) return
      const lw = clean.toLowerCase()
      if (labelWords.has(lw) || sourceWords.has(lw)) return
      if (!problems.includes('invented_name')) problems.push('invented_name')
    })
  }

  // A word the question itself uses (e.g. "lazy Sunday") is fine to repeat.
  const asked = `${input.question} ${input.context}`.toLowerCase()
  if (PROHIBITED.some((re) => { const m = re.exec(text); return !!m && !asked.includes(m[0].toLowerCase()) })) problems.push('prohibited_content')
  return problems
}

export const MAX_SUGGESTION_CHARS = 220

/**
 * The optional "small idea" from the model: one or two short sentences, no
 * links, no advice words, no names that aren't in the inputs. Returns true if
 * it can be shown; otherwise the ready-written idea is used instead.
 */
export function suggestionOk(text: string, input: Pick<StoryValidationInput, 'labels' | 'question' | 'context' | 'answers'>): boolean {
  const t = text.trim()
  if (t.length < 15 || t.length > MAX_SUGGESTION_CHARS) return false
  const sentences = splitSentences(t)
  if (sentences.length > 2) return false
  if (/https?:|www\.|@/i.test(t)) return false
  // A word the question itself uses (e.g. "lazy Sunday") is fine to repeat.
  const asked = `${input.question} ${input.context}`.toLowerCase()
  if (PROHIBITED.some((re) => { const m = re.exec(t); return !!m && !asked.includes(m[0].toLowerCase()) })) return false
  if (/\b(relationship advice|couples?|marriage|divorce|parenting tip|app|download|buy|book a)\b/i.test(t)) return false
  const known = new Set([...words(`${input.question} ${input.context} ${input.answers.join(' ')}`), ...input.labels.flatMap((l) => words(l))])
  for (const sentence of sentences) {
    for (const tok of (sentence.match(/[\p{L}'’]+/gu) ?? []).slice(1)) {
      const clean = tok.replace(/[’']s$/, '')
      if (/^\p{Lu}/u.test(clean) && !ALLOWED_CAPITALISED.has(clean) && !known.has(clean.toLowerCase())) return false
    }
  }
  return true
}

/** Labels to pass to the model: when labels match case-insensitively, add first names. */
export function storyLabels(a: { label: string; name: string }, b: { label: string; name: string }): [string, string] {
  if (a.label.trim().toLowerCase() === b.label.trim().toLowerCase()) {
    const first = (n: string) => n.trim().split(/\s+/)[0] || ''
    return [`${a.label} ${first(a.name)}`.trim(), `${b.label} ${first(b.name)}`.trim()]
  }
  return [a.label, b.label]
}
