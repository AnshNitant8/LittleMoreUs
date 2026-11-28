import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VoiceButton } from '../VoiceButton'

type Handler = ((e: unknown) => void) | null
let last: { onresult: Handler; onend: (() => void) | null; started: boolean } | null = null

class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: Handler = null
  onerror: Handler = null
  onend: (() => void) | null = null
  started = false
  constructor() {
    last = this
  }
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  abort() {}
}

function Box() {
  const [text, setText] = useState('We')
  return (
    <>
      <p data-testid="t">{text}</p>
      <VoiceButton text={text} setText={setText} />
    </>
  )
}

const results = (...r: [string, boolean][]) => ({ resultIndex: 0, results: r.map(([t, f]) => ({ isFinal: f, 0: { transcript: t } })) })

describe('voice typing', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    last = null
  })

  it('is hidden where the browser has no speech-to-text', () => {
    render(<Box />)
    expect(screen.queryByRole('button', { name: /speak/i })).toBeNull()
  })

  it('adds spoken words after what was typed, then stops', () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    render(<Box />)
    fireEvent.click(screen.getByRole('button', { name: /speak/i }))
    expect(last?.started).toBe(true)
    act(() => last!.onresult!(results(['danced in', false])))
    expect(screen.getByTestId('t').textContent).toBe('We danced in')
    act(() => last!.onresult!(results(['danced in the kitchen', true])))
    expect(screen.getByTestId('t').textContent).toBe('We danced in the kitchen')
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(screen.getByRole('button', { name: /speak/i })).toBeTruthy()
  })
})
