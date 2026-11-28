import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { ErrorState, LoadingState } from '../../components/ui'
import { CATEGORIES } from '../../domain/constants'
import type { ReactionValue, ReportReason } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { REACTIONS, getStory, reactToStory, regenerateStory, reportStory, saveStory, setKeepsakeWords, type StoryView } from '../../services/api'
import { formatDate } from '../../utils/time'
import { UnlockScreen } from '../storybook/UnlockScreen'

const REACTION_NAMES: Record<ReactionValue, string> = { '❤️': 'Love', '😂': 'Laugh', '🥹': 'Touched', '🌟': 'Star' }
const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inaccurate', label: 'Inaccurate' },
  { value: 'uncomfortable', label: 'Uncomfortable' },
  { value: 'other', label: 'Other' },
]

/** Screen 13: the story, with Save, React, Report, Dismiss and Done. */
export function StoryScreen({ storyId }: { storyId: string }) {
  const { state, reload } = useService(() => getStory(storyId), [storyId])
  // Kept here: once reported, the story is hidden for this person and the reload would 404.
  const [reported, setReported] = useState(false)
  if (reported) return <ReportedScreen />
  if (state.status === 'loading') return <div className="px-4"><LoadingState label="Writing your story" /></div>
  if (state.status === 'error' && state.error.locked) return <UnlockScreen lockedStory />
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>
  return <StoryBody key={state.data.story_id} story={state.data} onReported={() => setReported(true)} />
}

function ReportedScreen() {
  const { navigate } = useRouter()
  return (
    <main aria-labelledby="reported-title" className="space-y-5 px-4 pt-16">
      <h1 id="reported-title" className="screen-title">Thanks for telling us</h1>
      <p className="text-ink-soft">We've hidden this story for you. Your partner can still see it unless it's removed after review.</p>
      <button type="button" className="btn-primary" onClick={() => navigate('home')}>Home</button>
    </main>
  )
}

function StoryBody({ story, onReported }: { story: StoryView; onReported: () => void }) {
  const { navigate } = useRouter()
  const c = CATEGORIES[story.category]
  const save = useAction('save-story', (key) => saveStory({ story_id: story.story_id, idempotencyKey: key }))
  const react = useAction('react', (key, value: ReactionValue) => reactToStory({ story_id: story.story_id, value, idempotencyKey: key }))
  const [sheet, setSheet] = useState<'closed' | 'open'>('closed')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const report = useAction('report', (key) => reportStory({ story_id: story.story_id, reason: reason!, idempotencyKey: key }))
  const regen = useAction('regenerate', (key) => regenerateStory({ story_id: story.story_id, idempotencyKey: key }))

  return (
    <main aria-labelledby="story-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <div className="flex-1 space-y-5 pb-6">
        <h1 id="story-title" className="screen-title pr-14">A little story from your little one</h1>
        <p className="text-sm text-ink-soft">{c.name} · {formatDate(story.created_at)}</p>
        {regen.busy ? (
          <div role="status" className="rounded-[var(--radius-card)] p-6 text-center" style={{ background: c.accent }}>
            <p className="animate-pulse text-lg">Writing your story…</p>
          </div>
        ) : (
          <figure className="rounded-[var(--radius-card)] p-6" style={{ background: c.accent }}>
            <blockquote className="text-lg leading-relaxed sm:text-xl sm:leading-loose">{story.text}</blockquote>
          </figure>
        )}
        <p className="text-sm text-ink-soft">Imaginative writing, not your child's actual words.</p>

        {story.suggestion && !regen.busy && (
          <section aria-labelledby="idea-title" className="rounded-[var(--radius-card)] border-2 border-line bg-white p-5">
            <h2 id="idea-title" className="font-bold">A small idea for you two</h2>
            <p className="mt-1 leading-relaxed">{story.suggestion}</p>
          </section>
        )}

        <KeepWords story={story} />

        <fieldset>
          <legend className="mb-2 font-bold">React</legend>
          <div className="flex gap-2">
            {REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={story.my_reaction === r}
                aria-label={REACTION_NAMES[r]}
                disabled={react.busy}
                onClick={() => react.run(r)}
                className={`h-12 w-12 rounded-full text-2xl ${story.my_reaction === r ? 'bg-coral-tint ring-2 ring-coral' : 'bg-white'}`}
              >
                <span aria-hidden="true">{r}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <details className="text-sm text-ink-soft">
          <summary className="min-h-11 cursor-pointer py-2">The question you both answered</summary>
          <p>{story.question_text}</p>
        </details>

        {sheet === 'open' ? (
          <section aria-labelledby="sdfr-title" className="card space-y-3">
            <h2 id="sdfr-title" className="font-extrabold">Something doesn't feel right</h2>
            {story.can_regenerate && (
              <>
                <p className="text-sm text-ink-soft">You can ask for this story to be written again, once, using the same answers.</p>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={regen.busy}
                  onClick={async () => {
                    const r = await regen.run()
                    if (r?.ok) {
                      setSheet('closed')
                      navigate('story', r.data.story_id)
                    }
                  }}
                >
                  Write it again
                </button>
                <p className="pt-2 text-sm font-bold">Or tell us what's wrong</p>
              </>
            )}
            <fieldset className="space-y-2">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="radio" name="reason" className="h-5 w-5 accent-coral" checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={!reason || report.busy}
                onClick={async () => {
                  const r = await report.run()
                  if (r?.ok) onReported()
                }}
              >
                Report
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSheet('closed')}>Cancel</button>
            </div>
            <FieldError id="report-error" message={(report.error ?? regen.error)?.message} />
          </section>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setSheet('open')}>Something doesn't feel right</button>
        )}
        <FieldError id="story-error" message={(save.error ?? react.error)?.message} />
      </div>
      <div className="space-y-2 pb-6 pt-1">
        {story.saved ? (
          <p role="status" className="text-center font-bold text-ink">Saved to your Storybook</p>
        ) : (
          <button type="button" className="btn-primary" disabled={save.busy} onClick={() => save.run()}>
            Save to Storybook
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={() => navigate('home')}>Dismiss</button>
          <button type="button" className="btn-secondary" onClick={() => navigate('home')}>Done</button>
        </div>
      </div>
    </main>
  )
}

/** Opt in to keep my own answer on this story's page in our Storybook book. */
function KeepWords({ story }: { story: StoryView }) {
  const [added, setAdded] = useState(story.my_words_added)
  const keep = useAction('keepsake-words', (key, include: boolean) => setKeepsakeWords({ story_id: story.story_id, include, idempotencyKey: key }))
  if (!added && !story.can_add_words) return null
  const toggle = async () => {
    const r = await keep.run(!added)
    if (r?.ok) setAdded(r.data.included)
  }
  return (
    <section aria-labelledby="words-title" className="rounded-[var(--radius-card)] bg-cream-deep p-5">
      <h2 id="words-title" className="font-bold">{added ? 'Your words are in your Storybook' : 'Keep your words in your Storybook?'}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {added
          ? "Your answer is on this story's page in your Storybook book. Your partner can read it there."
          : "Add your answer to this story's page in your Storybook book. Your partner will be able to read it there. If you don't add it, it's deleted 24 hours after the story, as always."}
      </p>
      <button type="button" className={added ? 'btn-ghost -ml-4 mt-1 text-sm' : 'btn-secondary mt-3'} disabled={keep.busy} onClick={toggle}>
        {added ? 'Take my words out' : 'Add my words'}
      </button>
      <FieldError id="words-error" message={keep.error?.message} />
    </section>
  )
}
