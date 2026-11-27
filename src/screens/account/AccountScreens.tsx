import { useState } from 'react'
import { useRouter } from '../../app/router'
import { FieldError } from '../../components/Onboarding'
import { useAction } from '../../hooks/useAction'
import { cancelAccountDeletion, deleteAccount, logout } from '../../services/api'
import { formatDateTime } from '../../utils/time'

/** Screen 17: account deletion. Neutral wording; consequences before confirmation. */
export function DeleteAccountScreen() {
  const { navigate } = useRouter()
  const [alsoStories, setAlsoStories] = useState(false)
  const [sure, setSure] = useState(false)
  const del = useAction('delete-account', (key) => deleteAccount({ also_delete_shared_stories: alsoStories, confirm: true, idempotencyKey: key }))
  return (
    <main aria-labelledby="delete-title" className="space-y-5 px-4 pb-10 pt-6">
      <button type="button" className="btn-ghost -ml-3 no-underline" onClick={() => navigate('profile')}>← Back</button>
      <h1 id="delete-title" className="screen-title">Delete your account</h1>
      <div className="card space-y-2">
        <p className="font-bold">What happens</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Your answers are deleted straight away.</li>
          <li>If you're connected with a partner, the pairing ends and any open moments close.</li>
          <li>You're signed out. For 7 days you can sign in again to keep your account.</li>
          <li>After 7 days your account is erased for good.</li>
          <li>Shared stories stay for your partner unless you choose below to delete them for both of you.</li>
        </ul>
      </div>
      <label className="card flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-coral" checked={alsoStories} onChange={(e) => setAlsoStories(e.target.checked)} />
        <span>
          <span className="block font-bold">Also delete our shared stories for both of us</span>
          <span className="block text-sm text-ink-soft">They'll be removed from your partner's Storybook too when your account is erased.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-coral" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I understand, and I want to delete my account.</span>
      </label>
      <FieldError id="delete-error" message={del.error?.message} />
      <button
        type="button"
        className="btn-primary"
        disabled={!sure || del.busy}
        onClick={async () => {
          const r = await del.run()
          if (r?.ok) navigate('welcome')
        }}
      >
        Delete my account
      </button>
      <button type="button" className="btn-secondary" onClick={() => navigate('profile')}>Keep my account</button>
    </main>
  )
}

/** Shown when someone signs in during the 7-day recovery window. */
export function RecoverAccountScreen({ eraseAt }: { eraseAt: string }) {
  const { navigate } = useRouter()
  const keep = useAction('keep-account', (key) => cancelAccountDeletion({ idempotencyKey: key }))
  const out = useAction('logout', (key) => logout({ idempotencyKey: key }))
  return (
    <main aria-labelledby="recover-title" className="space-y-5 px-4 pb-10 pt-16">
      <h1 id="recover-title" className="screen-title">Welcome back</h1>
      <p className="card">Your account is set to be deleted on {formatDateTime(eraseAt)}. You can keep it if you've changed your mind.</p>
      <p className="text-sm text-ink-soft">Answers deleted earlier can't be brought back, and an ended pairing stays ended. You can invite your partner again.</p>
      <FieldError id="recover-error" message={(keep.error ?? out.error)?.message} />
      <button type="button" className="btn-primary" disabled={keep.busy} onClick={async () => (await keep.run())?.ok && navigate('home')}>Keep my account</button>
      <button type="button" className="btn-secondary" disabled={out.busy} onClick={async () => (await out.run())?.ok && navigate('welcome')}>Continue with deletion</button>
    </main>
  )
}
