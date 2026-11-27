import { useRouter } from '../../app/router'
import { HeroFamilies } from '../../components/Illustrations'

export function WelcomeScreen() {
  const { navigate } = useRouter()
  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-16">
      <div className="flex items-center gap-2" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="36" height="36">
          <circle cx="16" cy="16" r="16" fill="#FDE7E0" />
          <path d="M16 25s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 24 14c0 6-8 11-8 11z" fill="#F2765D" />
        </svg>
        <span className="text-lg font-extrabold">A Little More Us</span>
      </div>
      <h1 id="screen-title" className="mt-8 text-3xl font-extrabold leading-tight">
        Parenthood may change your world, but you can still keep finding each other in it.
      </h1>
      <p className="mt-4 text-lg text-ink-soft">
        One small question, answered privately by each of you. Then a little story, imagined from your little one's point of view.
      </p>
      <div className="my-8 rounded-[var(--radius-card)] bg-cream-deep p-4">
        <HeroFamilies className="w-full" />
      </div>
      <div className="mt-auto space-y-3 pb-8">
        <button type="button" className="btn-primary" onClick={() => navigate('signin')}>
          Get Started
        </button>
        <button type="button" className="btn-secondary" onClick={() => navigate('signin')}>
          I already have an account
        </button>
      </div>
    </main>
  )
}
