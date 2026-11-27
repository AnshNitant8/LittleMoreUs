// Seed question library (spec Section 15). Editorial order is the array order
// within each category. Wording must stay exactly as specified; open
// interactions keep their own frozen snapshot, so later edits never change them.
import type { AgeBand, CategoryId, EmotionalIntensity, Question, StoryIntent } from '../domain/types'

type Seed = [text: string, intent: StoryIntent, intensity: EmotionalIntensity, context: string, stages?: AgeBand[]]

const SEEDS: Record<Exclude<CategoryId, never>, Seed[]> = {
  remember_us: [
    ["What's a small moment from before the baby that you still smile about?", 'memory', 'low', 'A little look back at the two of you.'],
    ['What was your favourite way to spend a lazy Sunday before parenthood?', 'memory', 'low', 'Remembering slower days together.'],
    ['When did you first realise this person was someone special?', 'memory', 'medium', 'Going back to the beginning.'],
    ["What's something we used to do together that you'd love to bring back, even in a tiny way?", 'future_plan', 'low', 'Something old, maybe in a new small form.'],
  ],
  our_journey: [
    ['What do you remember most about the day we found out we were expecting?', 'memory', 'medium', 'The start of your journey to three.'],
    ['What was going through your mind in the first hour after our baby arrived?', 'memory', 'high', 'A big moment, in your own words.', ['1_6', '7_12']],
    ["What's one thing about our first week at home that you're quietly proud of?", 'memory', 'medium', 'Those first days at home together.'],
    ["What's something you wish your partner knew about how pregnancy or recovery felt for you?", 'support', 'high', 'Only if and when it feels right to share.'],
  ],
  little_appreciations: [
    ["What's one small thing your partner did this week that you noticed and appreciated?", 'appreciation', 'low', 'Small things count.'],
    ["What's a way your partner cares for our baby that makes you feel lucky?", 'appreciation', 'low', 'Noticing each other as parents.'],
    ['What does your partner do that makes your day easier, that they might not realise?', 'appreciation', 'low', 'The quiet things that help.'],
    ['When did you last feel really looked after by your partner?', 'appreciation', 'medium', 'Feeling cared for, big or small.'],
  ],
  what_we_need: [
    ['What would make this week feel a little lighter for you?', 'support', 'medium', 'No fixing needed, just sharing.'],
    ["What's one thing you'd love ten quiet minutes for?", 'preference', 'low', 'A tiny wish for yourself.'],
    ["What's one thing you'd like a bit more of in our days right now?", 'present', 'medium', 'How things feel right now.'],
    ['How are you really doing today, in a few words?', 'present', 'high', 'A few words is plenty.'],
  ],
  lets_play: [
    ['If our little one could choose our weekend plan, what would it be?', 'playful_hypothetical', 'low', 'Guesses welcome.'],
    ['If our baby could pick our family song, what would it be?', 'playful_hypothetical', 'low', 'Any genre, any volume.'],
    ["What's the silliest thing our baby has done lately?", 'present', 'low', 'A little laugh for today.', ['7_12', '13_18']],
    ['If we had a free evening together, what would you want us to do?', 'future_plan', 'low', 'Dreaming a little.'],
    ["What's one small thing we could plan together for next month?", 'future_plan', 'low', 'Something small to look forward to.'],
  ],
}

const PATTERN: Record<StoryIntent, string> = {
  memory: 'two_remembered_pieces',
  present: 'two_present_views',
  appreciation: 'mutual_noticing',
  preference: 'two_choices',
  future_plan: 'two_leanings',
  support: 'two_needs',
  playful_hypothetical: 'two_playful_guesses',
}

const SHORT: Record<CategoryId, string> = {
  remember_us: 'rem',
  our_journey: 'jny',
  little_appreciations: 'app',
  what_we_need: 'need',
  lets_play: 'play',
}

export const QUESTIONS: Question[] = Object.entries(SEEDS).flatMap(([category, seeds]) =>
  seeds.map(([text, intent, intensity, context, stages], i) => {
    const id = `q_${SHORT[category as CategoryId]}_${i + 1}`
    return {
      question_id: id,
      version_id: 'v1',
      topic_id: `t_${SHORT[category as CategoryId]}_${i + 1}`,
      category: category as CategoryId,
      text,
      context,
      story_intent: intent,
      story_pattern: PATTERN[intent],
      role_eligibility: 'all' as const,
      stage_tags: stages ?? ['general'],
      emotional_intensity: intensity,
      type: 'paired' as const,
      active: true,
      editorial_order: i,
    } satisfies Question
  }),
)

/** Guess My Answer questions (type game). Used in a later build stage. */
export const GAME_QUESTIONS: Question[] = [
  ['Which of these would your partner choose for a free hour?', ['A nap', 'A walk on my own', 'A hot coffee in silence', 'A call with a friend']],
  ['Which snack would your partner grab at midnight?', ['Something sweet', 'Something salty', 'Some fruit', 'Nothing at all']],
  ['What would your partner pick for a perfect Saturday morning?', ['Sleeping in', 'A big breakfast', 'A walk in the park', 'Lazy cartoons']],
].map(([text, options], i) => ({
  question_id: `q_game_${i + 1}`,
  version_id: 'v1',
  topic_id: `t_game_${i + 1}`,
  category: 'lets_play' as const,
  text: text as string,
  context: 'Pick one. Your choices will be revealed to each other.',
  story_intent: null,
  story_pattern: null,
  role_eligibility: 'all' as const,
  stage_tags: ['general'] as ['general'],
  emotional_intensity: 'low' as const,
  type: 'game' as const,
  options: (options as string[]).map((label, j) => ({ option_id: `o${j + 1}`, label })),
  active: true,
  editorial_order: 100 + i,
}))

export const ALL_QUESTIONS: Question[] = [...QUESTIONS, ...GAME_QUESTIONS]
