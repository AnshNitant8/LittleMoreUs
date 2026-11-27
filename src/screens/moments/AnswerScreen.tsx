import { useEffect, useState } from 'react'
import { useRouter } from '../../app/router'
import { AnswerFields, canSubmitAnswer, useAnswerDraft } from '../../components/AnswerForm'
import { FieldError } from '../../components/Onboarding'
import { QuestionCard } from '../../components/QuestionCard'
import { ErrorState, LoadingState } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { useSubmitWithRetry } from '../../hooks/useSubmitWithRetry'
import { declineInteraction, getInteraction, respondToInteraction, type InteractionView } from '../../services/api'

/** Screen 11 for the second partner: the same frozen question; Answer, Skip or "Not this one". */
export function AnswerScreen({ interactionId }: { interactionId: string }) {
  const { state, reload } = useService(() => getInteraction(interactionId), [interactionId])
  if (state.status === 'loading') return <div className="px-4"><LoadingState /></div>
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>
  const i = state.data
  if (i.role === 'initiator' || i.status !== 'awaiting_partner' || i.my_response) return <RedirectToWaiting id={i.interaction_id} />
  return <AnswerForm interaction={i} />
}

function RedirectToWaiting({ id }: { id: string }) {
  const { navigate } = useRouter()
  useEffect(() => navigate('waiting', id), [id, navigate])
  return null
}

function AnswerForm({ interaction }: { interaction: InteractionView }) {
  const { navigate } = useRouter()
  const draft = useAnswerDraft(`i:${interaction.interaction_id}`)
  const [consent, setConsent] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const send = useSubmitWithRetry('respond', (key) =>
    respondToInteraction({ interaction_id: interaction.interaction_id, answer: draft.text, consent, idempotencyKey: key }),
  )
  const decline = useAction('decline', (key) => declineInteraction({ interaction_id: interaction.interaction_id, idempotencyKey: key }))
  const sending = send.phase !== 'idle'

  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <button type="button" className="btn-ghost -ml-3 self-start no-underline" onClick={() => navigate('home')}>← Back</button>
      <div className="mt-2 flex-1 space-y-5 pb-6">
        <p className="text-ink-soft">{interaction.initiator_label} started this little moment for you both.</p>
        <QuestionCard category={interaction.category} context={interaction.context} text={interaction.question_text} />
        <AnswerFields text={draft.text} setText={draft.setText} consent={consent} setConsent={setConsent} disabled={sending} />
        {send.phase === 'sending' && (
          <p role="status" className="rounded-2xl bg-white p-3 text-sm">
            Sending… You seem to be offline. We'll keep trying, and your answer won't be sent twice.
          </p>
        )}
        <FieldError id="answer-error" message={(send.error ?? decline.error)?.message} />
        {confirmDecline && (
          <div className="card space-y-3" role="group" aria-label="Pass on this one">
            <p>Pass on this one? That's completely fine. It just won't become a story.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn-primary"
                disabled={decline.busy}
                onClick={async () => {
                  const r = await decline.run()
                  if (r?.ok) {
                    draft.clear()
                    navigate('waiting', interaction.interaction_id)
                  }
                }}
              >
                Not this one
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDecline(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 -mx-4 space-y-2 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        <button
          type="button"
          className="btn-primary"
          disabled={!canSubmitAnswer(draft.text, consent) || sending}
          onClick={() =>
            send.submit(() => {
              draft.clear()
              navigate('waiting', interaction.interaction_id)
            })
          }
        >
          {sending ? 'Sending…' : 'Send my answer'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" disabled={sending} onClick={() => navigate('home')}>Skip for now</button>
          <button type="button" className="btn-ghost" disabled={sending} onClick={() => setConfirmDecline(true)}>Not this one</button>
        </div>
      </div>
    </main>
  )
}
