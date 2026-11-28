import { useState } from 'react'
import { trackEvent } from '../services/productAnalytics'

/**
 * "Know other new parents?": shares the app on WhatsApp with a warm note and
 * the homepage link. Never includes anything the couple wrote.
 */
export function ReferFriend({ from }: { from: 'profile' | 'story' | 'storybook' }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/`
  const text = `We've been using A Little More Us since the baby came. It's one small question a day for the two of you, and your answers become a little story. Thought you two might like it 💛 ${url}`

  const other = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text })
        trackEvent('referral_shared', { mode: 'share', source: from })
        return
      }
    } catch {
      return // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      trackEvent('referral_shared', { mode: 'copy', source: from })
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-labelledby={`refer-title-${from}`} className="card space-y-3">
      <h2 id={`refer-title-${from}`} className="font-extrabold">Know other new parents?</h2>
      <p className="text-sm text-ink-soft">Share A Little More Us with them. Only the app link is sent, never your answers or stories.</p>
      <a
        className="btn-secondary flex items-center justify-center gap-2"
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('referral_shared', { mode: 'whatsapp', source: from })}
      >
        Share on WhatsApp
      </a>
      <button type="button" className="btn-ghost w-full text-sm" onClick={other}>
        {copied ? 'Copied. Paste it wherever you like.' : 'Share another way'}
      </button>
    </section>
  )
}
