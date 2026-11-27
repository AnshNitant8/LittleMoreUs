import { useEffect } from 'react'
import { useRouter } from '../../app/router'
import { HeroFamilies } from '../../components/Illustrations'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { LoadingState } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { acceptInvitation, declineInvitation, forgetInvite, getInvitation, rememberInvite } from '../../services/api'
import { SERVER_MODE } from '../../services/serverMode'

/** Screen 07: accept or decline a partner's invitation. */
export function AcceptInviteScreen({ token, signedIn }: { token: string; signedIn: boolean }) {
  const { navigate } = useRouter()
  const { state } = useService(() => getInvitation(token), [token, signedIn])
  const accept = useAction('accept-invite', (key) => acceptInvitation({ token, idempotencyKey: key }))
  const decline = useAction('decline-invite', (key) => declineInvitation({ token, idempotencyKey: key }))

  // Keep the token on this device so it survives creating an account or logging in.
  useEffect(() => {
    void rememberInvite(token)
  }, [token])

  const leave = async () => {
    await forgetInvite()
    navigate('home')
  }

  if (state.status === 'loading') return <LoadingState />

  const unusable =
    state.status === 'error' ? state.error.message : state.data.status !== 'sent' ? 'This link has expired or was already used. Please ask your partner for a new one.' : null
  if (unusable) {
    return (
      <OnboardingLayout title="This link doesn't work any more" footer={<button type="button" className="btn-primary" onClick={leave}>OK</button>}>
        <p className="card">{unusable}</p>
      </OnboardingLayout>
    )
  }
  const inv = state.status === 'ready' ? state.data : null!

  if (inv.problem) {
    const copy = {
      own_invitation: "This is your own invitation link. Share it with your partner so they can join you.",
      already_paired: "You're already connected with a partner, so this invitation can't be used.",
      inviter_paired: 'Your partner is already connected with someone else. Please ask them for a new link.',
    }[inv.problem]
    return (
      <OnboardingLayout title="This invitation can't be used here" footer={<button type="button" className="btn-primary" onClick={leave}>OK</button>}>
        <p className="card">{copy}</p>
        {inv.problem === 'own_invitation' && !SERVER_MODE && (
          <p className="inline-block rounded-md border border-dashed border-proto bg-white px-2 py-1 font-mono text-xs text-proto">
            Prototype: switch to the other partner in Prototype Controls to accept.
          </p>
        )}
      </OnboardingLayout>
    )
  }

  const busy = accept.busy || decline.busy
  return (
    <OnboardingLayout
      title={`${inv.inviter_name} invited you`}
      intro="A Little More Us gives you both one small question at a time. Then a little story, imagined from your little one's point of view."
      footer={
        <>
          {signedIn ? (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                const r = await accept.run()
                if (r?.ok) navigate('home')
              }}
            >
              {accept.busy ? 'Connecting…' : 'Accept'}
            </button>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={() => navigate('signin')}>
                {SERVER_MODE ? 'Continue with email' : 'Continue with phone or email'}
              </button>
              <p className="text-center text-sm text-ink-soft">New or returning, it's the same step. We'll create your account if you don't have one.</p>
            </>
          )}
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              const r = await decline.run()
              if (r?.ok) navigate('home')
            }}
          >
            Decline
          </button>
        </>
      }
    >
      <div className="rounded-[var(--radius-card)] bg-cream-deep p-4">
        <HeroFamilies className="w-full" />
      </div>
      <p className="card text-lg font-bold">No answers are shared; you each answer privately.</p>
      <p className="text-ink-soft">Only a short shared story is made, and only after you both agree.</p>
      <FieldError id="accept-error" message={(accept.error ?? decline.error)?.message} />
    </OnboardingLayout>
  )
}
