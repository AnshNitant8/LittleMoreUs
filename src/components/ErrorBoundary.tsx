import { Component, type ReactNode } from 'react'

/** Last-resort error state so an unexpected bug never leaves a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Logged without user content: only the error message.
    console.error('[app] unexpected error', error instanceof Error ? error.message : 'unknown')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main aria-labelledby="crash-title" className="space-y-4 px-4 pt-16">
        <h1 id="crash-title" className="screen-title">Something went wrong</h1>
        <p className="text-ink-soft">Nothing you wrote has been shared. Please try again.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            window.location.hash = '#/home'
            this.setState({ failed: false })
          }}
        >
          Back to Home
        </button>
      </main>
    )
  }
}
