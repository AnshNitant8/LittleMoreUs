import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import App from '../App'
import { configureStorage, createMemoryAdapter, readDb } from '../../services/storage'
import { createInteraction, respondToInteraction, switchUser } from '../../services/api'
import { QUESTIONS } from '../../data/questions'
import { k, pairedCouple } from '../../test/helpers'

beforeEach(() => {
  configureStorage(createMemoryAdapter())
  window.location.hash = ''
})

it('keeps the thanks screen after reporting, although the story is now hidden for the reporter', async () => {
  await pairedCouple()
  const q = QUESTIONS.find((x) => x.story_intent === 'memory')!
  const c = await createInteraction({ question_id: q.question_id, answer: 'Dancing', consent: true, idempotencyKey: k() })
  if (!c.ok) throw new Error(c.error.message)
  await switchUser('B')
  await respondToInteraction({ interaction_id: c.data.interaction_id, answer: 'Rain', consent: true, idempotencyKey: k() })
  await new Promise((r) => setTimeout(r, 20))
  const story = readDb().stories[0]
  window.location.hash = `#/story/${story.story_id}`

  const u = userEvent.setup()
  render(<App />)
  await u.click(await screen.findByRole('button', { name: "Something doesn't feel right" }))
  await u.click(screen.getByLabelText('Inaccurate'))
  await u.click(screen.getByRole('button', { name: 'Report' }))
  expect(await screen.findByRole('heading', { name: 'Thanks for telling us' })).toBeInTheDocument()
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.getByRole('heading', { name: 'Thanks for telling us' })).toBeInTheDocument()
  expect(screen.queryByText("That didn't quite work.")).not.toBeInTheDocument()
})
