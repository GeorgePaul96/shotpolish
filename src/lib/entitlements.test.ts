import { describe, it, expect } from 'vitest'
import { isPaid, hasFeature, renderOptionsFor, type Plan } from './entitlements'

describe('isPaid', () => {
  it('free is not paid', () => { expect(isPaid('free')).toBe(false) })
  it('pro is paid', () => { expect(isPaid('pro')).toBe(true) })
  it('ltd is paid', () => { expect(isPaid('ltd')).toBe(true) })
})

describe('hasFeature', () => {
  const cases: [Plan, boolean][] = [['free', false], ['pro', true], ['ltd', true]]
  for (const [plan, expected] of cases) {
    it(`${plan} watermark_removal -> ${expected}`, () => {
      expect(hasFeature(plan, 'watermark_removal')).toBe(expected)
    })
    it(`${plan} scheduled_publishing -> ${expected}`, () => {
      expect(hasFeature(plan, 'scheduled_publishing')).toBe(expected)
    })
  }
})

describe('renderOptionsFor', () => {
  it('free keeps the watermark', () => {
    expect(renderOptionsFor(false)).toEqual({ watermark: true })
  })
  it('pro removes the watermark', () => {
    expect(renderOptionsFor(true)).toEqual({ watermark: false })
  })
})
