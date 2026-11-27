import { useState } from 'react'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import type { NotificationPrefs, User } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { updateMe, updatePreferences } from '../../services/api'

const TOGGLES: { key: keyof NotificationPrefs['toggles']; label: string; hint: string }[] = [
  { key: 'app_suggestions', label: 'App suggestions', hint: 'At most one gentle nudge a day.' },
  { key: 'partner_invitations', label: 'Partner invitations', hint: 'When your partner starts a moment for you both.' },
  { key: 'pending_reminders', label: 'Pending reminders', hint: 'One soft reminder, never more.' },
]

export function useNotificationPrefsForm({
  initial,
  onSaved,
  submitLabel,
}: {
  initial: NotificationPrefs
  onSaved?: () => Promise<unknown> | void
  submitLabel: string
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial)
  const save = useAction('set-notifications', (key) => updatePreferences({ notification_prefs: prefs, idempotencyKey: key }))
  const time = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex-1">
      <label htmlFor={id} className="mb-1 block text-sm font-bold">{label}</label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => set(e.target.value)}
        className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-3 text-lg focus:border-coral focus:outline-none"
      />
    </div>
  )
  return {
    fields: (
      <>
        <fieldset className="card space-y-3">
          <legend className="sr-only">Preferred notification window</legend>
          <p className="font-bold">Preferred time for notifications</p>
          <div className="flex gap-3">
            {time('win-start', 'From', prefs.window.start, (v) => setPrefs({ ...prefs, window: { ...prefs.window, start: v } }))}
            {time('win-end', 'Until', prefs.window.end, (v) => setPrefs({ ...prefs, window: { ...prefs.window, end: v } }))}
          </div>
        </fieldset>
        <fieldset className="card space-y-3">
          <legend className="sr-only">Quiet hours</legend>
          <p className="font-bold">Quiet hours</p>
          <p className="text-sm text-ink-soft">Nothing will arrive during these hours. It waits until they end.</p>
          <div className="flex gap-3">
            {time('quiet-start', 'From', prefs.quiet_hours.start, (v) => setPrefs({ ...prefs, quiet_hours: { ...prefs.quiet_hours, start: v } }))}
            {time('quiet-end', 'Until', prefs.quiet_hours.end, (v) => setPrefs({ ...prefs, quiet_hours: { ...prefs.quiet_hours, end: v } }))}
          </div>
        </fieldset>
        <fieldset className="card space-y-1">
          <legend className="sr-only">Notification types</legend>
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex min-h-14 cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block font-bold">{t.label}</span>
                <span className="block text-sm text-ink-soft">{t.hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={prefs.toggles[t.key]}
                checked={prefs.toggles[t.key]}
                onChange={(e) => setPrefs({ ...prefs, toggles: { ...prefs.toggles, [t.key]: e.target.checked } })}
                className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition before:block before:h-6 before:w-6 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-coral checked:before:translate-x-5"
              />
            </label>
          ))}
        </fieldset>
        <FieldError id="notif-error" message={save.error?.message} />
      </>
    ),
    submit: (
      <button
        type="button"
        className="btn-primary"
        disabled={save.busy}
        onClick={async () => {
          const res = await save.run()
          if (res?.ok) await onSaved?.()
        }}
      >
        {save.busy ? 'Saving…' : submitLabel}
      </button>
    ),
  }
}

export function NotificationPrefsScreen({ user, step, total, onBack }: { user: User; step: number; total: number; onBack: () => void }) {
  const finish = useAction('finish-onboarding', (key) => updateMe({ onboarding_complete: true, idempotencyKey: key }))
  const form = useNotificationPrefsForm({ initial: user.notification_prefs, submitLabel: 'All set', onSaved: () => finish.run() })
  return (
    <OnboardingLayout
      title="Gentle notifications"
      intro="These only appear in the app in this prototype. They never include question or answer text."
      step={step}
      total={total}
      onBack={onBack}
      footer={
        <>
          <FieldError id="finish-error" message={finish.error?.message} />
          {form.submit}
        </>
      }
    >
      {form.fields}
    </OnboardingLayout>
  )
}
