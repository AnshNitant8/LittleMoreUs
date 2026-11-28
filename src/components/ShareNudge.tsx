import { useState } from 'react'
import { trackEvent } from '../services/productAnalytics'

/**
 * After I answer: one tap to let my partner know it's their turn, on WhatsApp.
 * The message never includes the question or any answer, only the app link.
 * Where WhatsApp isn't an option, the phone's share sheet or copying the link.
 */
export function ShareNudge({ partnerLabel, game = false }: { partnerLabel: string; game?: boolean }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/`
  const text = game
    ? `I've made my pick in our little guessing game on A Little More Us 😊 Your turn to guess, whenever you have a minute: ${url}`
    : `I've answered our little moment on A Little More Us 💛 Your turn, whenever a quiet minute finds you: ${url}`

  const other = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text })
        trackEvent('share_nudge_tapped', { mode: 'share' })
        return
      }
    } catch {
      return // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      trackEvent('share_nudge_tapped', { mode: 'copy' })
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby="nudge-title" className="card space-y-3">
      <h2 id="nudge-title" className="font-extrabold">Let {partnerLabel} know it's their turn</h2>
      <p className="text-sm text-ink-soft">A friendly note with the app link. Your question and answer stay private.</p>
      <a
        className="btn-primary flex items-center justify-center gap-2"
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('share_nudge_tapped', { mode: 'whatsapp' })}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
        </svg>
        Send on WhatsApp
      </a>
      <button type="button" className="btn-ghost w-full text-sm" onClick={other}>
        {copied ? 'Copied. Paste it wherever you two chat.' : 'Share another way'}
      </button>
    </section>
  )
}
