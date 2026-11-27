import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from '../../app/router'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { useAction } from '../../hooks/useAction'
import { requestOtp } from '../../services/api'

export function SignInScreen({ mode }: { mode: 'signup' | 'login' }) {
  const { navigate } = useRouter()
  // The typed phone number or email survives switching between log in and sign up.
  const [identifier, setIdentifier] = useState('')
  const [adult, setAdult] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { run, busy, error, setError } = useAction('request-otp', (key) =>
    requestOtp({ identifier, mode, is_18_confirmed: adult, idempotencyKey: key }),
  )
  const isSignup = mode === 'signup'
  const canSubmit = identifier.trim().length > 0 && (!isSignup || adult) && !busy

  useEffect(() => {
    setError(null)
    setAdult(false)
  }, [mode, setError])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setNotice(null)
    const res = await run()
    if (res?.ok) return navigate('otp')
    // No account yet: go straight to creating one with what they typed.
    // The 18+ tick and the Terms still apply, and a pending invite stays on this device.
    if (res && !res.ok && res.error.code === 404 && !isSignup) {
      setNotice(`There's no account with ${identifier.trim()} yet, so let's create one. Confirm you're 18 or older, then we'll send your code.`)
      navigate('signin', 'signup')
    }
  }

  const switchMode = () => {
    setError(null)
    setNotice(null)
    navigate('signin', isSignup ? 'login' : 'signup')
  }

  return (
    <form onSubmit={submit} noValidate>
      <OnboardingLayout
        title={isSignup ? 'Create your account' : 'Welcome back'}
        intro="Use your phone number or email. We'll send a one-time code. There are no passwords."
        onBack={() => navigate('welcome')}
        footer={
          <>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {busy ? 'Sending…' : 'Send my code'}
            </button>
            <button type="button" className="btn-ghost w-full" onClick={switchMode}>
              {isSignup ? 'I already have an account' : 'Create a new account'}
            </button>
          </>
        }
      >
        <div>
          <label htmlFor="identifier" className="mb-1 block font-bold">
            Phone number or email
          </label>
          <input
            id="identifier"
            inputMode="email"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'signin-error' : undefined}
            className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none"
            placeholder="+91 98765 43210 or you@example.com"
          />
        </div>
        {notice && isSignup && (
          <p role="status" className="card text-sm">{notice}</p>
        )}
        {isSignup && (
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
        {error?.code === 409 && isSignup && (
          <button type="button" className="btn-secondary" onClick={switchMode}>
            Log in instead
          </button>
        )}
        {error?.code === 404 && !isSignup && (
          <button type="button" className="btn-secondary" onClick={switchMode}>
            Create an account instead
          </button>
        )}
      </OnboardingLayout>
    </form>
  )
}
