import { describe, it, expect, vi, afterEach } from 'vitest'
import { track, Events } from './analytics'
import { phCapture } from './posthog'

vi.mock('./posthog', () => ({
  phCapture: vi.fn(),
  phIdentify: vi.fn(),
  phReset: vi.fn(),
  initPostHog: vi.fn(),
  isPostHogEnabled: () => false,
}))

afterEach(() => { delete (globalThis as any).window; vi.clearAllMocks() })

describe('track', () => {
  it('is a no-op (no throw) when both sinks are absent', () => {
    expect(() => track('test_event', { a: 1 })).not.toThrow()
  })

  it('forwards name and props to window.plausible when present', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    track('test_event', { a: 1 })
    expect(spy).toHaveBeenCalledWith('test_event', { props: { a: 1 } })
  })

  it('also forwards name and props to PostHog (dual-sink)', () => {
    track('test_event', { a: 1 })
    expect(phCapture).toHaveBeenCalledWith('test_event', { a: 1 })
  })

  it('sends to PostHog even when plausible is absent', () => {
    track('solo_event')
    expect(phCapture).toHaveBeenCalledWith('solo_event', undefined)
  })
})

describe('Events', () => {
  it('remixExported reports the template id to both sinks', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.remixExported('launch-indigo')
    expect(spy).toHaveBeenCalledWith('remix_export_completed', { props: { templateId: 'launch-indigo' } })
    expect(phCapture).toHaveBeenCalledWith('remix_export_completed', { templateId: 'launch-indigo' })
  })

  it('pricingTierClicked reports the tier', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.pricingTierClicked('ltd')
    expect(spy).toHaveBeenCalledWith('pricing_tier_clicked', { props: { tier: 'ltd' } })
    expect(phCapture).toHaveBeenCalledWith('pricing_tier_clicked', { tier: 'ltd' })
  })
})
