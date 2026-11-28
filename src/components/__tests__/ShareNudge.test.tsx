import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShareNudge } from '../ShareNudge'

describe('ShareNudge', () => {
  it('opens WhatsApp with a "your turn" note and the app link only', () => {
    render(<ShareNudge partnerLabel="Papa" />)
    expect(screen.getByRole('heading', { name: "Let Papa know it's their turn" })).toBeTruthy()
    const href = screen.getByRole('link', { name: /Send on WhatsApp/ }).getAttribute('href')!
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    const text = decodeURIComponent(href.split('text=')[1])
    expect(text).toContain('Your turn')
    expect(text).toContain(window.location.origin)
  })

  it('falls back to copying the note when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareNudge partnerLabel="Mama" game />)
    fireEvent.click(screen.getByRole('button', { name: 'Share another way' }))
    await screen.findByText(/Copied/)
    expect(writeText.mock.calls[0][0]).toContain('guessing game')
  })
})
