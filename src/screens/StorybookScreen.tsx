import { useState } from 'react'
import { ReferFriend } from '../components/ReferFriend'
import { useRouter } from '../app/router'
import { FieldError } from '../components/Onboarding'
import { EmptyState, ErrorState, LoadingState, Screen } from '../components/ui'
import { CATEGORIES } from '../domain/constants'
import { useAction } from '../hooks/useAction'
import { useService } from '../hooks/useService'
import { deleteStory, listStories, requestExport, type StoryCard } from '../services/api'
import { downloadText } from '../utils/download'
import { formatDate } from '../utils/time'

/** Screen 14: saved timeline, Recent, locked previews, unlock, export and delete. */
export function StorybookScreen() {
  const { navigate } = useRouter()
  const { state, reload } = useService(listStories)
  const exp = useAction('export', (key) => requestExport({ idempotencyKey: key }))
  const [exported, setExported] = useState(false)

  const download = async () => {
    const r = await exp.run()
    if (!r?.ok) return
    downloadText(r.data.filename, r.data.json)
    setExported(true)
  }

  return (
    <Screen title="Storybook">
      <p className="text-ink-soft">Your private, shared collection of little stories.</p>
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          {!state.data.unlocked && state.data.locked_count > 0 && (
            <div className="card space-y-3 border-2 border-coral-tint">
              <p className="font-extrabold">
                {state.data.locked_count} more {state.data.locked_count === 1 ? 'story is' : 'stories are'} waiting for you two
              </p>
              <p className="text-sm text-ink-soft">
                {state.data.free_stories} of your stories are free to read. Unlock the full Storybook to read every one, now and as it grows.
              </p>
              <button type="button" className="btn-primary" onClick={() => navigate('unlock')}>
                Unlock {state.data.locked_count} more {state.data.locked_count === 1 ? 'story' : 'stories'}
              </button>
            </div>
          )}
          <section aria-labelledby="saved-title" className="space-y-3">
            <h2 id="saved-title" className="text-lg font-extrabold">Saved stories</h2>
            {state.data.saved.length === 0 ? (
              <EmptyState>Stories you save will gather here, newest first.</EmptyState>
            ) : (
              <ol className="space-y-3">
                {state.data.saved.map((s) => <StoryRow key={s.story_id} story={s} canDelete={state.data.unlocked} />)}
              </ol>
            )}
          </section>

          <section aria-labelledby="recent-title" className="space-y-3">
            <h2 id="recent-title" className="text-lg font-extrabold">Recent</h2>
            <p className="text-sm text-ink-soft">Stories you haven't saved stay here for {state.data.recent_days} days.</p>
            {state.data.recent.length === 0 ? (
              <EmptyState>No unsaved stories right now.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {state.data.recent.map((s) => <StoryRow key={s.story_id} story={s} canDelete={state.data.unlocked} />)}
              </ul>
            )}
          </section>

          <section aria-labelledby="more-title" className="space-y-3">
            <h2 id="more-title" className="sr-only">Storybook options</h2>
            {state.data.unlocked ? (
              <>
                <p className="card text-center font-bold">Your full Storybook is unlocked</p>
                <button type="button" className="btn-primary" onClick={() => navigate('book')}>Open our Storybook book</button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">
                  {state.data.free_stories} of your stories are free to read, and every new story is open on the day it's made. The rest are kept safe and never deleted. Unlocking also lets you delete stories.
                </p>
                <button type="button" className="btn-secondary" onClick={() => navigate('unlock')}>Unlock full Storybook</button>
                <button type="button" className="btn-ghost w-full" onClick={() => navigate('book', 'sample')}>See a sample Storybook book</button>
              </>
            )}
            {state.data.unlocked ? (
              <>
                <button type="button" className="btn-ghost w-full" disabled={exp.busy} onClick={download}>
                  {exp.busy ? 'Preparing…' : 'Export my stories'}
                </button>
                {exported && <p role="status" className="text-center text-sm text-ink-soft">Your export has downloaded. It has your profile and stories, never your answers.</p>}
              </>
            ) : (
              <p className="text-center text-sm text-ink-soft">Export comes with the full Storybook.</p>
            )}
            <FieldError id="export-error" message={exp.error?.message} />
          </section>
          <ReferFriend from="storybook" />
        </>
      )}
    </Screen>
  )
}

function StoryRow({ story, canDelete }: { story: StoryCard; canDelete: boolean }) {
  const { navigate } = useRouter()
  const [confirming, setConfirming] = useState(false)
  const del = useAction('delete-story', (key) => deleteStory({ story_id: story.story_id, idempotencyKey: key }))
  const c = CATEGORIES[story.category]
  return (
    <li className="rounded-[var(--radius-card)] p-4" style={{ background: c.accent }}>
      <button
        type="button"
        className="block w-full min-h-11 text-left"
        onClick={() => navigate(story.locked ? 'unlock' : 'story', story.story_id)}
        aria-label={story.locked ? `${story.title}, locked. Unlock to read` : `Read ${story.title}`}
      >
        <span className="block font-extrabold">{story.title}</span>
        {story.locked ? (
          <>
          <span className="mt-1 block italic text-ink">“{story.question}”</span>
          <span className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Locked · tap to unlock
          </span>
          </>
        ) : (
          <span className="mt-1 block text-ink">{story.preview}</span>
        )}
        {story.removed_at && <span className="mt-1 block text-xs text-ink-soft">Leaves Recent on {formatDate(story.removed_at)} unless saved</span>}
      </button>
      {!canDelete ? null : confirming ? (
        <div className="mt-3 space-y-2 rounded-2xl bg-white p-3" role="group" aria-label="Confirm delete">
          <p className="text-sm font-bold">Delete this story for both of you? It will be removed from both your Storybooks and can't be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary" disabled={del.busy} onClick={() => del.run()}>Delete for both</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Keep it</button>
          </div>
          <FieldError id={`del-${story.story_id}`} message={del.error?.message} />
        </div>
      ) : (
        <button type="button" className="btn-ghost -ml-4 mt-1 text-sm" onClick={() => setConfirming(true)}>Delete</button>
      )}
    </li>
  )
}
