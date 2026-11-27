import { useState } from 'react'
import { useRouter } from '../../app/router'
import { AnswerFields, ConsentAndSend, useAnswerDraft } from '../../components/AnswerForm'
import { FieldError } from '../../components/Onboarding'
import { QuestionCard } from '../../components/QuestionCard'
import { ErrorState, LoadingState } from '../../components/ui'
import { CATEGORIES } from '../../domain/constants'
import type { CategoryId } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { useSubmitWithRetry } from '../../hooks/useSubmitWithRetry'
import { createInteraction, getNextMoment, skipMoment, type MomentQuestionView } from '../../services/api'

/** Screen 11 for the initiator: the proposed question, answer, consent, Submit / Skip / Back. */
export function AskScreen({ category }: { category: CategoryId | null }) {
  const { navigate } = useRouter()
  const { state, reload } = useService(() => getNextMoment(category), [category])
  const back = () => history.back()

  if (state.status === 'loading') return <div className="px-4"><LoadingState /></div>
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>

  const next = state.data
  const title = category ? CATEGORIES[category].name : 'A little moment'
  if (next.kind !== 'question') {
    const copy = {
      cap_reached: "That's plenty of new moments for today. Anything waiting for you is still open to answer.",
      skip_limit: 'Check back later for more moments here.',
      explored_all: "You've explored everything here for now",
    }[next.kind]
    return (
      <main aria-labelledby="screen-title" className="space-y-5 px-4 pb-10 pt-6">
        <button type="button" className="btn-ghost -ml-3 no-underline" onClick={back}>← Back</button>
        <h1 id="screen-title" className="screen-title">{title}</h1>
        <p className="card text-center text-ink-soft">{copy}</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate('home')}>Home</button>
          <button type="button" className="btn-secondary" onClick={() => navigate('explore')}>Explore</button>
        </div>
      </main>
    )
  }
  return <AskForm key={next.question.question_id} question={next.question} onSkipped={reload} />
}

function AskForm({ question, onSkipped }: { question: MomentQuestionView; onSkipped: () => void }) {
  const { navigate } = useRouter()
  const draft = useAnswerDraft(`q:${question.question_id}`)
  const [consent, setConsent] = useState(false)
  const send = useSubmitWithRetry('create-interaction', (key) =>
    createInteraction({ question_id: question.question_id, answer: draft.text, consent, idempotencyKey: key }),
  )
  const skip = useAction('skip', (key) => skipMoment({ question_id: question.question_id, idempotencyKey: key }))
  const sending = send.phase !== 'idle'

  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <button type="button" className="btn-ghost -ml-3 self-start no-underline" onClick={() => history.back()}>← Back</button>
      <div className="mt-2 flex-1 space-y-5 pb-6">
        <QuestionCard category={question.category} context={question.context} text={question.text} />
        <AnswerFields text={draft.text} setText={draft.setText} disabled={sending} />
        {send.phase === 'sending' && (
          <p role="status" className="rounded-2xl bg-white p-3 text-sm">
            Sending… You seem to be offline. We'll keep trying, and your answer won't be sent twice.
          </p>
        )}
        <FieldError id="ask-error" message={send.error?.message ?? skip.error?.message} />
        {send.error?.interaction_id && (
          <button type="button" className="btn-secondary" onClick={() => navigate('waiting', send.error!.interaction_id!)}>
            Go to the waiting moment
          </button>
        )}
      </div>
      <div className="sticky bottom-0 -mx-4 space-y-2 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        <ConsentAndSend
          text={draft.text}
          consent={consent}
          setConsent={setConsent}
          disabled={sending}
          sending={sending}
          label="Send my answer"
          onSend={() =>
            send.submit((v) => {
              draft.clear()
              navigate('waiting', v.interaction_id)
            })
          }
        />
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={sending || skip.busy}
          onClick={async () => {
            const r = await skip.run()
            if (r?.ok) onSkipped()
          }}
        >
          Skip, show me another
        </button>
      </div>
    </main>
  )
}
