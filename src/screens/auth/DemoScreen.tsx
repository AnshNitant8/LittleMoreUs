import { useState, type FormEvent } from 'react'
import { useRouter } from '../../app/router'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { useAction } from '../../hooks/useAction'
import { demoSignIn } from '../../services/remote/api'
import { trackEvent } from '../../services/productAnalytics'

/** Sign in to one of the two ready-made demo accounts with the demo passcode. */
export function DemoScreen() {
  const { navigate } = useRouter()
  const [who, setWho] = useState<'a' | 'b'>('a')
  const [passcode, setPasscode] = useState('')
  const go = useAction('demo-signin', (_key) => demoSignIn(who, passcode))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await go.run()
    if (r?.ok) trackEvent('demo_sign_in')
  }

  return (
    <form onSubmit={submit} noValidate>
      <OnboardingLayout
        title="Demo sign-in"
        intro="Two ready-made partners for showing the app. Open one on each phone or browser."
        onBack={() => navigate('welcome')}
        footer={
          <button type="submit" className="btn-primary" disabled={!passcode.trim() || go.busy}>
            {go.busy ? 'Opening…' : 'Open demo account'}
          </button>
        }
      >
        <fieldset className="space-y-3">
          <legend className="mb-1 font-bold">Who are you showing as?</legend>
          {(
            [
              ['a', 'Priya (Mama)'],
              ['b', 'Arjun (Papa)'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-white px-4">
              <input type="radio" name="who" checked={who === id} onChange={() => setWho(id)} />
              <span className="font-bold">{label}</span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="demo-pass" className="mt-4 block font-bold">
          Demo passcode
        </label>
        <input
          id="demo-pass"
          type="password"
          autoComplete="off"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 focus:border-coral focus:outline-none"
        />
        <FieldError id="demo-error" message={go.error?.message} />
      </OnboardingLayout>
    </form>
  )
}
