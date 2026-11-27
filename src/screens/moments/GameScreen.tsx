import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { QuestionCard } from '../../components/QuestionCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { createGame, declineInteraction, getNextGame, respondToGame, type InteractionView } from '../../services/api'
import type { GameOption } from '../../domain/types'

const REVEAL_NOTE = 'Your choice will be revealed to each other once you have both picked. Options only, just for fun.'

/** Screen 15, start: one light game question with 3 or 4 options. */
export function StartGameScreen() {
  const { navigate } = useRouter()
  const { state, reload } = useService(getNextGame)
  const start = useAction('game', (key, questionId: string, optionId: string, ack: boolean) =>
    createGame({ question_id: questionId, option_id: optionId, acknowledged: ack, idempotencyKey: key }),
  )
  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <button type="button" className="btn-ghost -ml-3 self-start no-underline" onClick={() => navigate('explore')}>← Back</button>
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.kind !== 'game' && (
        <div className="space-y-4 pt-4">
          <h1 id="screen-title" className="screen-title">Guess My Answer</h1>
          <EmptyState>
            {state.data.kind === 'cap_reached'
              ? "That's plenty of new moments for today. Come back tomorrow for a game."
              : state.data.kind === 'disabled'
                ? 'Guess My Answer is turned off right now.'
                : "You've played every game for now. More will come."}
          </EmptyState>
        </div>
      )}
      {state.status === 'ready' && state.data.kind === 'game' && (
        <GamePicker
          lead="You go first. Pick the one you would choose, and your partner will guess."
          question={{ category: state.data.question.category, context: state.data.question.context, text: state.data.question.text }}
          options={state.data.options}
          busy={start.busy}
          error={start.error?.message}
          submitLabel="Send my pick"
          onSubmit={async (optionId, ack) => {
            const q = state.data.kind === 'game' ? state.data.question.question_id : ''
            const r = await start.run(q, optionId, ack)
            if (r?.ok) navigate('waiting', r.data.interaction_id)
          }}
        />
      )}
    </main>
  )
}

function GamePicker(props: {
  lead: string
  question: { category: InteractionView['category']; context: string; text: string }
  options: GameOption[]
  busy: boolean
  error?: string
  submitLabel: string
  onSubmit: (optionId: string, ack: boolean) => void
  extra?: React.ReactNode
}) {
  const [choice, setChoice] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  return (
    <>
      <div className="mt-2 flex-1 space-y-5 pb-6">
        <p className="text-ink-soft">{props.lead}</p>
        <QuestionCard {...props.question} />
        <fieldset className="space-y-2">
          <legend className="sr-only">Options</legend>
          {props.options.map((o) => (
            <label key={o.option_id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white px-4 ${choice === o.option_id ? 'border-coral' : 'border-line'}`}>
              <input type="radio" name="game-option" className="h-5 w-5 accent-coral" checked={choice === o.option_id} onChange={() => setChoice(o.option_id)} />
              <span className="font-semibold">{o.label}</span>
            </label>
          ))}
        </fieldset>
        <FieldError id="game-error" message={props.error} />
        {props.extra}
      </div>
      <div className="sticky bottom-0 -mx-4 space-y-2 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        {/* In the sticky bar so the required tick box is always visible next to the button. */}
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-coral" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{REVEAL_NOTE} I'm happy for my pick to be shown.</span>
        </label>
        <button type="button" className="btn-primary" disabled={!choice || !ack || props.busy} onClick={() => choice && props.onSubmit(choice, ack)}>
          {props.busy ? 'Sending…' : props.submitLabel}
        </button>
      </div>
    </>
  )
}

/** Screen 15 for the partner: guess from the same options, or pass. */
export function GameGuess({ interaction }: { interaction: InteractionView }) {
  const { navigate } = useRouter()
  const guess = useAction('game-guess', (key, optionId: string, ack: boolean) =>
    respondToGame({ interaction_id: interaction.interaction_id, option_id: optionId, acknowledged: ack, idempotencyKey: key }),
  )
  const decline = useAction('decline', (key) => declineInteraction({ interaction_id: interaction.interaction_id, idempotencyKey: key }))
  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <button type="button" className="btn-ghost -ml-3 self-start no-underline" onClick={() => navigate('home')}>← Back</button>
      <GamePicker
        lead={`${interaction.initiator_label} picked one. Which do you guess?`}
        question={{ category: interaction.category, context: interaction.context, text: interaction.question_text }}
        options={interaction.options ?? []}
        busy={guess.busy}
        error={(guess.error ?? decline.error)?.message}
        submitLabel="Send my guess"
        onSubmit={async (optionId, ack) => {
          const r = await guess.run(optionId, ack)
          if (r?.ok) navigate('waiting', interaction.interaction_id)
        }}
        extra={
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={decline.busy}
            onClick={async () => {
              const r = await decline.run()
              if (r?.ok) navigate('waiting', interaction.interaction_id)
            }}
          >
            Not this one
          </button>
        }
      />
    </main>
  )
}

/** Waiting, or the reveal once both have picked. */
export function GameStatus({ interaction: i }: { interaction: InteractionView }) {
  const { navigate } = useRouter()
  let title = 'Your pick is in!'
  let body = `${i.partner_label} can guess whenever suits them.`
  if (i.status === 'awaiting_partner' && i.role === 'partner') {
    title = 'Your turn to guess'
    body = `${i.initiator_label} picked one.`
  } else if (i.status === 'completed' && i.reveal) {
    title = i.reveal.same ? 'Great minds!' : 'Ooh, a little surprise!'
    body = i.reveal.same ? 'You both landed on the same one.' : 'Now you know a little more.'
  } else if (i.status === 'completed') {
    title = 'This game has finished'
    body = 'Picks are cleared a day after the reveal.'
  } else if (i.status !== 'awaiting_partner') {
    title = 'Not this one'
    body = 'This game has closed. There are plenty more little moments.'
  }
  const pickedLabel = i.role === 'initiator' ? 'Picked' : 'Guessed'
  const partnerVerb = i.role === 'initiator' ? 'guessed' : 'picked'
  return (
    <main aria-labelledby="waiting-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <div className="flex-1 space-y-5 pb-6">
        <div className="pt-6 text-center">
          <h1 id="waiting-title" className="text-2xl font-extrabold" aria-live="polite">{title}</h1>
          <p className="mt-2 text-ink-soft">{body}</p>
        </div>
        <QuestionCard category={i.category} context={i.context} text={i.question_text} headingLevel={2} />
        {i.reveal && (
          <section aria-label="Reveal" className="grid grid-cols-2 gap-3">
            <div className="card text-center">
              <p className="text-sm text-ink-soft">You {pickedLabel.toLowerCase()}</p>
              <p className="mt-1 text-lg font-extrabold">{i.reveal.mine}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-ink-soft">{i.partner_label} {partnerVerb}</p>
              <p className="mt-1 text-lg font-extrabold">{i.reveal.theirs}</p>
            </div>
          </section>
        )}
        {i.role === 'partner' && i.status === 'awaiting_partner' && !i.my_response && (
          <button type="button" className="btn-primary" onClick={() => navigate('answer', i.interaction_id)}>Make your guess</button>
        )}
      </div>
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-3 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">
        <button type="button" className="btn-secondary" onClick={() => navigate('home')}>Home</button>
        <button type="button" className="btn-secondary" onClick={() => navigate('explore')}>Explore</button>
      </div>
    </main>
  )
}
