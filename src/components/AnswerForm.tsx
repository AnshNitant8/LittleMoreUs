import { useEffect, useId, useRef, useState } from 'react'
import { ANSWER_MAX } from '../domain/constants'
import { getDraft, saveDraft } from '../services/api'

/**
 * Private answer box: 500-character limit with a live counter, the sharing
 * notice and an explicit consent checkbox. Drafts are saved on this device
 * only, as the person types and when they leave.
 */
export function useAnswerDraft(draftKey: string) {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const latest = useRef('')
  useEffect(() => {
    let alive = true
    void getDraft(draftKey).then((r) => {
      if (!alive) return
      if (r.ok) {
        setText(r.data)
        latest.current = r.data
      }
      setLoaded(true)
    })
    return () => {
      alive = false
      void saveDraft(draftKey, latest.current)
    }
  }, [draftKey])
  useEffect(() => {
    if (!loaded) return
    latest.current = text
    const t = setTimeout(() => void saveDraft(draftKey, text), 600)
    return () => clearTimeout(t)
  }, [text, loaded, draftKey])
  const clear = () => {
    latest.current = ''
    setText('')
  }
  return { text, setText, loaded, clear }
}

export function AnswerFields({
  text,
  setText,
  disabled,
}: {
  text: string
  setText: (t: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const count = Array.from(text).length
  const over = count > ANSWER_MAX
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-answer`} className="mb-1 block font-bold">
          Your answer
        </label>
        <textarea
          id={`${id}-answer`}
          rows={5}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${id}-count ${id}-notice`}
          aria-invalid={over}
          className="w-full rounded-2xl border-2 border-line bg-white p-4 text-lg leading-relaxed focus:border-coral focus:outline-none"
          placeholder="A few words is plenty."
        />
        <p id={`${id}-count`} aria-live="polite" className={`text-right text-sm ${over ? 'font-bold text-coral' : 'text-ink-soft'}`}>
          {count} / {ANSWER_MAX}
        </p>
      </div>
      <p id={`${id}-notice`} className="rounded-2xl bg-cream-deep p-4 text-sm">
        Your partner will receive this exact same question; both answers will be used to create a shared story only after you both agree.
      </p>
    </div>
  )
}

/**
 * Consent tick box plus the send button. Lives in the sticky action bar so it is
 * always on screen next to the button; it was once hidden under the bar on tall screens.
 */
export function ConsentAndSend({
  text,
  consent,
  setConsent,
  disabled,
  sending,
  label,
  onSend,
}: {
  text: string
  consent: boolean
  setConsent: (c: boolean) => void
  disabled?: boolean
  sending: boolean
  label: string
  onSend: () => void
}) {
  const id = useId()
  const hasText = Array.from(text.trim()).length > 0
  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => setConsent(e.target.checked)}
          aria-describedby={`${id}-hint`}
          className="mt-0.5 h-6 w-6 shrink-0 accent-coral"
        />
        <span>I agree my answer can be used, together with my partner's, to create our shared story.</span>
      </label>
      <button type="button" className="btn-primary" disabled={!canSubmitAnswer(text, consent) || disabled} onClick={onSend}>
        {sending ? 'Sending…' : label}
      </button>
      <p id={`${id}-hint`} className="text-center text-xs text-ink-soft" aria-live="polite">
        {!hasText ? 'Write a few words to send.' : !consent ? 'Tick the box above to send.' : ''}
      </p>
    </>
  )
}

export function canSubmitAnswer(text: string, consent: boolean) {
  const n = Array.from(text.trim()).length
  return consent && n > 0 && Array.from(text).length <= ANSWER_MAX
}
