// Neutral, intent-matched fallbacks (spec Section 8), verbatim. Never paraphrase answers.
import type { StoryIntent } from '../domain/types'

export const FALLBACK_STORIES: Record<StoryIntent, string> = {
  memory: "You both shared a little piece of the past with each other today. I hope there's room to remember a bit more together.",
  present: "You both took a moment today to share how things feel right now. I'm glad you keep making room for each other.",
  appreciation: 'You each noticed something kind about the other today. That makes a little more love in our home.',
  preference: "You each shared what you'd choose, and they were your own choices. I like that you know each other a little better.",
  future_plan: "You each shared something you'd like to look forward to. I hope there's room for a bit of both.",
  support: 'You each shared what you need right now. I hope you can look after each other, and yourselves, a little more.',
  playful_hypothetical: 'You both took a playful guess today. I think laughing together is one of my favourite sounds.',
}
