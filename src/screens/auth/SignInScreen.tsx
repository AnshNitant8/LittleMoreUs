import { useState, type FormEvent } from 'react'
import { useRouter } from '../../app/router'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { useAction } from '../../hooks/useAction'
import { requestOtp } from '../../services/api'
import { SERVER_MODE } from '../../services/serverMode'

/**
 * One way in (Screen 02). The person types a phone number or email and the app
 * decides: an existing account is signed in; a new one is created after the
 * 18+ tick. "No account found" is never a dead end. Any invite opened earlier
 * stays on this device and is waiting after the code.
 */
export function SignInScreen() {
  const { navigate } = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [adult, setAdult] = useState(false)
  // Set when the service says this phone or email has no account yet.
  const [isNew, setIsNew] = useState(false)
  const { run, busy, error, setError } = useAction('request-otp', (key) =>
    requestOtp({ identifier, mode: 'continue', is_18_confirmed: adult, idempotencyKey: key }),
  )
  const canSubmit = identifier.trim().length > 0 && (!isNew || adult) && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const res = await run()
    if (res?.ok) return navigate('otp')
    if (res && !res.ok && res.error.new_account) {
      setIsNew(true)
      setError(null)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <OnboardingLayout
        title={isNew ? 'Create your account' : 'Sign in or create an account'}
        intro={
          isNew
            ? "You're new here, welcome. Confirm you're 18 or older and we'll send your code."
            : `Enter your ${SERVER_MODE ? 'email' : 'phone number or email'}. We'll send a one-time code. If you're new, we'll create your account. There are no passwords.`
        }
        onBack={() => navigate('welcome')}
        footer={
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {busy ? 'Sending…' : isNew ? 'Create account and send code' : 'Send my code'}
          </button>
        }
      >
        <div>
          <label htmlFor="identifier" className="mb-1 block font-bold">
            {SERVER_MODE ? 'Email' : 'Phone number or email'}
          </label>
          <input
            id="identifier"
            inputMode="email"
            autoComplete="username"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              // A different phone or email may already have an account: decide again.
              if (isNew) {
                setIsNew(false)
                setAdult(false)
              }
              if (error) setError(null)
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'signin-error' : undefined}
            className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none"
            placeholder={SERVER_MODE ? 'you@example.com' : '+91 98765 43210 or you@example.com'}
          />
        </div>
        {isNew && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-6 w-6 accent-coral" />
            <span>I am 18 or older</span>
          </label>
        )}
        <p className="text-sm text-ink-soft">
          By continuing you agree to our{' '}
          <a href="#/legal/terms" className="font-semibold text-coral underline">Terms</a> and{' '}
          <a href="#/legal/privacy" className="font-semibold text-coral underline">Privacy notice</a>.
        </p>
        <FieldError id="signin-error" message={error?.message} />
      </OnboardingLayout>
    </form>
  )
}
