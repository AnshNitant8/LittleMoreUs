import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from '../../app/router'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { LoadingState } from '../../components/ui'
import { useAction } from '../../hooks/useAction'
import { useService } from '../../hooks/useService'
import { cancelOtp, getOtpStatus, requestOtp, verifyOtp } from '../../services/api'
import { SERVER_MODE } from '../../services/serverMode'
import { waitForEmailLink } from '../../services/remote/api'

export function OtpScreen() {
  const { navigate } = useRouter()
  const { state, reload } = useService(getOtpStatus)
  const [code, setCode] = useState('')
  const verify = useAction('verify-otp', (key) => verifyOtp({ code, idempotencyKey: key }))
  const resend = useAction('resend-otp', (key, identifier: string, mode: 'signup' | 'login') =>
    requestOtp({ identifier, mode, is_18_confirmed: true, idempotencyKey: key }),
  )
  const [resent, setResent] = useState(false)

  // Re-read status every second so the resend countdown and lockout stay current.
  useEffect(() => {
    const t = setInterval(() => void reload(), 1000)
    return () => clearInterval(t)
  }, [reload])

  if (state.status === 'loading') return <LoadingState />
  const status = state.status === 'ready' ? state.data : null
  if (!status) {
    return (
      <OnboardingLayout title="Let's start again" footer={<button className="btn-primary" type="button" onClick={() => navigate('welcome')}>Back to start</button>}>
        <p>There is no code waiting on this device.</p>
      </OnboardingLayout>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setResent(false)
    await verify.run()
    // On success the app shell moves on to onboarding or Home automatically.
  }

  const onResend = async () => {
    setResent(false)
    const res = await resend.run(status.identifier, status.mode)
    if (res?.ok) {
      setCode('')
      verify.setError(null)
      setResent(true)
    }
  }

  const locked = !!status.locked_until
  const error = verify.error ?? resend.error

  if (SERVER_MODE) {
    return (
      <OnboardingLayout
        title="Check your email"
        intro={<>We sent a sign-in link to <strong className="text-ink">{status.identifier}</strong>. Tap it, and this page will sign you in by itself.</>}
        onBack={async () => {
          await cancelOtp()
          navigate('signin')
        }}
        footer={
          <button type="button" className="btn-ghost w-full" disabled={status.resend_available_in_sec > 0 || resend.busy} onClick={onResend}>
            {status.resend_available_in_sec > 0 ? `Send the link again in ${status.resend_available_in_sec}s` : 'Send the link again'}
          </button>
        }
      >
        <WaitForLink />
        <p className="text-sm text-ink-soft">Can't see it? Check your spam folder. If you open the link on another phone or browser, you'll be signed in there instead.</p>
        {resent && <p role="status" className="text-sm text-ink-soft">A new link is on its way. Use the newest email.</p>}
        <FieldError id="otp-error" message={resend.error?.message} />
      </OnboardingLayout>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <OnboardingLayout
        title="Enter your code"
        intro={<>We sent a 6-digit code to <strong className="text-ink">{status.identifier}</strong>.{SERVER_MODE ? ' Check your inbox, and your spam folder too.' : ' It works for 10 minutes.'}</>}
        onBack={async () => {
          await cancelOtp()
          navigate('signin')
        }}
        footer={
          <>
            <button type="submit" className="btn-primary" disabled={code.length !== 6 || verify.busy || locked}>
              {verify.busy ? 'Checking…' : 'Continue'}
            </button>
            <button type="button" className="btn-ghost w-full" disabled={status.resend_available_in_sec > 0 || resend.busy || locked} onClick={onResend}>
              {status.resend_available_in_sec > 0 ? `Resend code in ${status.resend_available_in_sec}s` : 'Resend code'}
            </button>
          </>
        }
      >
        <label htmlFor="otp" className="block font-bold">
          6-digit code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={!!error}
          aria-describedby="otp-hint"
          className="min-h-14 w-full rounded-2xl border-2 border-line bg-white px-4 text-center font-mono text-2xl tracking-[0.5em] focus:border-coral focus:outline-none"
        />
        {SERVER_MODE ? (
          <p id="otp-hint" className="text-sm text-ink-soft">Type the 6-digit code from the email, or simply tap the sign-in link in it.</p>
        ) : (
          <p id="otp-hint" className="inline-block rounded-md border border-dashed border-proto bg-white px-2 py-1 font-mono text-xs text-proto">
            Prototype: the code is always 123456
          </p>
        )}
        {resent && <p role="status" className="text-sm text-ink-soft">A new code is on its way.</p>}
        <FieldError id="otp-error" message={error?.message} />
      </OnboardingLayout>
    </form>
  )
}

/** Signs this tab in as soon as the email link is opened in another tab. */
function WaitForLink() {
  useEffect(() => waitForEmailLink(), [])
  return (
    <p role="status" className="flex items-center gap-2 text-ink-soft">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-coral" aria-hidden="true" />
      Waiting for you to tap the link…
    </p>
  )
}
