import { describe, expect, it } from 'vitest'
import { QUESTIONS } from '../../data/questions'
import { selectQuestion, type SelectionContext } from '../../domain/rules/selection'

const ctx = (coupleId: string, initiatorId = 'u1'): SelectionContext => ({
  questions: QUESTIONS,
  initiatorId,
  coupleId,
  householdAgeBand: '7_12',
  initiatorDepth: 'deeper',
  mutedCategories: [],
  history: [],
  openQuestionIds: [],
  lastIntensity: null,
  recentCategories: [],
  nowMs: Date.parse('2026-11-28T00:00:00Z'),
})

describe('each couple gets its own question order', () => {
  it('different couples mostly start on different questions', () => {
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => selectQuestion(ctx(`cpl_${i}`), { category: 'remember_us' })!.question_id))
    expect(firsts.size).toBeGreaterThan(2)
  })

  it('is the same for both partners and on every visit', () => {
    const a = selectQuestion(ctx('cpl_x', 'u1'))!.question_id
    expect(selectQuestion(ctx('cpl_x', 'u2'))!.question_id).toBe(a)
    expect(selectQuestion(ctx('cpl_x', 'u1'))!.question_id).toBe(a)
  })
})
