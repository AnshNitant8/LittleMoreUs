import { useRouter } from '../app/router'
import { CategoryIllustration, HeroFamilies } from '../components/Illustrations'
import { ComingLater, Screen } from '../components/ui'
import { SAMPLE_MOMENT } from '../data/sample'
import { CATEGORIES } from '../domain/constants'
import { useService } from '../hooks/useService'
import { getMyInvitation, type CoupleView } from '../services/api'

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
        <ComingLater what="Featured moment and “Waiting for you”" stage={4} />
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
