// "A small idea for you two": one gentle thing to do together, tied only to
// the question that was answered. Gemini writes one alongside the story; these
// ready-written ideas are used when it can't (or its idea fails the checks).
import type { StoryIntent } from '../domain/types'

export const QUESTION_SUGGESTIONS: Record<string, string> = {
  q_rem_1: 'Tell each other one more little moment from before the baby, maybe over a cup of tea tonight.',
  q_rem_2: 'Pick one small piece of an old lazy Sunday and borrow it for ten minutes this weekend.',
  q_rem_3: 'Share one more detail you remember from that time, even a tiny one, the next time you sit together.',
  q_rem_4: 'Choose one small way to bring that back this week, even if it only lasts a few minutes.',
  q_jny_1: 'Look at one photo or message from that day together and say what you remember about it.',
  q_jny_2: 'When the baby is asleep, take a quiet minute to tell each other one more thing about that first hour.',
  q_jny_3: 'Name one more thing from that first week that the two of you got through together.',
  q_jny_4: 'If it feels right, set aside a calm moment where one of you shares a little more and the other just listens.',
  q_app_1: 'Say a quick thank you out loud for the thing you noticed, today if you can.',
  q_app_2: 'Next time you see that moment with the baby, tell your partner you noticed it.',
  q_app_3: 'Pick one of those quiet helpful things and say thank you for it this week.',
  q_app_4: "Tell each other one small thing that would help you feel looked after this week.",
  q_need_1: 'Pick one small thing from your answers that the other could take off your plate this week.',
  q_need_2: 'Find ten quiet minutes for each of you this week, and swap baby duty so it happens.',
  q_need_3: 'Choose one small way to add a little more of that to a day this week.',
  q_need_4: 'Check in again with a few words tomorrow, the same way you did today.',
  q_play_1: 'Try a tiny version of that weekend plan this Saturday, even for half an hour.',
  q_play_2: 'Play both songs for the baby this week and see which one gets the bigger smile.',
  q_play_3: 'Keep a little note of the next silly moment and share it with each other at the end of the day.',
  q_play_4: 'Pick one evening this month and plan a small version of it together.',
  q_play_5: 'Put one small plan for next month on the calendar together this week.',
}

export const INTENT_SUGGESTIONS: Record<StoryIntent, string> = {
  memory: 'Share one more little piece of that memory with each other this week.',
  present: 'Check in again with a few words tomorrow, the same way you did today.',
  appreciation: 'Say a quick thank you out loud for the thing you noticed.',
  preference: 'Make a little room for both of your choices this week.',
  future_plan: 'Pick one small step toward it and put it on the calendar together.',
  support: 'Choose one small thing you can each do for the other this week.',
  playful_hypothetical: 'Try a tiny version of your guesses together this weekend.',
}

export function fallbackSuggestion(questionId: string, intent: StoryIntent): string {
  return QUESTION_SUGGESTIONS[questionId] ?? INTENT_SUGGESTIONS[intent]
}
