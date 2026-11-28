// The only module that talks to Gemini. Kept isolated so it can later move
// behind a server endpoint without touching the rest of the app.
//
// Server mode: this runs only on the server, with GEMINI_API_KEY from Vercel.
// Browser-only prototype: the key comes from VITE_GEMINI_API_KEY and is
// shipped to the browser, where it is extractable. Not production-safe.

import { GoogleGenAI, Type } from '@google/genai'

/**
 * Browser-prototype settings. The server bundle defines import.meta.env as {}
 * and passes its own key; server-mode browser builds blank the key out.
 */
const viteEnv = {
  VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
  VITE_GEMINI_MODEL: import.meta.env.VITE_GEMINI_MODEL as string | undefined,
}

export const STORY_SYSTEM_INSTRUCTION =
  'You write one short story in the imagined voice of a baby or toddler speaking to their two parents. Output JSON only: {"story_text": string, "intent_used": string}. Rules: 2 to 4 sentences, at most about 600 characters, text only. Use each parent\'s label exactly as supplied and give both parents balanced attention. Use only information in the question and the two answers. Never invent facts, feelings, plans, agreement, compromise or happy endings. Never judge or compare the parents, never use the child to create guilt, never give medical, therapeutic or relationship advice, never claim to know the child\'s real feelings. Choose the narrative shape from story_intent and never infer the intent from the answers: memory = reflective past tense; present or appreciation = present tense; preference = framed as choices, not events; future_plan = forward-looking ("is leaning towards", "might"), never narrating a past memory; support = acknowledge needs without claiming anything is resolved; playful_hypothetical = light, never turning a guess into a fact. Set intent_used equal to story_intent. If both labels are identical, use the label with the first name each time. Also write suggestion: one short, warm sentence (at most about 180 characters), addressed to both parents, offering one small, doable thing they could do together that is directly about this question\'s topic and may build on what their answers mention. Phrase it as a gentle idea ("You could...", "Maybe..."), never as an instruction. It must stay within the question\'s topic: no general relationship, parenting, health or therapy advice, no products, apps, links or places to book, no judging, and nothing that isn\'t in the question or the answers.'

/** Style-only examples (spec Section 8). Sent as context, never to be copied. */
export const FEW_SHOT_EXAMPLES = {
  memory:
    'Mumma, Papa, I heard that you both remember the rainy evening you first danced in the kitchen. One of you remembers the music, the other remembers laughing. I like that you each keep a different piece of it.',
  appreciation:
    'Mama, you noticed how Baba warmed my milk before dawn. Baba, you noticed Mama humming to me when the house was quiet. I think you are both quietly looking after each other too.',
  future_plan:
    'Mumma is leaning towards a slow Sunday walk, and Papa is leaning towards a long breakfast. I wonder if there might be room for a little of both.',
  playful_hypothetical:
    'If I picked our song, Papa thinks it might be something with a lot of drums, and Mumma thinks it might be a lullaby that sounds like a hum. I think I would keep both on repeat.',
}

export const DISTRESS_SYSTEM_INSTRUCTION =
  'You are a cautious safety classifier for a couples app used by new parents. Decide whether the text suggests the writer may be in distress: postpartum low mood or depression, hopelessness, thoughts of self-harm or suicide, or feeling unsafe at home or afraid of a partner. Be sensitive: when in doubt, answer true. Ordinary tiredness or everyday frustration alone is not distress. Output JSON only: {"distress": boolean}.'

/** Exactly the fields allowed to leave the device for a story (spec Section 8). */
export interface StoryRequest {
  question: string
  context: string
  story_intent: string
  story_pattern: string
  /** Label as it must appear (with first name when labels match). */
  parent_a_label: string
  parent_b_label: string
  answer_from_parent_a: string
  answer_from_parent_b: string
}

export interface StoryModelOutput {
  story_text: string
  intent_used: string
  /** One small thing the two parents could do together, about this question only. */
  suggestion?: string
}

/** The two AI jobs. Swappable so tests (or a future server) can provide them. */
export interface AiClient {
  readonly available: boolean
  /** Returns parsed JSON or throws. */
  generateStory(req: StoryRequest): Promise<{ output: StoryModelOutput; model: string }>
  /** Returns the classifier verdict or throws. */
  classifyDistress(text: string): Promise<boolean>
}

/**
 * Tried in order. Measured 27 Nov 2026 with the project key: the flash-lite
 * models answer in under a second, while gemini-3.5-flash often timed out and
 * gemini-3.8-flash returned 503 "high demand". Override the first choice with
 * VITE_GEMINI_MODEL.
 */
