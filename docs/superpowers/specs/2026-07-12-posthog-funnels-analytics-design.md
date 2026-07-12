# PostHog Funnels & Retention — Privacy-Hardened Dual-Sink

> Design spec. Date: 2026-07-12. Phase: measurement (growth-plan exec #1).
> Status: approved, ready for implementation plan.

## Why

ShotPolish just shipped the sharpened Remix loop and is driving traffic, but the
only analytics sink is Plausible ([index.html](../../../index.html) +
[src/lib/analytics.ts](../../../src/lib/analytics.ts)), which counts events but
cannot express a multi-step funnel or user-level retention. The growth plan's #1
executive action is "instrument retention/funnel by segment — makes every other
call correct." This phase adds PostHog for funnels + retention **without breaking
the privacy positioning** that is the product's structural edge.

## Hard constraint: the privacy promise

The Privacy Policy ([LegalPages.tsx:30-47](../../../src/components/LegalPages.tsx))
currently states, verbatim: "We use Plausible Analytics, a privacy-focused
analytics tool… Plausible does not use cookies… We do not use tracking cookies.
We store a single anonymous identifier… Third-party services: We use Plausible
Analytics." PostHog's defaults (tracking cookies, autocapture, session replay)
would violate this. Every decision below preserves the promise: PostHog runs
**cookieless (localStorage), events-only, no autocapture, no session replay,
EU-hosted, no PII**, and the policy is updated to disclose it.

## Decisions (all locked with the user)

1. **PostHog Cloud EU**, privacy-hardened config. Update the Privacy Policy.
2. **Dual-sink**: keep Plausible; `track()` fans out to both Plausible and PostHog.
3. **Client funnel to checkout-start** (`remix_landed → export_completed →
   pricing_tier_clicked`) + retention. The Stripe webhook is NOT touched; paid
   conversions are read from Stripe directly.

## Architecture

One new module + an internal change to `analytics.ts`. Every existing `Events.*`
call site is unchanged.

| File | Change |
|---|---|
| `src/lib/posthog.ts` | **New.** Env-gated, privacy-hardened `initPostHog()` + wrappers `phCapture`, `phIdentify`, `phReset`. No-op when the key is unset. |
| `src/lib/analytics.ts` | `track()` also calls `phCapture` (dual-sink), preserving the never-throw, fire-and-forget contract. `Events` object unchanged. |
| `src/main.tsx` | Call `initPostHog()` at startup (before render). |
| `src/App.tsx` | Send a manual `$pageview` to PostHog on route change (retention signal). |
| `src/components/AuthProvider.tsx` | `phIdentify(user.id)` on login; `phReset()` on logout, inside the existing auth-state handling. |
| `src/components/LegalPages.tsx` | Privacy Policy: disclose PostHog; keep "no tracking cookies" accurate. |
| `API_MAP.md` | Document the two new env vars. |
| `package.json` | Add `posthog-js` dependency. |

### `src/lib/posthog.ts` (interface)

```ts
// Env-gated PostHog wrapper. No-ops entirely when the key is unset, so the app
// boots without analytics config (dev/test), mirroring src/lib/supabase.ts.
export function initPostHog(): void
export function phCapture(event: string, props?: Record<string, string | number | boolean>): void
export function phIdentify(distinctId: string): void
export function phReset(): void
export function isPostHogEnabled(): boolean   // key present AND init ran
```

Init config (privacy-hardened):

```ts
posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
  persistence: 'localStorage',        // NO cookies — honors "no tracking cookies"
  autocapture: false,                 // no automatic DOM event capture
  disable_session_recording: true,    // no session replay
  capture_pageview: false,            // we send $pageview manually on route change
  capture_pageleave: false,
  person_profiles: 'always',          // required so anonymous users flow through funnels
})
```

- `initPostHog()` returns immediately (no-op) if `VITE_PUBLIC_POSTHOG_KEY` is
  falsy. `isPostHogEnabled()` reflects that.
- `phCapture`/`phIdentify`/`phReset` each guard on enablement and swallow all
  errors (fire-and-forget; analytics must never crash the app).

### Dual-sink in `analytics.ts`

`track()` keeps its existing Plausible path and its DEV console log, and adds a
`phCapture(eventName, props)` call. The whole body stays wrapped so neither sink
can throw into the caller. No change to the `Events` map or any call site.

### Identity model

- Anonymous device `distinct_id` by default (PostHog-generated, localStorage).
- On Supabase login: `phIdentify(user.id)` — the Supabase UUID, **no email, no
  PII**.
- On logout: `phReset()` (new anonymous id).
- Wired inside `AuthProvider`'s existing auth-state change handling.

### Retention signal

`capture_pageview: false` + a manual `posthog.capture('$pageview')` on
react-router route change (in `App.tsx`). Pageviews are the broadest "user came
back" signal for retention, carry no PII, and stay cookieless.

## Events & funnels

All funnel events already exist and are unchanged:

| Step | Event | Fires at |
|---|---|---|
| 1 | `remix_landed` | editor remix landing ([EditorPage.tsx:729](../../../src/pages/EditorPage.tsx)) |
| 2 | `export_completed` | export finish (`Events.exportCompleted`) |
| 3 | `pricing_tier_clicked` | Stripe payment-link click ([PricingPage.tsx:68](../../../src/pages/PricingPage.tsx)) = checkout-start |

**No new app events.** The funnel and retention-cohort *definitions* are created
in the PostHog UI (documented below), not in code.

### PostHog UI setup (documented, done by user after ship)

Because the PostHog MCP connector is not authenticated in this session, the
dashboards are set up by hand in PostHog (~5 min). Document in the plan's final
step:
1. **Funnel:** `remix_landed` → `export_completed` → `pricing_tier_clicked`.
2. **Funnel (broad):** `$pageview` → `export_completed` → `pricing_tier_clicked`.
3. **Retention:** cohort on any event, weekly, first 8 weeks.

## Privacy Policy update (LegalPages.tsx)

- "Third-party services": add PostHog (product analytics — funnels & retention;
  cookieless; EU-hosted; no image data; no personal data beyond an anonymous id).
- Keep the "We do not use tracking cookies" line accurate — PostHog uses
  localStorage, not cookies. Note the anonymous identifier now covers both tools.

## Env vars

| Var | Meaning | Fallback |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog project API key. Unset ⇒ PostHog fully disabled (no-op). | none (disabled) |
| `VITE_PUBLIC_POSTHOG_HOST` | Ingestion host. | `https://eu.i.posthog.com` |

App boots and all tests pass without either var set.

## Testing

New `src/lib/posthog.test.ts` and additions to the analytics tests:
- `initPostHog()` is a no-op and `isPostHogEnabled()` is false when the key is
  unset (no throw, no global mutation).
- `phCapture`/`phIdentify`/`phReset` no-op safely when disabled.
- `track()` calls the Plausible sink AND `phCapture`, and never throws when
  `window.plausible` is undefined and PostHog is disabled.
- (analytics contract) an event with props reaches both sinks with the same
  name/props.

Mock PostHog by injecting a fake capture recorder (do not hit the network). Run
`npm test` and `npm run build`; both must pass.

## Out of scope (explicit)

- **Server-side paid attribution** — the Stripe webhook (`stripe-webhook` edge
  function) is NOT modified; its signature-verify + dedupe invariants stay
  untouched. Paid conversions are read from Stripe.
- **Creating the PostHog dashboards** — instrumentation ships here; the funnel
  and retention *views* are built in the PostHog UI from the doc above.
- **Autocapture, session replay, heatmaps** — deliberately disabled.
- **Segment-by-persona retention** — we don't capture persona; retention is by
  behavior/return, not declared segment.

## Success criteria

- With `VITE_PUBLIC_POSTHOG_KEY` set, the three funnel events + `$pageview` reach
  PostHog EU, cookielessly (verify: no PostHog cookies set; events visible in
  PostHog live view).
- With the key unset, the app behaves exactly as today (Plausible only), boots
  clean, all tests pass.
- Privacy Policy accurately discloses PostHog and remains truthful about cookies.
- `npm test` and `npm run build` pass.
