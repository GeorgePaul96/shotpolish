import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the posthog-js default export; assert our wrapper forwards to it.
vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('posthog wrapper, disabled (no key)', () => {
  it('initPostHog is a no-op and isPostHogEnabled stays false', async () => {
    const posthog = (await import('posthog-js')).default
    const mod = await import('./posthog')
    expect(() => mod.initPostHog()).not.toThrow()
    expect(mod.isPostHogEnabled()).toBe(false)
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it('phCapture/phIdentify/phReset are safe no-ops when disabled', async () => {
    const posthog = (await import('posthog-js')).default
    const mod = await import('./posthog')
    mod.initPostHog()
    expect(() => { mod.phCapture('e', { a: 1 }); mod.phIdentify('u'); mod.phReset() }).not.toThrow()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.reset).not.toHaveBeenCalled()
  })
})

describe('posthog wrapper, enabled (key set)', () => {
  beforeEach(() => { vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_test_key') })

  it('initPostHog inits with the privacy-hardened, cookieless config', async () => {
    const posthog = (await import('posthog-js')).default
    const mod = await import('./posthog')
    mod.initPostHog()
    expect(mod.isPostHogEnabled()).toBe(true)
    expect(posthog.init).toHaveBeenCalledWith('phc_test_key', {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'localStorage',
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: false,
      capture_pageleave: false,
      person_profiles: 'always',
    })
  })

  it('honors a custom VITE_PUBLIC_POSTHOG_HOST', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://ph.example.com')
    const posthog = (await import('posthog-js')).default
    const mod = await import('./posthog')
    mod.initPostHog()
    expect(posthog.init).toHaveBeenCalledWith('phc_test_key', expect.objectContaining({ api_host: 'https://ph.example.com' }))
  })

  it('forwards capture/identify/reset to posthog-js once enabled', async () => {
    const posthog = (await import('posthog-js')).default
    const mod = await import('./posthog')
    mod.initPostHog()
    mod.phCapture('remix_landed', { templateId: 'launch-indigo' })
    mod.phIdentify('user-uuid-123')
    mod.phReset()
    expect(posthog.capture).toHaveBeenCalledWith('remix_landed', { templateId: 'launch-indigo' })
    expect(posthog.identify).toHaveBeenCalledWith('user-uuid-123')
    expect(posthog.reset).toHaveBeenCalled()
  })
})
