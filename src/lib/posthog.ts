// Env-gated PostHog wrapper. No-ops entirely when VITE_PUBLIC_POSTHOG_KEY is
// unset, so the app boots without analytics config (dev/test/prod-without-key),
// mirroring src/lib/supabase.ts. Privacy-hardened: cookieless (localStorage),
// no autocapture, no session replay — honors the "no tracking cookies" promise.
import posthog from 'posthog-js'

let enabled = false

export function isPostHogEnabled(): boolean {
  return enabled
}

export function initPostHog(): void {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined
  const host = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'
  if (!key) return
  try {
    posthog.init(key, {
      api_host: host,
      persistence: 'localStorage',
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: false,
      capture_pageleave: false,
      person_profiles: 'always',
    })
    enabled = true
  } catch {
    enabled = false
  }
}

export function phCapture(event: string, props?: Record<string, string | number | boolean>): void {
  if (!enabled) return
  try { posthog.capture(event, props) } catch { /* fire-and-forget */ }
}

export function phIdentify(distinctId: string): void {
  if (!enabled) return
  try { posthog.identify(distinctId) } catch { /* fire-and-forget */ }
}

export function phReset(): void {
  if (!enabled) return
  try { posthog.reset() } catch { /* fire-and-forget */ }
}
