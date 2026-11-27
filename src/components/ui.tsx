import type { ReactNode } from 'react'

export function Screen({ title, children, hideTitle }: { title: string; children: ReactNode; hideTitle?: boolean }) {
  return (
    <main aria-labelledby="screen-title" className="space-y-5 px-4 pb-28 pt-6">
      <h1 id="screen-title" className={hideTitle ? 'sr-only' : 'screen-title'}>
        {title}
      </h1>
      {children}
    </main>
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-ink-soft">
      <span className="h-3 w-3 animate-pulse rounded-full bg-coral-soft" aria-hidden="true" />
      {label}…
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card border border-coral-tint">
      <p className="font-semibold">That didn't quite work.</p>
      <p className="mt-1 text-ink-soft">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="card text-center text-ink-soft">{children}</p>
}

/** A clearly marked placeholder for features from a later build stage. */
export function ComingLater({ what, stage }: { what: string; stage: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-dashed border-line p-5 text-ink-soft">
      <p className="font-semibold text-ink">{what}</p>
      <p className="mt-1 text-sm">Not available in this prototype build yet (build stage {stage}).</p>
    </div>
  )
}
