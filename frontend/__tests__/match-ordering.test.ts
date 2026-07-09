/**
 * compareMatchesChronologically is the single sort comparator shared by the
 * matches page and the home page's "next match" widget, so the schedule
 * can't sort differently between pages.
 *
 * Sorting by scheduledAt alone leaves ties — including two rows that turn
 * out to be duplicates of the same real fixture — in whatever order the
 * array/API happened to return them, which isn't guaranteed stable. This
 * verifies the id fallback makes the order fully deterministic.
 */
import { describe, it, expect } from 'vitest'
import { compareMatchesChronologically } from '../lib/utils'

describe('compareMatchesChronologically', () => {
  it('orders by scheduledAt ascending', () => {
    const early = { id: 'b', scheduledAt: '2026-07-09T17:00:00Z' }
    const late = { id: 'a', scheduledAt: '2026-07-10T17:00:00Z' }
    expect(compareMatchesChronologically(early, late)).toBeLessThan(0)
    expect(compareMatchesChronologically(late, early)).toBeGreaterThan(0)
  })

  it('falls back to id when scheduledAt ties', () => {
    const first = { id: 'aaa', scheduledAt: '2026-07-09T17:00:00Z' }
    const second = { id: 'bbb', scheduledAt: '2026-07-09T17:00:00Z' }
    expect(compareMatchesChronologically(first, second)).toBeLessThan(0)
    expect(compareMatchesChronologically(second, first)).toBeGreaterThan(0)
  })

  it('is stable and deterministic when sorting a list with a duplicate-style tie', () => {
    // Simulates the exact symptom: two rows for the same real match with
    // slightly different scheduledAt (one stale/estimated, one confirmed).
    const placeholder = { id: 'norway-eng-placeholder', scheduledAt: '2026-07-09T17:00:00Z' }
    const real = { id: 'norway-eng-real', scheduledAt: '2026-07-10T21:00:00Z' }
    const unrelated = { id: 'other-match', scheduledAt: '2026-07-09T21:00:00Z' }

    const sorted = [real, unrelated, placeholder].sort(compareMatchesChronologically)
    expect(sorted.map(m => m.id)).toEqual([
      'norway-eng-placeholder',
      'other-match',
      'norway-eng-real',
    ])
  })

  it('returns 0 only when both scheduledAt and id are identical', () => {
    const m = { id: 'x', scheduledAt: '2026-07-09T17:00:00Z' }
    expect(compareMatchesChronologically(m, { ...m })).toBe(0)
  })
})
