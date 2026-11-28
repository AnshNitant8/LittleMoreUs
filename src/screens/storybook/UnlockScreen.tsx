import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { QrPlaceholder } from '../../components/QrPlaceholder'
import { ErrorState, LoadingState } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { getEntitlement, submitPaymentReference } from '../../services/api'

/**
 * Paywall (spec Section 10). Shown only when a locked story is opened or
 * "Unlock full Storybook" is tapped; never inside a moment or a new story.
 */
export function UnlockScreen({ lockedStory = false }: { lockedStory?: boolean }) {
  const { navigate } = useRouter()
  const { state, reload } = useService(getEntitlement)
  const [ref, setRef] = useState('')
  const submit = useAction('payment', (key) => submitPaymentReference({ payment_reference: ref, idempotencyKey: key }))

  const body = () => {
    if (state.status === 'loading') return <LoadingState />
    if (state.status === 'error') return <ErrorState message={state.error.message} onRetry={reload} />
    const e = state.data
    if (e.unlocked) {
      return (
        <div role="status" className="card space-y-2">
          <p className="font-extrabold">{e.unlocked_by === 'partner' ? 'Already unlocked' : 'Your full Storybook is unlocked'}</p>
          <p className="text-ink-soft">
            {e.unlocked_by === 'partner'
              ? 'Your partner has already unlocked the full Storybook for you both. There is nothing to pay.'
              : 'Every story you both keep is open to read, for as long as you are paired.'}
          </p>
        </div>
      )
    }
    if (e.my_status === 'pending') {
      return (
        <div role="status" className="card space-y-2">
          <p className="font-extrabold">We're checking your payment</p>
          <p className="text-ink-soft">Older stories stay locked until it is confirmed. Nothing is deleted while you wait.</p>
          <p className="text-sm text-ink-soft">Payment verification is manual in this prototype.</p>
        </div>
      )
    }
    return (
      <>
        {e.my_status === 'rejected' && (
          <p role="alert" className="card border border-coral-tint">
            We couldn't confirm your last payment. Your stories are safe. You can try again with the reference from your payment app.
          </p>
        )}
        <QrPlaceholder />
        <form
          className="space-y-3"
          onSubmit={async (ev) => {
            ev.preventDefault()
            await submit.run()
          }}
        >
          <label htmlFor="payment-ref" className="block font-bold">Enter your payment reference</label>
          <input
            id="payment-ref"
            className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none"
            inputMode="text"
            autoComplete="off"
            value={ref}
            onChange={(ev) => setRef(ev.target.value)}
            aria-describedby={submit.error ? 'payment-error' : 'payment-help'}
          />
          <p id="payment-help" className="text-sm text-ink-soft">You'll find it in your payment app after paying.</p>
          <FieldError id="payment-error" message={submit.error?.message} />
          <button type="submit" className="btn-primary" disabled={!ref.trim() || submit.busy}>
            {submit.busy ? 'Sending…' : 'Submit reference'}
          </button>
        </form>
        <p className="text-sm text-ink-soft">Payment verification is manual in this prototype.</p>
      </>
    )
  }

  return (
    <main aria-labelledby="unlock-title" className="space-y-5 px-4 pb-10 pt-6">
      <h1 id="unlock-title" className="screen-title">Unlock your full Storybook</h1>
      {lockedStory && <p className="text-ink-soft">This story is older than your free window, so it's kept safe in your locked Storybook.</p>}
      <div className="card space-y-2">
        <p>
          A one-time payment of <strong>INR 299</strong> unlocks the full Storybook for both of you while you're paired with the person who paid.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Your Storybook as a keepsake book: chapters by month, every saved story, your small ideas, and your own words if you each choose to add them</li>
          <li>Every story, however old, open to read</li>
          <li>Print it or save it as a PDF, export your stories, and delete stories</li>
        </ul>
        <p className="text-sm text-ink-soft">Stories are never deleted because you haven't paid.</p>
        <button type="button" className="btn-ghost -ml-4 text-sm" onClick={() => navigate('book', 'sample')}>See a sample book first →</button>
      </div>
      {body()}
      <button type="button" className="btn-ghost" onClick={() => navigate('storybook')}>Back to Storybook</button>
    </main>
  )
}
