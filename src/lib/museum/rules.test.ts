import { describe, it, expect } from 'vitest'
import { requiredTier, draftProblems, daysLeft, emptyDraft, newExhibit, nextMedium, MEDIUM_SUGGESTIONS, FREE_EXHIBITS, MAX_EXHIBITS } from './rules'

const photo = new Blob(['x'], { type: 'image/jpeg' })
const withExhibits = (n: number) => ({ ...emptyDraft(), recipientName: 'Sam',
  exhibits: Array.from({ length: n }, (_, i) => ({ ...newExhibit(`e${i}`, photo), title: `T${i}` })) })

describe('requiredTier', () => {
  it('free up to the limit, full above', () => {
    expect(requiredTier(FREE_EXHIBITS)).toBe('free')
    expect(requiredTier(FREE_EXHIBITS + 1)).toBe('full')
  })
})

describe('draftProblems', () => {
  it('a complete draft has none', () => expect(draftProblems(withExhibits(2))).toEqual([]))
  it('flags missing name, photos, titles, too many', () => {
    const d = withExhibits(2); d.recipientName = ''; d.exhibits[0].photo = null; d.exhibits[1].title = ' '
    expect(draftProblems(d)).toEqual(['Add the name of the person this museum is for.', 'Exhibit 1 needs a photo.', 'Exhibit 2 needs a title.'])
    expect(draftProblems({ ...emptyDraft(), recipientName: 'Sam' })).toEqual(['Add at least one exhibit.'])
    expect(draftProblems(withExhibits(MAX_EXHIBITS + 1))).toContain(`A museum can hold up to ${MAX_EXHIBITS} exhibits.`)
  })
})

describe('daysLeft', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('null means forever', () => expect(daysLeft(null, now)).toBeNull())
  it('rounds partial days up and floors at 0', () => {
    expect(daysLeft('2026-10-03T13:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-10T12:00:00Z', now)).toBe(7)
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})

describe('nextMedium', () => {
  it('cycles through suggestions', () => {
    expect(nextMedium('')).toBe(MEDIUM_SUGGESTIONS[0])
    expect(nextMedium(MEDIUM_SUGGESTIONS[0])).toBe(MEDIUM_SUGGESTIONS[1])
    expect(nextMedium(MEDIUM_SUGGESTIONS[MEDIUM_SUGGESTIONS.length - 1])).toBe(MEDIUM_SUGGESTIONS[0])
  })
})
