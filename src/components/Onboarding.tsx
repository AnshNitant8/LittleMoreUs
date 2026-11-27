import type { ReactNode } from 'react'

/** Layout for onboarding steps: content scrolls, primary action sits near the thumb. */
export function OnboardingLayout({
  title,
  intro,
  step,
  total,
  children,
  footer,
  onBack,
}: {
  title: string
  intro?: ReactNode
  step?: number
  total?: number
  children: ReactNode
  footer: ReactNode
  onBack?: () => void
}) {
  return (
    <main aria-labelledby="screen-title" className="flex min-h-dvh flex-col px-4 pt-6">
      <div className="flex min-h-11 items-center gap-3 pr-16">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost -ml-3 no-underline" aria-label="Back">
            ← Back
          </button>
        )}
        {step && total && (
          <p className="text-sm text-ink-soft">
            <span className="sr-only">Step </span>
            {step} of {total}
          </p>
        )}
      </div>
      <h1 id="screen-title" className="screen-title mt-2">
        {title}
      </h1>
      {intro && <div className="mt-2 text-ink-soft">{intro}</div>}
      <div className="mt-6 flex-1 space-y-4 pb-6">{children}</div>
      <div className="sticky bottom-0 -mx-4 space-y-2 bg-cream/95 px-4 pb-6 pt-3 backdrop-blur">{footer}</div>
    </main>
  )
}

export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="rounded-xl bg-coral-tint px-3 py-2 text-sm font-semibold text-ink">
      {message}
    </p>
  )
}

/** A large selectable card used for single and multi choice lists. */
export function ChoiceCard({
  type,
  name,
  checked,
  onChange,
  label,
  description,
  accent,
  icon,
}: {
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  accent?: string
  icon?: ReactNode
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border-2 p-4 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-coral ${
        checked ? 'border-coral bg-white shadow-sm' : 'border-transparent bg-white/70'
      }`}
      style={accent ? { background: checked ? accent : undefined } : undefined}
    >
      <input type={type} name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      {icon}
      <span className="flex-1">
        <span className="block font-bold">{label}</span>
        {description && <span className="block text-sm text-ink-soft">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${type === 'radio' ? 'rounded-full' : 'rounded-md'} ${
          checked ? 'border-coral bg-coral text-white' : 'border-line bg-white'
        }`}
      >
        {checked && '✓'}
      </span>
    </label>
  )
}

/** "Select all" for a multi-select list. Shows a mixed state when only some are chosen. */
export function SelectAll({ total, selected, onChange, label = 'Select all' }: { total: number; selected: number; onChange: (all: boolean) => void; label?: string }) {
  const all = selected === total
  const some = selected > 0 && !all
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl px-[18px]">
      <span className="font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={all}
        aria-checked={some ? 'mixed' : all}
        ref={(el) => {
          if (el) el.indeterminate = some
        }}
        onChange={() => onChange(!all)}
        className="h-6 w-6 shrink-0 cursor-pointer accent-coral"
      />
    </label>
  )
}
