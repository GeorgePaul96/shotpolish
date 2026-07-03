import { describe, it, expect, vi, afterEach } from 'vitest'
import { track, Events } from './analytics'

afterEach(() => { delete (globalThis as any).window })

describe('track', () => {
  it('is a no-op when plausible is absent', () => {
    expect(() => track('test_event', { a: 1 })).not.toThrow()
  })

  it('forwards name and props to window.plausible when present', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    track('test_event', { a: 1 })
    expect(spy).toHaveBeenCalledWith('test_event', { props: { a: 1 } })
  })
})

describe('Events', () => {
  it('remixExported reports the template id', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.remixExported('launch-indigo')
    expect(spy).toHaveBeenCalledWith('remix_export_completed', { props: { templateId: 'launch-indigo' } })
  })

  it('pricingTierClicked reports the tier', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.pricingTierClicked('ltd')
    expect(spy).toHaveBeenCalledWith('pricing_tier_clicked', { props: { tier: 'ltd' } })
  })
})
