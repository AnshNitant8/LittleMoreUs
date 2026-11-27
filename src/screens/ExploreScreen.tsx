import { useRouter } from '../app/router'
import { CategoryIllustration } from '../components/Illustrations'
import { EmptyState, ErrorState, LoadingState, Screen } from '../components/ui'
import { CATEGORIES } from '../domain/constants'
import { useService } from '../hooks/useService'
import { getExplore } from '../services/api'

export function ExploreScreen({ paired }: { paired: boolean }) {
  const { navigate } = useRouter()
  if (!paired) {
    return (
      <Screen title="Explore">
        <p className="text-ink-soft">These are the kinds of little moments you can share.</p>
        <CategoryList onOpen={null} />
        <EmptyState>Moments begin once your partner joins.</EmptyState>
        <button type="button" className="btn-primary" onClick={() => navigate('invite-partner')}>Invite your partner</button>
      </Screen>
    )
  }
  return <PairedExplore />
}

function PairedExplore() {
  const { navigate } = useRouter()
  const { state, reload } = useService(getExplore)
  return (
    <Screen title="Explore">
      <p className="text-ink-soft">Pick a kind of moment. We'll suggest one question you can both answer privately.</p>
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          {state.data.cap_reached && (
            <p className="card">
              That's plenty of new moments for today.
              {state.data.waiting_for_you > 0 ? ' Anything waiting for you is still open on Home.' : ' Come back tomorrow for more.'}
            </p>
          )}
          <CategoryList
            onOpen={(c) => navigate('ask', c)}
            info={Object.fromEntries(state.data.categories.map((c) => [c.category, c]))}
          />
          {state.data.game && (
            <button
              type="button"
              onClick={() => navigate('play', 'new')}
              className="flex w-full items-center gap-4 rounded-[var(--radius-card)] border-2 border-dashed border-line bg-white p-4 text-left"
            >
              <CategoryIllustration category="lets_play" />
              <span className="flex-1">
                <span className="block text-lg font-extrabold">Guess My Answer</span>
                <span className="block text-sm text-ink-soft">
                  {state.data.game.has_new ? 'Pick an option, your partner guesses, then you both see the two picks. Just for fun.' : "You've played every game for now"}
                </span>
              </span>
            </button>
          )}
        </>
      )}
    </Screen>
  )
}

function CategoryList({
  onOpen,
  info,
}: {
  onOpen: ((c: keyof typeof CATEGORIES) => void) | null
  info?: Record<string, { has_new: boolean; muted: boolean }>
}) {
  return (
    <ul className="space-y-3">
      {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((id) => {
        const c = CATEGORIES[id]
        const meta = info?.[id]
        if (meta?.muted) return null
        const body = (
          <>
            <CategoryIllustration category={id} />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-lg font-extrabold">
                {c.name}
                {meta?.has_new && (
                  <>
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-coral" />
                    <span className="sr-only">(new moments available)</span>
                  </>
                )}
              </span>
              <span className="block text-sm text-ink-soft">{c.description}</span>
              {meta && !meta.has_new && <span className="mt-1 block text-sm font-semibold text-ink-soft">You've explored everything here for now</span>}
            </span>
          </>
        )
        return (
          <li key={id}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(id)} className="flex w-full items-center gap-4 rounded-[var(--radius-card)] p-4 text-left" style={{ background: c.accent }}>
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-4 rounded-[var(--radius-card)] p-4" style={{ background: c.accent }}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
