// Distress safety path (spec Section 9). Two layers, run at submit time on
// every free-text answer. The answer text is never stored, logged or sent
// anywhere else when flagged.
import { getAiClient } from './gemini'

/** Starter phrases. MUST be replaced by a clinically reviewed list before real launch. */
export const DISTRESS_PHRASES = [
  'want to die',
  'kill myself',
  'end it all',
  'hurt myself',
  'no point',
  "can't go on",
  "can't cope",
  'hopeless',
  'worthless',
  "wish i wasn't here",
  'scared of him',
  'scared of her',
  'afraid of my partner',
  'unsafe at home',
  'hits me',
  'hit me',
]

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bcant\b/g, "can't")
    .replace(/\bwasnt\b/g, "wasn't")
    .replace(/\s+/g, ' ')
}

/** Layer 1: phrase check. */
export function phraseFlag(text: string): boolean {
  const t = normalise(text)
  return DISTRESS_PHRASES.some((p) => new RegExp(`(^|[^a-z'])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t))
}

export interface DistressResult {
  flagged: boolean
  /** True if the classifier errored or timed out (treated as not flagged). */
  classifier_error: boolean
}

/** Both layers. Layer 2 errors count as not flagged. */
export async function checkDistress(text: string): Promise<DistressResult> {
  if (phraseFlag(text)) return { flagged: true, classifier_error: false }
  const ai = getAiClient()
  if (!ai.available) return { flagged: false, classifier_error: true }
  try {
    return { flagged: await ai.classifyDistress(text), classifier_error: false }
  } catch {
    return { flagged: false, classifier_error: true }
  }
}
