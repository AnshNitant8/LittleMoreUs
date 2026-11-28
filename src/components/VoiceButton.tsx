import { useEffect, useRef, useState } from 'react'
import { trackEvent } from '../services/productAnalytics'

// Voice typing with the browser's own speech-to-text (no app AI, no key).
// Words land in the answer box, where they can be edited before sending.

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const join = (a: string, b: string) => (!a ? b : !b ? a : /\s$/.test(a) ? a + b.trimStart() : `${a} ${b.trimStart()}`)

/** A mic button that adds spoken words to `text`. Hidden where the browser can't do it. */
export function VoiceButton({ text, setText, disabled }: { text: string; setText: (t: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const latest = useRef({ text, setText })
  useEffect(() => {
    latest.current = { text, setText }
  }, [text, setText])
  useEffect(() => () => rec.current?.abort(), [])

  const Ctor = recognitionCtor()
  if (!Ctor) return null

  const start = () => {
    setError(null)
    const r = new Ctor()
    r.lang = navigator.language || 'en-IN'
    r.continuous = true
    r.interimResults = true
    const base = latest.current.text
    let finals = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finals = join(finals, res[0].transcript)
        else interim = join(interim, res[0].transcript)
      }
      latest.current.setText(join(base, join(finals, interim)))
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Allow the microphone for this site to use voice typing.')
      else if (e.error === 'no-speech') setError("We didn't hear anything. Tap the mic and try again.")
      else if (e.error !== 'aborted') setError("Voice typing stopped. You can tap the mic again, or type instead.")
    }
    r.onend = () => {
      setListening(false)
      rec.current = null
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
      trackEvent('voice_typing_used')
    } catch {
      setError("Voice typing couldn't start. You can type instead.")
    }
  }

  const stop = () => rec.current?.stop()

  return (
    <div>
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-bold ${listening ? 'border-coral bg-coral text-white' : 'border-line bg-white text-ink'}`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
        </svg>
        {listening ? 'Stop' : 'Speak'}
      </button>
      {listening && <span role="status" className="ml-3 text-sm text-ink-soft">Listening… tap Stop when you're done.</span>}
      {error && <p role="alert" className="mt-1 text-sm text-coral">{error}</p>}
    </div>
  )
}
