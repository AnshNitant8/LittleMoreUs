import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { SelectAll } from '../Onboarding'

function Harness({ initial }: { initial: string[] }) {
  const all = ['a', 'b', 'c']
  const [sel, setSel] = useState(initial)
  return (
    <>
      <SelectAll total={all.length} selected={sel.length} onChange={(on) => setSel(on ? all : [])} />
      <output>{sel.join(',')}</output>
    </>
  )
}

it('selects all, clears all, and shows a mixed state for a partial selection', async () => {
  render(<Harness initial={['a']} />)
  const box = screen.getByLabelText('Select all') as HTMLInputElement
  expect(box.indeterminate).toBe(true)
  expect(box).toHaveAttribute('aria-checked', 'mixed')
  await userEvent.click(box)
  expect(screen.getByRole('status')).toHaveTextContent('a,b,c')
  expect(box.checked).toBe(true)
  await userEvent.click(box)
  expect(screen.getByRole('status')).toHaveTextContent('')
  expect(box.checked).toBe(false)
})
