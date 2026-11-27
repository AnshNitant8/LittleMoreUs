import { useRouter } from '../app/router'
import { ComingLater, ErrorState, LoadingState, Screen } from '../components/ui'
import { AGE_BAND_LABELS, CATEGORIES, DEPTH_LABELS } from '../domain/constants'
import { useAction } from '../hooks/useAction'
import { useService } from '../hooks/useService'
import { getMe, logout } from '../services/api'

export function ProfileScreen() {
  const { navigate } = useRouter()
  const { state, reload } = useService(getMe)
  const out = useAction('logout', (key) => logout({ idempotencyKey: key }))
  return (
    <Screen title="Profile">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && (
        <>
          <section className="card space-y-2" aria-label="About you">
            <p className="text-xl font-extrabold">{state.data.display_name}</p>
            <p className="text-ink-soft">Your little one calls you <strong className="text-ink">{state.data.parent_label}</strong></p>
            <p className="text-ink-soft">Stage: {state.data.age_band ? AGE_BAND_LABELS[state.data.age_band] : 'Not set'}</p>
            <p className="text-ink-soft">Moments: {state.data.preferences.categories.map((c) => CATEGORIES[c].name).join(', ')}</p>
            <p className="text-ink-soft">Depth: {state.data.preferences.depth ? DEPTH_LABELS[state.data.preferences.depth] : 'Not set'}</p>
          </section>
          <ComingLater what="Editing your profile, couple settings, pause and privacy tools" stage={7} />
          <button
            type="button"
            className="btn-secondary"
            disabled={out.busy}
            onClick={async () => {
              const r = await out.run()
              if (r?.ok) navigate('welcome')
            }}
          >
            Log out
          </button>
          {out.error && <p role="alert">{out.error.message}</p>}
        </>
      )}
    </Screen>
  )
}
