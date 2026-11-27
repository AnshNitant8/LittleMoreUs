import { useState } from 'react'
import { CategoryIllustration } from '../../components/Illustrations'
import { ChoiceCard, FieldError, OnboardingLayout, SelectAll } from '../../components/Onboarding'
import { CATEGORIES, CATEGORY_ORDER, DEPTH_LABELS } from '../../domain/constants'
import { DEPTHS, type CategoryId, type Depth, type User } from '../../domain/types'
import { useAction } from '../../hooks/useAction'
import { updatePreferences } from '../../services/api'

export function MomentsScreen({ user, step, total, onBack, onDone }: { user: User; step: number; total: number; onBack: () => void; onDone: () => void }) {
  const [cats, setCats] = useState<CategoryId[]>(user.preferences.categories)
  const [depth, setDepth] = useState<Depth | null>(user.preferences.depth)
  const save = useAction('set-moments', (key) => updatePreferences({ categories: cats, depth: depth!, idempotencyKey: key }))
  const toggle = (c: CategoryId, on: boolean) => setCats((prev) => (on ? [...prev, c] : prev.filter((x) => x !== c)))

  return (
    <OnboardingLayout
      title="Choose your moments"
      intro="Pick the kinds of little moments you'd enjoy. You can change this any time."
      step={step}
      total={total}
      onBack={onBack}
      footer={
        <>
          {cats.length === 0 && <p className="text-center text-sm text-ink-soft">Choose at least one kind of moment.</p>}
          <button type="button" className="btn-primary" disabled={cats.length === 0 || !depth || save.busy} onClick={async () => { const r = await save.run(); if (r?.ok) onDone() }}>
            Continue
          </button>
        </>
      }
    >
      <fieldset className="space-y-3">
        <legend className="mb-1 font-bold">Kinds of moments</legend>
        <SelectAll total={CATEGORY_ORDER.length} selected={cats.length} onChange={(all) => setCats(all ? [...CATEGORY_ORDER] : [])} />
        {CATEGORY_ORDER.map((c) => (
          <ChoiceCard
            key={c}
            type="checkbox"
            name="categories"
            checked={cats.includes(c)}
            onChange={(on) => toggle(c, on)}
            label={CATEGORIES[c].name}
            description={CATEGORIES[c].description}
            accent={CATEGORIES[c].accent}
            icon={<CategoryIllustration category={c} size={44} />}
          />
        ))}
      </fieldset>
      <fieldset className="space-y-3 pt-2">
        <legend className="mb-1 font-bold">How deep would you like to go?</legend>
        {DEPTHS.map((d) => (
          <ChoiceCard key={d} type="radio" name="depth" checked={depth === d} onChange={() => setDepth(d)} label={DEPTH_LABELS[d]} />
        ))}
      </fieldset>
      <FieldError id="moments-error" message={save.error?.message} />
    </OnboardingLayout>
  )
}
