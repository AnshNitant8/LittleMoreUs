import { useRouter } from '../app/router'
import { CategoryIllustration, HeroFamilies } from '../components/Illustrations'
import { EmptyState, ErrorState, LoadingState, Screen } from '../components/ui'
import { SAMPLE_MOMENT } from '../data/sample'
import { CATEGORIES } from '../domain/constants'
import { useService } from '../hooks/useService'
import { getHome, getMyInvitation, type CoupleView, type InteractionView } from '../services/api'

export function HomeScreen({ name, couple }: { name: string; couple: CoupleView | null }) {
  const { navigate } = useRouter()
  return (
    <Screen title="Home" hideTitle>
      <header>
        <p className="text-2xl font-extrabold">Hello, {name}</p>
        <p className="text-ink-soft">
          {couple ? `You and ${couple.partner.display_name}, a little more us today.` : 'A little more us, today.'}
        </p>
      </header>
      <div className="card bg-cream-deep">
        <HeroFamilies className="w-full" />
      </div>
      {couple ? (
        <PairedHome />
      ) : (
        <>
          <InvitationCard />
          <SampleMoment />
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" onClick={() => navigate('explore')}>Explore</button>
        <button type="button" className="btn-secondary" onClick={() => navigate('storybook')}>Storybook</button>
      </div>
    </Screen>
  )
}

function InvitationCard() {
  const { navigate } = useRouter()
  const { state } = useService(getMyInvitation)
  const status = state.status === 'ready' ? state.data?.status : undefined
  const note =
    status === 'sent'
      ? 'Your invitation is on its way. Moments begin once your partner joins.'
      : status === 'declined'
        ? 'Your last invitation was declined. You can send a new one whenever you like.'
        : status === 'expired'
          ? 'Your last invite link expired. You can send a new one whenever you like.'
          : 'Moments need two. Invite your partner so you can each answer privately.'
  return (
    <section aria-labelledby="invite-card-title" className="card space-y-3 border-2 border-coral-tint">
      <h2 id="invite-card-title" className="text-lg font-extrabold">Invite your partner</h2>
      <p className="text-ink-soft">{note}</p>
      <button type="button" className="btn-primary" onClick={() => navigate('invite-partner')}>
        {status === 'sent' ? 'See your invitation' : 'Invite your partner'}
      </button>
    </section>
  )
}

/** Read-only sample: no inputs, nothing is stored. */
function SampleMoment() {
  const cat = CATEGORIES[SAMPLE_MOMENT.category]
  return (
    <section aria-labelledby="sample-title" className="space-y-3 rounded-[var(--radius-card)] p-5" style={{ background: cat.accent }}>
      <div className="flex items-center justify-between">
        <h2 id="sample-title" className="font-extrabold">
          A sample moment <span className="sr-only">(Sample, read only)</span>
        </h2>
        <span aria-hidden="true" className="rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-ink">
          Sample
        </span>
      </div>
      <div className="flex items-start gap-3">
        <CategoryIllustration category={SAMPLE_MOMENT.category} size={44} />
        <div>
          <p className="text-sm font-bold text-ink-soft">{cat.name}</p>
          <p className="text-lg font-bold">{SAMPLE_MOMENT.question}</p>
        </div>
      </div>
      <figure className="rounded-2xl bg-white p-4">
        <figcaption className="mb-2 text-sm font-bold text-ink-soft">A little story from your little one</figcaption>
        <blockquote className="text-lg leading-relaxed">{SAMPLE_MOMENT.story}</blockquote>
        <p className="mt-2 text-xs text-ink-soft">Imaginative writing, not your child's actual words.</p>
      </figure>
      <p className="text-sm text-ink-soft">You'll be able to answer once your partner joins.</p>
    </section>
  )
}

function PairedHome() {
  const { navigate } = useRouter()
  const { state, reload } = useService(getHome)
  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') return <ErrorState message={state.error.message} onRetry={reload} />
  const { featured, waiting_for_you, my_open, recent_stories, recent_closed, recent_games } = state.data
  return (
    <>
      {waiting_for_you.length > 0 && (
        <section aria-labelledby="waiting-title" className="space-y-3">
          <h2 id="waiting-title" className="text-lg font-extrabold">Waiting for you</h2>
          <ul className="space-y-3">
            {waiting_for_you.map((i) => (
              <li key={i.interaction_id}>
                <MomentRow i={i} onOpen={() => navigate('answer', i.interaction_id)} note={i.type === 'game' ? `${i.initiator_label} started a guessing game` : `${i.initiator_label} started this`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="featured-title" className="space-y-3">
        <h2 id="featured-title" className="text-lg font-extrabold">Today's little moment</h2>
        {featured.kind === 'question' ? (
          <div className="space-y-3 rounded-[var(--radius-card)] p-5" style={{ background: CATEGORIES[featured.question.category].accent }}>
            <div className="flex items-center gap-3">
              <CategoryIllustration category={featured.question.category} size={44} />
              <p className="text-lg font-bold">{CATEGORIES[featured.question.category].name}</p>
            </div>
            <button type="button" className="btn-primary" onClick={() => navigate('ask', 'featured')}>
              Let's do this
            </button>
            {featured.pacing.show_label && featured.pacing.remaining !== null && (
              <p className="text-center text-sm text-ink-soft">Room for {featured.pacing.remaining} more new {featured.pacing.remaining === 1 ? 'moment' : 'moments'} today, if you like.</p>
            )}
          </div>
        ) : featured.kind === 'cap_reached' ? (
          <EmptyState>That's plenty of new moments for today. Anything waiting for you is still open.</EmptyState>
        ) : (
          <EmptyState>You've explored everything for now. New moments will appear over time.</EmptyState>
        )}
      </section>

      {waiting_for_you.length === 0 && <p className="text-center text-ink-soft">Nothing waiting right now. Enjoy your day.</p>}

      {my_open.length > 0 && (
        <section aria-labelledby="open-title" className="space-y-3">
          <h2 id="open-title" className="text-lg font-extrabold">On their way</h2>
          <ul className="space-y-3">
            {my_open.map((i) => (
              <li key={i.interaction_id}>
                <MomentRow i={i} onOpen={() => navigate('waiting', i.interaction_id)} note={i.status === 'generating' ? 'Writing your story' : 'Waiting'} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent_closed.length > 0 && (
        <section aria-labelledby="closed-title" className="space-y-3">
          <h2 id="closed-title" className="text-lg font-extrabold">Recent moments</h2>
          <ul className="space-y-3">
            {recent_closed.map((i) => (
              <li key={i.interaction_id}>
                <MomentRow
                  i={i}
                  onOpen={() => navigate('waiting', i.interaction_id)}
                  note={i.status === 'declined' ? 'Not this one' : i.status === 'expired' ? 'Closed' : "This one didn't become a story"}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent_games.length > 0 && (
        <section aria-labelledby="games-title" className="space-y-3">
          <h2 id="games-title" className="text-lg font-extrabold">Ready to reveal</h2>
          <ul className="space-y-3">
            {recent_games.map((i) => (
              <li key={i.interaction_id}>
                <MomentRow i={i} onOpen={() => navigate('waiting', i.interaction_id)} note="Guess My Answer" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent_stories.length > 0 && (
        <section aria-labelledby="stories-title" className="space-y-3">
          <h2 id="stories-title" className="text-lg font-extrabold">New stories</h2>
          <ul className="space-y-3">
            {recent_stories.map((s) => (
              <li key={s.story_id}>
                <button type="button" className="card flex min-h-14 w-full items-center gap-3 text-left" onClick={() => navigate('story', s.story_id)}>
                  <CategoryIllustration category={s.category} size={40} />
                  <span className="flex-1 font-bold">A little {CATEGORIES[s.category].name} story</span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function MomentRow({ i, onOpen, note }: { i: InteractionView; onOpen: () => void; note: string }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-[var(--radius-card)] p-4 text-left shadow-sm" style={{ background: CATEGORIES[i.category].accent }}>
      <CategoryIllustration category={i.category} size={40} />
      <span className="flex-1">
        <span className="block text-sm font-bold text-ink-soft">{CATEGORIES[i.category].name} · {note}</span>
        <span className="block font-bold">{i.question_text}</span>
      </span>
      <span aria-hidden="true" className="self-center text-xl">›</span>
    </button>
  )
}