export const MODELS = [
  viteEnv.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
].filter((m, i, all) => all.indexOf(m) === i)
const STORY_TIMEOUT_MS = 10_000
const CLASSIFY_TIMEOUT_MS = 6_000
const BUSY = /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export function createGeminiClient(apiKey: string | undefined): AiClient {
  if (!apiKey) {
    return {
      available: false,
      generateStory: () => Promise.reject(new Error('no_api_key')),
      classifyDistress: () => Promise.reject(new Error('no_api_key')),
    }
  }
  const ai = new GoogleGenAI({ apiKey })

  /**
   * Try each model in turn. A busy answer (503 or 429) is retried on the same
   * model after a short pause, within `budgetMs` overall, so one crowded
   * moment at Google does not send the couple a library story.
   */
  async function firstModelThatAnswers<T>(run: (model: string) => Promise<T>, timeoutMs: number, models = MODELS, budgetMs = timeoutMs * 2): Promise<{ value: T; model: string }> {
    let lastError: unknown = null
    const deadline = Date.now() + budgetMs
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const left = deadline - Date.now()
        if (left < 1_000) throw lastError ?? new Error('timeout')
        try {
          return { value: await withTimeout(run(model), Math.min(timeoutMs, left)), model }
        } catch (e) {
          lastError = e
          const msg = e instanceof Error ? e.message : String(e)
          if (!BUSY.test(msg)) break
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
        }
      }
    }
    throw lastError ?? new Error('no_model')
  }

  return {
    available: true,
    async generateStory(req) {
      const contents = JSON.stringify({
        style_examples_do_not_copy: FEW_SHOT_EXAMPLES,
        input: req,
      })
      const { value, model } = await firstModelThatAnswers(
        (m) =>
          ai.models.generateContent({
            model: m,
            contents,
            config: {
              systemInstruction: STORY_SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: { story_text: { type: Type.STRING }, intent_used: { type: Type.STRING }, suggestion: { type: Type.STRING } },
                required: ['story_text', 'intent_used', 'suggestion'],
              },
              temperature: 0.7,
            },
          }),
        STORY_TIMEOUT_MS,
      )
      const parsed = JSON.parse(value.text ?? '') as Partial<StoryModelOutput>
      if (typeof parsed.story_text !== 'string' || typeof parsed.intent_used !== 'string') throw new Error('bad_shape')
      return { output: { story_text: parsed.story_text, intent_used: parsed.intent_used, ...(typeof parsed.suggestion === 'string' ? { suggestion: parsed.suggestion } : {}) }, model }
    },
    async classifyDistress(text) {
      const { value } = await firstModelThatAnswers(
        (m) =>
          ai.models.generateContent({
            model: m,
            contents: JSON.stringify({ text }),
            config: {
              systemInstruction: DISTRESS_SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: { type: Type.OBJECT, properties: { distress: { type: Type.BOOLEAN } }, required: ['distress'] },
              temperature: 0,
            },
          }),
        CLASSIFY_TIMEOUT_MS,
        // One model, one short budget: a slow classifier must not hold up sending an answer.
        MODELS.slice(0, 1),
        CLASSIFY_TIMEOUT_MS,
      )
      const parsed = JSON.parse(value.text ?? '') as { distress?: unknown }
      if (typeof parsed.distress !== 'boolean') throw new Error('bad_shape')
      return parsed.distress
    },
  }
}

let client: AiClient = createGeminiClient(viteEnv.VITE_GEMINI_API_KEY)

let resolveClient: (() => AiClient | undefined) | null = null

/** Server: lets one request (the dry run) use its own client without touching others. */
export function setAiClientResolver(fn: () => AiClient | undefined) {
  resolveClient = fn
}

export function getAiClient(): AiClient {
  return resolveClient?.() ?? client
}

export interface ModelProbe {
  model: string
  ok: boolean
  ms: number
  error?: string
}

/** One plain call to each model at once, no retries: shows which ones answer right now. */
export async function probeGemini(apiKey: string | undefined): Promise<ModelProbe[]> {
  if (!apiKey) return [{ model: '-', ok: false, ms: 0, error: 'no_api_key' }]
  const ai = new GoogleGenAI({ apiKey })
  return Promise.all(
    MODELS.map(async (model) => {
      const t = Date.now()
      try {
        await withTimeout(ai.models.generateContent({ model, contents: 'Reply with the word ok.' }), 15_000)
        return { model, ok: true, ms: Date.now() - t }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { model, ok: false, ms: Date.now() - t, error: msg.replace(/AIza[\w-]+|AQ\.[\w-]+/g, '[key]').slice(0, 300) }
      }
    }),
  )
}

/** Tests and a future server-backed client can replace the default. */
export function setAiClient(next: AiClient) {
  client = next
}

export function resetAiClient() {
  client = createGeminiClient(viteEnv.VITE_GEMINI_API_KEY)
}
