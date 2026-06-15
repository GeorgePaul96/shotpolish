import { describe, it, expect } from 'vitest'
import { isDeleteConfirmed, accountPlanView } from './account'

describe('isDeleteConfirmed', () => {
  const email = 'George@Gmail.com'
  it('false for empty input', () => { expect(isDeleteConfirmed('', email)).toBe(false) })
  it('false for a wrong value', () => { expect(isDeleteConfirmed('nope@x.com', email)).toBe(false) })
  it('true for an exact match', () => { expect(isDeleteConfirmed('George@Gmail.com', email)).toBe(true) })
  it('true ignoring case and surrounding whitespace', () => {
    expect(isDeleteConfirmed('  george@gmail.com ', email)).toBe(true)
  })
})

describe('accountPlanView', () => {
  it('free -> Free badge + upgrade cta', () => {
    expect(accountPlanView('free', true)).toEqual({ badgeLabel: 'Free', cta: 'upgrade' })
  })
  it('pro with portal -> Pro badge + manage', () => {
    expect(accountPlanView('pro', true)).toEqual({ badgeLabel: 'Pro', cta: 'manage' })
  })
  it('pro without portal -> Pro badge + none', () => {
    expect(accountPlanView('pro', false)).toEqual({ badgeLabel: 'Pro', cta: 'none' })
  })
  it('ltd with portal -> Lifetime badge + manage', () => {
    expect(accountPlanView('ltd', true)).toEqual({ badgeLabel: 'Lifetime', cta: 'manage' })
  })
  it('ltd without portal -> Lifetime badge + none', () => {
    expect(accountPlanView('ltd', false)).toEqual({ badgeLabel: 'Lifetime', cta: 'none' })
  })
})
