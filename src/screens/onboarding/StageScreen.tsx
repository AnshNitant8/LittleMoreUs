import { useState } from 'react'
import { ChoiceCard, FieldError, OnboardingLayout } from '../../components/Onboarding'
import { AGE_BAND_LABELS } from '../../domain/constants'
import { AGE_BANDS, type AgeBand, type User } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { updateMe } from '../../services/api'

export function StageScreen({
  user,
  step,
  total,
  onDone,
  householdAgeBand = null,
}: {
  user: User
  step: number
  total: number
  onDone: () => void
  householdAgeBand?: AgeBand | null
}) {
  // An invitee sees the household stage prefilled from their partner and may change it.
  const [band, setBand] = useState<AgeBand | null>(user.age_band ?? householdAgeBand)
  const save = useAction('set-age-band', (key) => updateMe({ age_band: band!, idempotencyKey: key }))
  return (
    <OnboardingLayout
      title="Where are you in parenthood?"
      intro={
        householdAgeBand && !user.age_band
          ? 'Your partner chose this. Change it if it doesn\'t fit. We never ask for your baby\'s name or birthday.'
          : "This helps us pick moments that fit. We never ask for your baby's name or birthday."
      }
      step={step}
      total={total}
      footer={
        <button type="button" className="btn-primary" disabled={!band || save.busy} onClick={async () => { const r = await save.run(); if (r?.ok) onDone() }}>
          Continue
        </button>
      }
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">Your little one's age</legend>
        {AGE_BANDS.map((b) => (
          <ChoiceCard key={b} type="radio" name="age_band" checked={band === b} onChange={() => setBand(b)} label={AGE_BAND_LABELS[b]} />
        ))}
      </fieldset>
      <FieldError id="stage-error" message={save.error?.message} />
    </OnboardingLayout>
  )
}
