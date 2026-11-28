import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { QuestionCard } from '../../components/QuestionCard'
import { ShareNudge } from '../../components/ShareNudge'
import { SupportCard } from '../../components/SupportCard'
import { ErrorState, LoadingState } from '../../components/ui'
import type { InteractionStatus } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { getInteraction, withdrawInteraction, type InteractionView } from '../../services/api'
import { formatDateTime } from '../../utils/time'
import { GameStatus } from './GameScreen'

const COPY: Record<InteractionStatus, { title: string; body: string }> = {
  awaiting_partner: { title: 'Your little moment is on its way!', body: 'Your partner can answer whenever suits them.' },
  generating: { title: 'Writing your story…', body: 'You both answered. Your little story is being written.' },
  completed: { title: 'Your little story is ready', body: 'You both answered, and a short story was made from your two answers.' },
  declined: { title: 'Not this one', body: "This one won't become a story, and that's completely fine. There are plenty more little moments." },
  expired: { title: 'This moment has closed', body: "This one wasn't answered in time, so it won't become a story. No problem at all." },
  withdrawn: { title: 'Closed', body: 'This moment was closed and the answers were deleted.' },
  closed_disconnected: { title: 'Closed', body: 'This moment has closed.' },
  safety_held: { title: "This one didn't become a story", body: 'There are plenty more little moments whenever you like.' },
}

/** Screen 12: neutral status for a moment, with Home, Explore and Withdraw. */
export function WaitingScreen({ interactionId }: { interactionId: string }) {
  const { navigate } = useRouter()
  const { state, reload } = useService(() => getInteraction(interactionId), [interactionId])
  if (state.status === 'loading') return <div className="px-4"><LoadingState /></div>
  if (state.status === 'error') return <div className="px-4 pt-10"><ErrorState message={state.error.message} onRetry={reload} /></div>
  const i = state.data
  if (i.type === 'game') return <GameStatus interaction={i} />
  const copy = i.show_support ? { title: 'Thank you for sharing', body: '' } : COPY[i.status]
  return (
    <main aria-labelledby="waiting-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <div className="flex-1 space-y-5 pb-6">
        <div className="pt-6 text-center">
          {i.status === 'generating' || i.status === 'awaiting_partner' ? <Envelope animate={i.status === 'generating'} /> : null}
          <h1 id="waiting-title" className="mt-4 text-2xl font-extrabold" aria-live="polite">{copy.title}</h1>
          {copy.body && <p className="mt-2 text-ink-soft">{copy.body}</p>}
        </div>
        {i.show_support && <SupportCard />}
        {!i.show_support && <QuestionCard category={i.category} context={i.context} text={i.question_text} headingLevel={2} />}
        {!i.show_support && <p className="card text-sm" aria-label="Status">
          <span className="font-bold">Status: </span>
          {statusLabel(i)}
          {i.status === 'awaiting_partner' && <span className="block text-ink-soft">Open until {formatDateTime(i.expires_at)}</span>}
        </p>}
        {!i.show_support && i.status === 'awaiting_partner' && i.my_response && <ShareNudge partnerLabel={i.partner_label} />}
        {(i.status === 'awaiting_partner' || i.status === 'generating') && (
          <p className="rounded-2xl bg-cream-deep p-4 text-sm">
            Your answer stays private. Your partner will never see it, only the shared story made after you both agree.
          </p>
        )}
        {i.role === 'partner' && i.status === 'awaiting_partner' && !i.my_response && (
          <button type="button" className="btn-primary" onClick={() => navigate('answer', i.interaction_id)}>Answer this one</button>
        )}
        {i.status === 'completed' && i.story_id && (
          <button type="button" className="btn-primary" onClick={() => navigate('story', i.story_id!)}>Read your story</button>
        )}
        <Withdraw interaction={i} />
      </div>
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-3 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        <button type="button" className="btn-secondary" onClick={() => navigate('home')}>Home</button>
        <button type="button" className="btn-secondary" onClick={() => navigate('explore')}>Explore</button>
      </div>
    </main>
  )
}

function statusLabel(i: InteractionView): string {
  switch (i.status) {
    case 'awaiting_partner':
      return i.role === 'initiator' ? 'Waiting' : 'Waiting for your answer'
    case 'generating':
      return 'Writing your story'
    case 'completed':
      return 'Story ready'
    case 'declined':
      return 'Not this one'
    case 'expired':
      return 'Expired'
    default:
      return 'Closed'
  }
}

function Withdraw({ interaction }: { interaction: InteractionView }) {
  const [confirm, setConfirm] = useState(false)
  const w = useAction('withdraw', (key) => withdrawInteraction({ interaction_id: interaction.interaction_id, idempotencyKey: key }))
  const can =
    (interaction.role === 'initiator' && (interaction.status === 'awaiting_partner' || interaction.status === 'generating')) ||
    (interaction.role === 'partner' && interaction.status === 'generating')
  if (!can || !interaction.my_response) return null
  return (
    <div className="space-y-2">
      {!confirm ? (
        <button type="button" className="btn-ghost w-full" onClick={() => setConfirm(true)}>Withdraw answer</button>
      ) : (
        <div className="card space-y-3">
          <p>
            {interaction.role === 'initiator'
              ? 'Withdraw your answer? This closes the moment and deletes both answers. No story will be made.'
              : 'Withdraw your answer? It will be deleted, and you can answer again while the moment is open.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-primary" disabled={w.busy} onClick={() => w.run()}>Withdraw</button>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(false)}>Keep it</button>
          </div>
        </div>
      )}
      <FieldError id="withdraw-error" message={w.error?.message} />
    </div>
  )
}

function Envelope({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 120 90" width="120" height="90" role="img" aria-label="Illustration of a little envelope with a heart" className={`mx-auto ${animate ? 'animate-pulse' : ''}`}>
      <rect x="10" y="20" width="100" height="62" rx="10" fill="#FFFFFF" stroke="#EADBCD" strokeWidth="2" />
      <path d="M12 24l48 34 48-34" fill="none" stroke="#EADBCD" strokeWidth="2" />
      <path d="M60 52s-12-7-12-15a6.5 6.5 0 0 1 12-3.5A6.5 6.5 0 0 1 72 37c0 8-12 15-12 15z" fill="#F2765D" />
    </svg>
  )
}
