import { useRouter } from '../../app/router'
import { ErrorState, LoadingState } from '../../components/ui'
import { CATEGORIES } from '../../domain/constants'
import { useService } from '../../hooks/useService'
import { getStory } from '../../services/api'
import { formatDate } from '../../utils/time'

/** Screen 13 (core): the story. Save, react and report arrive with the Storybook stages. */
export function StoryScreen({ storyId }: { storyId: string }) {
  const { navigate } = useRouter()
  const { state, reload } = useService(() => getStory(storyId), [storyId])
  if (state.status === 'loading') return <div className="px-4"><LoadingState label="Writing your story" /></div>
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>
  const s = state.data
  const c = CATEGORIES[s.category]
  return (
    <main aria-labelledby="story-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <div className="flex-1 space-y-5 pb-6">
        <h1 id="story-title" className="screen-title pr-14">A little story from your little one</h1>
        <p className="text-sm text-ink-soft">{c.name} · {formatDate(s.created_at)}</p>
        <figure className="rounded-[var(--radius-card)] p-6" style={{ background: c.accent }}>
          <blockquote className="text-xl leading-loose">{s.text}</blockquote>
        </figure>
        <p className="text-sm text-ink-soft">Imaginative writing, not your child's actual words.</p>
        <details className="text-sm text-ink-soft">
          <summary className="min-h-11 cursor-pointer py-2">The question you both answered</summary>
          <p>{s.question_text}</p>
        </details>
      </div>
      <div className="sticky bottom-0 -mx-4 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        <button type="button" className="btn-primary" onClick={() => navigate('home')}>Done</button>
      </div>
    </main>
  )
}
