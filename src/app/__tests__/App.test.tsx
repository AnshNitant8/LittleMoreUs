import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { configureStorage, createMemoryAdapter } from '../../services/storage'

beforeEach(() => {
  configureStorage(createMemoryAdapter())
  window.location.hash = ''
})

describe('signed-out shell', () => {
  it('shows Welcome with both actions and no bottom nav', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Get Started' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('opens Prototype Controls and switches partner', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Open Prototype Controls/ }))
    const dialog = screen.getByRole('dialog', { name: 'Prototype Controls' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Partner B/ }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Partner B/ })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('button', { name: /Active user: Partner B/ })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Assumptions' }))
    expect(within(dialog).getByText(/Verify all numbers before launch/)).toBeInTheDocument()
  })
})

describe('full onboarding flow', () => {
  it('signs up with OTP and completes onboarding to Home', async () => {
    const u = userEvent.setup()
    render(<App />)
    await u.click(await screen.findByRole('button', { name: 'Get Started' }))
    await u.type(await screen.findByLabelText('Phone number or email'), 'priya@example.com')
    const send = screen.getByRole('button', { name: 'Send my code' })
    expect(send).toBeDisabled() // age gate
    await u.click(screen.getByLabelText('I am 18 or older'))
    await u.click(send)

    await u.type(await screen.findByLabelText('6-digit code'), '111111')
    await u.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/didn't match. 4 tries left/)).toBeInTheDocument()
    const otp = screen.getByLabelText('6-digit code')
    await u.clear(otp)
    await u.type(otp, '123456')
    await u.click(screen.getByRole('button', { name: 'Continue' }))

    // Stage
    expect(await screen.findByRole('heading', { name: 'Where are you in parenthood?' })).toBeInTheDocument()
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect(cont).toBeDisabled()
    await u.click(screen.getByLabelText('7–12 months'))
    await u.click(cont)

    // Family
    await u.type(await screen.findByLabelText('Your first name'), 'Priya')
    await u.click(screen.getByLabelText('Something else'))
    await u.type(screen.getByLabelText('Your label'), 'Amma')
    await u.click(screen.getByRole('button', { name: 'Continue' }))

    // Moments
    expect(await screen.findByRole('heading', { name: 'Choose your moments' })).toBeInTheDocument()
    await u.click(screen.getByLabelText(/Remember Us/))
    await u.click(screen.getByLabelText('A mix'))
    // Back keeps data, then forward again
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Your first name')).toHaveValue('Priya')
    await u.click(screen.getByRole('button', { name: 'Continue' }))
    await u.click(await screen.findByLabelText(/Remember Us/))
    await u.click(screen.getByLabelText('A mix'))
    await u.click(screen.getByRole('button', { name: 'Continue' }))

    // Notifications
    expect(await screen.findByRole('heading', { name: 'Gentle notifications' })).toBeInTheDocument()
    await u.click(screen.getByRole('switch', { name: /Pending reminders/ }))
    await u.click(screen.getByRole('button', { name: 'All set' }))

    expect(await screen.findByText('Hello, Priya')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})
