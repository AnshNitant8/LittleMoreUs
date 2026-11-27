import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { configureStorage, createMemoryAdapter } from '../../services/storage'

beforeEach(() => {
  configureStorage(createMemoryAdapter())
  window.location.hash = ''
})

describe('app shell', () => {
  it('renders bottom navigation and switches tabs', async () => {
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    for (const label of ['Home', 'Explore', 'Storybook', 'Profile']) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument()
    }
    await userEvent.click(within(nav).getByRole('button', { name: 'Explore' }))
    expect(await screen.findByRole('heading', { name: 'Explore', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Remember Us')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens Prototype Controls and switches partner', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Open Prototype Controls/ }))
    const dialog = screen.getByRole('dialog', { name: 'Prototype Controls' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Partner B/ }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Partner B/ })).toHaveAttribute('aria-pressed', 'true'))
    expect(within(dialog).getByRole('button', { name: /Partner B/ })).toHaveTextContent('● active')
    expect(screen.getByRole('button', { name: /Active user: Partner B/ })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Assumptions' }))
    expect(within(dialog).getByText(/Verify all numbers before launch/)).toBeInTheDocument()
  })
})
