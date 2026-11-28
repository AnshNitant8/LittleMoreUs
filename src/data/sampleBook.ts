// A made-up couple's Storybook, to show what the full Storybook looks like
// before paying. Nothing here comes from real users.
import type { BookEntry, BookView } from '../services/book'
import { CATEGORIES } from '../domain/constants'
import { QUESTIONS } from './questions'

const MAMA = 'Mama (Priya)'
const PAPA = 'Papa (Arjun)'
/** The ideas this made-up couple said "Yes, we did" to. */
const TRIED = new Set(['q_jny_1', 'q_rem_2', 'q_app_1', 'q_need_2', 'q_play_2', 'q_app_2'])

function entry(id: string, date: string, text: string, suggestion: string, mama: string, papa: string, reactions: string[]): BookEntry {
  const q = QUESTIONS.find((x) => x.question_id === id)!
  return {
    story_id: `sample-${id}`,
    category: q.category,
    category_name: CATEGORIES[q.category].name,
    date,
    question: q.text,
    text,
    suggestion,
    idea_tried: TRIED.has(id),
    words: [
      { label: MAMA, text: mama },
      { label: PAPA, text: papa },
    ],
    reactions,
  }
}

export const SAMPLE_BOOK: BookView = {
  title: 'Our Little Storybook',
  couple: `${MAMA} & ${PAPA}`,
  since: 'September 2026',
  sample: true,
  stats: { stories: 9, words: 18, ideas: 9, kinds: 5 },
  chapters: [
    {
      title: 'September 2026',
      entries: [
        entry('q_jny_1', '4 Sept 2026', "Mama, you remember the two pink lines and how quiet the bathroom went. Papa, you remember sitting on the stairs and laughing for no reason. I like that the first thing you both did was hold on to each other.", 'You could look at the first photo from that week together and say one thing you remember about it.', 'Two pink lines, and then I just sat on the floor and cried happy tears.', 'I sat on the stairs and laughed. I called my brother and then hung up before he answered.', ['🥹', '❤️']),
        entry('q_rem_2', '12 Sept 2026', "Mama, you remember long breakfasts and the newspaper in bed. Papa, you remember walking to the market and cooking together. I think Sundays were already a little bit about the two of you.", 'Maybe borrow one small piece of an old Sunday this weekend, even just breakfast in bed for ten minutes.', 'Long breakfasts. Reading the paper in bed until noon.', 'Walking to the Sunday market and cooking whatever looked good.', ['❤️']),
        entry('q_app_1', '21 Sept 2026', "Mama, you noticed the warm milk left by the bed at 3 a.m. Papa, you noticed the playlist made for the drive to the doctor. You each saw a quiet kindness, and I am glad they didn't go unseen.", 'Say a quick thank you out loud for the thing you noticed, today if you can.', 'He left warm milk by the bed for the 3am feed without me asking.', 'She made a playlist for the drive to the clinic so I would not be nervous.', ['🌟', '❤️']),
      ],
    },
    {
      title: 'October 2026',
      entries: [
        entry('q_need_2', '3 Oct 2026', "Mama would choose ten quiet minutes with a hot cup of tea. Papa would choose a short run around the park. Two different wishes, and both of them sound just right.", 'Find ten quiet minutes for each of you this week, and swap baby duty so it happens.', 'A hot cup of tea that I actually finish while it is hot.', 'A short run around the park with no phone.', ['😂', '❤️']),
        entry('q_play_2', '15 Oct 2026', "Mama thinks my family song would be an old Kishore Kumar song. Papa thinks it would be the wheels on the bus, on repeat. I might like both, as long as you both sing.", 'Play both songs for me this week and see which one gets the bigger smile.', 'Something old by Kishore Kumar, because that is what my mother sang.', 'The wheels on the bus. On repeat. Forever.', ['😂', '😂']),
        entry('q_rem_3', '27 Oct 2026', "Mama remembers the rainy evening when the umbrella broke and you both ran. Papa remembers the way Mama laughed at the chai stall. You each kept a different piece of the same evening.", 'Share one more detail you remember from that evening, the next time you sit together.', 'The umbrella broke and we just ran through the rain laughing.', 'The way she laughed at the chai stall, soaked through.', ['🥹', '🌟']),
      ],
    },
    {
      title: 'November 2026',
      entries: [
        entry('q_app_2', '6 Nov 2026', "Mama, you love how Papa sings to me during bath time. Papa, you love how Mama talks to me like I already understand everything. I think I understand a little more every day.", 'Next time you see that moment with me, tell each other you noticed it.', 'How he sings badly but so happily at bath time.', 'How she explains everything to the baby, like a tiny colleague.', ['❤️', '🥹']),
        entry('q_play_4', '18 Nov 2026', "Mama is leaning towards a quiet dinner with no phones. Papa is leaning towards an old movie and too much popcorn. Maybe there is room for a little of both one evening soon.", 'Pick one evening this month and plan a small version of it together.', 'A quiet dinner, phones in another room.', 'An old movie and far too much popcorn.', ['❤️']),
        entry('q_play_5', '27 Nov 2026', "Mama hopes for a short trip to see the hills. Papa hopes for a picnic on the terrace. Both plans might fit into one small month.", 'Put one small plan for next month on the calendar together this week.', 'A short drive to the hills, even just for a day.', 'A picnic on our terrace with the baby and fairy lights.', ['🌟']),
      ],
    },
  ],
}
