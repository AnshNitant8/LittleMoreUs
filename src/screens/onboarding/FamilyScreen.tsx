import { useState } from 'react'
import { FieldError, OnboardingLayout } from '../../components/Onboarding'
import { PARENT_LABEL_MAX, PARENT_LABEL_PRESETS } from '../../domain/constants'
import type { User } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { updateMe } from '../../services/api'

const CUSTOM = '__custom__'

export function FamilyScreen({ user, step, total, onBack, onDone }: { user: User; step: number; total: number; onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState(user.display_name)
  const isPreset = (PARENT_LABEL_PRESETS as readonly string[]).includes(user.parent_label)
  const [choice, setChoice] = useState<string>(user.parent_label ? (isPreset ? user.parent_label : CUSTOM) : '')
  const [custom, setCustom] = useState(isPreset ? '' : user.parent_label)
  const label = choice === CUSTOM ? custom : choice
  const save = useAction('set-family', (key) => updateMe({ display_name: name, parent_label: label, idempotencyKey: key }))
  const labelLen = Array.from(custom.trim()).length
  const canContinue = name.trim().length > 0 && label.trim().length > 0 && labelLen <= PARENT_LABEL_MAX && !save.busy

  return (
    <OnboardingLayout
      title="A little about you"
      intro="You each set up your own profile. Your partner chooses their own label."
      step={step}
      total={total}
      onBack={onBack}
      footer={
        <button type="button" className="btn-primary" disabled={!canContinue} onClick={async () => { const r = await save.run(); if (r?.ok) onDone() }}>
          Continue
        </button>
      }
    >
      <div>
        <label htmlFor="display-name" className="mb-1 block font-bold">Your first name</label>
        <input
          id="display-name"
          autoComplete="given-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none"
        />
      </div>
      <fieldset>
        <legend className="mb-1 font-bold">What does your little one call you?</legend>
        <p className="mb-3 text-sm text-ink-soft">Used in your stories. Pick one or write your own, in any language.</p>
        <div className="flex flex-wrap gap-2">
          {[...PARENT_LABEL_PRESETS, CUSTOM].map((p) => {
            const selected = choice === p
            return (
              <label
                key={p}
                className={`flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-coral ${
                  selected ? 'border-coral bg-coral text-white' : 'border-line bg-white text-ink'
                }`}
              >
                <input type="radio" name="parent_label" className="sr-only" checked={selected} onChange={() => setChoice(p)} />
                {p === CUSTOM ? 'Something else' : p}
              </label>
            )
          })}
        </div>
        {choice === CUSTOM && (
          <div className="mt-3">
            <label htmlFor="custom-label" className="mb-1 block text-sm font-bold">Your label</label>
            <input
              id="custom-label"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-describedby="custom-label-count"
              className="min-h-12 w-full rounded-2xl border-2 border-line bg-white px-4 text-lg focus:border-coral focus:outline-none"
            />
            <p id="custom-label-count" className={`mt-1 text-sm ${labelLen > PARENT_LABEL_MAX ? 'font-bold text-coral' : 'text-ink-soft'}`}>
              {labelLen} / {PARENT_LABEL_MAX} characters
            </p>
          </div>
        )}
      </fieldset>
      <FieldError id="family-error" message={save.error?.message} />
    </OnboardingLayout>
  )
}
