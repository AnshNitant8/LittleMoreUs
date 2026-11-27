import { OnboardingLayout } from '../../components/Onboarding'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { getMyInvitation, skipInviteStep } from '../../services/api'
import { InvitePanel } from './InvitePanel'

/** Onboarding step 06: invite partner, or skip for now. */
export function InviteStepScreen({ step, total, onBack, onDone }: { step: number; total: number; onBack: () => void; onDone: () => void }) {
  const { state } = useService(getMyInvitation)
  const sent = state.status === 'ready' && state.data?.status === 'sent'
  const skip = useAction('skip-invite', (key) => skipInviteStep({ idempotencyKey: key }))
  return (
    <OnboardingLayout
      title="Invite your partner"
      intro={
        <>
          You'll each use your own account. When one of you starts a moment, you both answer the same question privately. Nothing you write is shown to the other person.
        </>
      }
      step={step}
      total={total}
      onBack={onBack}
      footer={
        <button
          type="button"
          className="btn-secondary"
          disabled={skip.busy}
          onClick={async () => {
            const r = await skip.run()
            if (r?.ok) onDone()
          }}
        >
          {sent ? 'Continue' : 'Skip for now'}
        </button>
      }
    >
      <InvitePanel />
      <p className="text-sm text-ink-soft">Not ready yet? That's fine. You can invite them later from Home.</p>
    </OnboardingLayout>
  )
}
