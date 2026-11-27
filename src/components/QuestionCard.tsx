import { CategoryIllustration } from './Illustrations'
import { CATEGORIES } from '../domain/constants'
import type { CategoryId } from '../domain/types'

/** Category, context line and the frozen question wording. */
export function QuestionCard({ category, context, text, headingLevel = 1 }: { category: CategoryId; context: string; text: string; headingLevel?: 1 | 2 }) {
  const c = CATEGORIES[category]
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] p-5" style={{ background: c.accent }}>
      <div className="flex items-center gap-3">
        <CategoryIllustration category={category} size={44} />
        <p className="font-bold">{c.name}</p>
      </div>
      <p className="text-sm text-ink-soft">{context}</p>
      <H id="screen-title" className="text-xl font-extrabold leading-snug">
        {text}
      </H>
    </section>
  )
}
