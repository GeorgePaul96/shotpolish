# PostHog Funnels & Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostHog (Cloud EU, privacy-hardened, cookieless, events-only) as a second analytics sink alongside Plausible, so the remix→export→pricing funnel and retention are measurable — without breaking the "no tracking cookies / privacy-focused" promise.

**Architecture:** A new env-gated `src/lib/posthog.ts` wrapper (no-op when unconfigured, mirroring `src/lib/supabase.ts`). `analytics.ts` `track()` fans out to both Plausible and PostHog. A dedicated `PostHogPageview` component sends `$pageview` on route change (retention signal). `AuthProvider` identifies users by Supabase UUID (no PII). Privacy Policy updated to disclose PostHog.

**Tech Stack:** TypeScript, React 18, react-router-dom 7, posthog-js, Vitest.

## Global Constraints

- Analytics is fire-and-forget: it must NEVER throw into callers. Each sink is independently guarded in its own try/catch.
- PostHog config MUST be exactly: `api_host` = `VITE_PUBLIC_POSTHOG_HOST` or `'https://eu.i.posthog.com'`; `persistence: 'localStorage'` (NO cookies); `autocapture: false`; `disable_session_recording: true`; `capture_pageview: false`; `capture_pageleave: false`; `person_profiles: 'always'`.
- No PII to PostHog. `identify` uses the Supabase `user.id` (UUID) ONLY — never email or any other field.
- Env-gated: when `VITE_PUBLIC_POSTHOG_KEY` is unset, PostHog is fully no-op. The app must boot and ALL tests must pass with NO env vars set.
- Do NOT modify the Stripe webhook, any `supabase/functions/` edge code, or entitlement logic. This phase is client-side analytics only.
- The existing `Events` map and every `Events.*` call site stay UNCHANGED.
- Follow the existing `supabase.ts` env-gating pattern (read `import.meta.env.VITE_*`, cast `as string | undefined`, fall back gracefully).
- `npm test` and `npm run build` must pass. On Windows PowerShell node is not on PATH — prefix each call: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test`. A red "node.exe :" line is PowerShell wrapping a warning, not a failure — judge by the "Tests N passed" summary and the build's "✓ built" line.

---

### Task 1: PostHog wrapper module (env-gated, privacy-hardened)

**Files:**
- Modify: `package.json` (add `posthog-js` dependency)
- Create: `src/lib/posthog.ts`
- Test: `src/lib/posthog.test.ts`

**Interfaces:**
- Produces:
  - `initPostHog(): void` — inits PostHog with the privacy config; no-op if no key.
  - `phCapture(event: string, props?: Record<string, string | number | boolean>): void`
  - `phIdentify(distinctId: string): void`
  - `phReset(): void`
  - `isPostHogEnabled(): boolean`

- [ ] **Step 1: Install posthog-js**

Run (PowerShell): `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm install posthog-js`
Expected: `posthog-js` appears under `dependencies` in `package.json`; lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `src/lib/posthog.test.ts`:

```ts
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

describe('posthog wrapper — disabled (no key)', () => {
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

describe('posthog wrapper — enabled (key set)', () => {
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test -- posthog`
Expected: FAIL — `./posthog` does not exist yet ("Failed to resolve import" / module not found).

- [ ] **Step 4: Write the implementation**

Create `src/lib/posthog.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test -- posthog`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/posthog.ts src/lib/posthog.test.ts
git commit -m "feat(now): env-gated privacy-hardened PostHog wrapper

Cookieless (localStorage), autocapture/replay off, EU host, no-op when
VITE_PUBLIC_POSTHOG_KEY is unset. Mirrors the supabase.ts env-gating pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Dual-sink in analytics.ts

**Files:**
- Modify: `src/lib/analytics.ts` (the `track` function only)
- Test: `src/lib/analytics.test.ts` (extend)

**Interfaces:**
- Consumes: `phCapture` from `./posthog` (Task 1).
- Produces: no signature change — `track()` and `Events` are unchanged externally.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/lib/analytics.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test -- analytics`
Expected: FAIL — `expect(phCapture).toHaveBeenCalled...` fails because `track` does not call `phCapture` yet.

- [ ] **Step 3: Modify `track` in `src/lib/analytics.ts`**

Add the import at the top of the file (below the existing header comment, above `type Props`):

```ts
import { phCapture } from './posthog'
```

Replace the `track` function body with (keeps Plausible + DEV log, adds the PostHog sink, each independently guarded):

```ts
export function track(eventName: string, props?: Props): void {
  // Plausible sink
  try {
    if (typeof window !== 'undefined' && (window as any).plausible) {
      (window as any).plausible(eventName, { props })
    }
    if (import.meta.env.DEV) {
      console.log('[Analytics]', eventName, props ?? '')
    }
  } catch {
    // Never let analytics crash the app
  }

  // PostHog sink (no-op unless configured; guarded internally, but wrap anyway)
  try {
    phCapture(eventName, props)
  } catch {
    // Never let analytics crash the app
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test -- analytics`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/lib/analytics.test.ts
git commit -m "feat(now): dual-sink track() to Plausible + PostHog

Each sink is independently try/guarded so analytics still never throws.
Events map and all call sites unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Create the pageview component + wire init, mount, and auth identify/reset

> **Testing note:** This project's tests run in `environment: 'node'` with NO
> `@testing-library/react` / jsdom, and there are no component-render tests. Do
> NOT add a test framework. These are React wiring changes whose underlying
> units (`phCapture`, `phIdentify`, `phReset`, `initPostHog`) are already
> unit-tested in Tasks 1-2. This task is verified by `tsc --noEmit`, `npm run
> build`, the unchanged full suite, and the manual verification section.

**Files:**
- Create: `src/components/PostHogPageview.tsx`
- Modify: `src/main.tsx` (call `initPostHog()`)
- Modify: `src/App.tsx` (mount `<PostHogPageview />` inside the router)
- Modify: `src/components/AuthProvider.tsx` (identify/reset on auth state)

**Interfaces:**
- Consumes: `initPostHog`, `phIdentify`, `phReset` (Task 1); `phCapture` (Task 1); `useLocation` from `react-router-dom`.
- Produces: `PostHogPageview` (default export) — renders nothing; fires `$pageview` on route change.

- [ ] **Step 1: Create the pageview component — `src/components/PostHogPageview.tsx`**

```tsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { phCapture } from '../lib/posthog'

// Sends a manual $pageview to PostHog on each route change. We disable PostHog's
// built-in capture_pageview (SPA-unaware) and drive it from the router instead.
// Pageviews are the broadest retention signal; they carry no PII and no cookies.
export default function PostHogPageview() {
  const location = useLocation()
  useEffect(() => {
    phCapture('$pageview', { path: location.pathname })
  }, [location.pathname])
  return null
}
```

- [ ] **Step 2: Init PostHog at startup — `src/main.tsx`**

Add the import and call. Final file:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './components/AuthProvider'
import { initPostHog } from './lib/posthog'
import './index.css'
import App from './App'

initPostHog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
```

- [ ] **Step 3: Mount the pageview tracker — `src/App.tsx`**

Add the import (with the other component imports):

```tsx
import PostHogPageview from './components/PostHogPageview'
```

Then place `<PostHogPageview />` as the first child inside `<BrowserRouter>`, immediately before `<Routes>`:

```tsx
    <BrowserRouter>
      <PostHogPageview />
      <Routes>
```

- [ ] **Step 4: Identify/reset on auth state — `src/components/AuthProvider.tsx`**

Add the import (below the existing imports, e.g. after the `entitlements` import):

```ts
import { phIdentify, phReset } from '../lib/posthog'
```

The user-branch logic is duplicated in TWO places — the `getSession().then(...)` block (around lines 123-135) and the `onAuthStateChange(...)` block (around lines 137-149). In BOTH blocks, the shape is:

```ts
      if (activeUser) {
        migrateLocalToCloud(activeUser)
        fetchBrandKit(activeUser.id)
        fetchPlan(activeUser.id)
      } else {
        setBrandKit(null)
        setPlan('free')
      }
```

In BOTH blocks, add `phIdentify` to the `if` branch and `phReset` to the `else` branch so each becomes:

```ts
      if (activeUser) {
        phIdentify(activeUser.id)
        migrateLocalToCloud(activeUser)
        fetchBrandKit(activeUser.id)
        fetchPlan(activeUser.id)
      } else {
        phReset()
        setBrandKit(null)
        setPlan('free')
      }
```

(`phIdentify` is idempotent, so the two code paths firing on initial load is harmless. Both use `activeUser.id` — the Supabase UUID — never email.)

- [ ] **Step 5: Typecheck and build**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npx tsc --noEmit`
Expected: no NEW errors introduced by these files (there may be 2 pre-existing unrelated errors — note them if present; they must not be in `main.tsx`, `App.tsx`, `AuthProvider.tsx`, `PostHogPageview.tsx`, or `posthog.ts`).

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm run build`
Expected: exit 0, `✓ built`, `SPA fallback: copied`.

- [ ] **Step 6: Run the full suite (nothing regressed)**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test`
Expected: PASS — all files (Tasks 1-2 tests unchanged; no new tests in this task).

- [ ] **Step 7: Commit**

```bash
git add src/components/PostHogPageview.tsx src/main.tsx src/App.tsx src/components/AuthProvider.tsx
git commit -m "feat(now): PostHog init, SPA pageview tracking, and auth identify

initPostHog() at startup; <PostHogPageview/> in the router; identify by
Supabase user id (no PII) on login, reset on logout.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Privacy Policy, env docs, PostHog UI setup doc, final verification

> **Testing note:** The Privacy Policy is static JSX content and this project has
> no component-render test harness (see Task 3's note). Do NOT add one. The
> disclosure is verified by the manual verification step (read the rendered
> /privacy page) — consistent with how the codebase treats static copy.

**Files:**
- Modify: `src/components/LegalPages.tsx` (Privacy Policy disclosure)
- Modify: `API_MAP.md` (new env vars)
- Create: `docs/POSTHOG_SETUP.md` (funnels/cohorts to build in the PostHog UI)

**Interfaces:** none (content + docs).

- [ ] **Step 1: Update the Privacy Policy — `src/components/LegalPages.tsx`**

Read the current "Analytics" and "Third-party services" paragraphs (around lines 30-47). Make two edits:

(a) In the analytics paragraph, after the Plausible sentence, add a sentence disclosing PostHog. The paragraph should read (adjust surrounding JSX/whitespace to match the file's style):

```
We use Plausible Analytics and PostHog, privacy-focused product analytics
tools, to collect anonymous usage data: page views, referral sources, country,
device type, and product events (uploads, exports). PostHog is hosted in the EU,
uses no advertising or session-recording, and stores its identifier in your
browser's local storage — not cookies. Neither tool ever receives your image
data, and we never send them personal information beyond an anonymous identifier.
```

(b) In the "Third-party services" paragraph, add PostHog alongside Plausible:

```
We use Plausible Analytics (plausible.io) and PostHog (posthog.com) for
privacy-focused analytics. Their privacy policies are available at
plausible.io/privacy and posthog.com/privacy.
```

Keep the existing "We do not use tracking cookies. We store a single anonymous identifier…" line intact and truthful (PostHog uses localStorage, not cookies).

- [ ] **Step 2: Document the env vars — `API_MAP.md`**

In the env-vars list (near the `VITE_PUBLIC_URL` entry, ~line 43), add:

```
- `VITE_PUBLIC_POSTHOG_KEY` (PostHog project API key; unset ⇒ PostHog disabled/no-op — see `src/lib/posthog.ts`)
- `VITE_PUBLIC_POSTHOG_HOST` (PostHog ingestion host; falls back to `https://eu.i.posthog.com`)
```

- [ ] **Step 3: Write the PostHog UI setup doc — `docs/POSTHOG_SETUP.md`**

Create `docs/POSTHOG_SETUP.md`:

```markdown
# PostHog Setup (post-deploy, ~5 min in the PostHog UI)

The app ships the instrumentation; the funnel/retention *views* are built in the
PostHog UI. Prereqs: a PostHog Cloud **EU** project; set `VITE_PUBLIC_POSTHOG_KEY`
(and optionally `VITE_PUBLIC_POSTHOG_HOST`) in the deploy env.

## Verify ingestion
1. Deploy with the key set. Open the site, click through a page or two, do an export.
2. In PostHog → Activity/Live events, confirm `$pageview`, `export_completed`, etc.
   arrive. In browser devtools → Application → Cookies, confirm NO PostHog cookies
   (data is in Local Storage instead).

## Funnels to create (Product → Funnels)
1. **Remix loop → intent:** `remix_landed` → `export_completed` → `pricing_tier_clicked`.
2. **Broad → intent:** `$pageview` → `export_completed` → `pricing_tier_clicked`.

## Retention (Product → Retention)
- Returning on **any event**, weekly, first 8 weeks.

## Notes
- Paid conversion is intentionally NOT a client event — read paid counts from Stripe.
- Autocapture, session replay, and heatmaps are disabled by design.
```

- [ ] **Step 4: Final full verification**

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm test`
Expected: PASS — all files.

Run: `$env:Path = "C:\Program Files\nodejs;$env:Path"; npm run build`
Expected: exit 0, `✓ built`, `SPA fallback: copied`.

- [ ] **Step 5: Commit**

```bash
git add src/components/LegalPages.tsx API_MAP.md docs/POSTHOG_SETUP.md
git commit -m "docs(now): disclose PostHog in privacy policy; env + UI setup docs

Privacy Policy names PostHog (EU, localStorage not cookies, no image data,
no PII); documents the two env vars and the funnels/retention to build in PostHog.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification (after all tasks)

Unit tests mock PostHog; they do not prove real ingestion. Before relying on data:

1. **Disabled path (default, no key):** `npm run dev` with NO PostHog env var. App boots, Plausible still works, zero console errors, no network calls to posthog. (Confirms the env-gate.)
2. **Enabled path:** set `VITE_PUBLIC_POSTHOG_KEY` (+ EU host) in `.env.local`, `npm run dev`. Navigate between routes and do an export. In PostHog Live events, confirm `$pageview` and `export_completed` arrive. In devtools → Application, confirm the identifier is in **Local Storage**, and there are **no PostHog cookies**.
3. **Identify:** sign in (if Supabase configured); confirm the PostHog person is identified by the Supabase UUID and no email/PII appears on the event/person properties.

## Self-review notes (author)

- **Spec coverage:** wrapper + env-gate (Task 1), dual-sink (Task 2), pageview/retention component + init + identify wiring (Task 3), privacy-policy disclosure + env docs + UI setup doc (Task 4). Out-of-scope items (Stripe webhook, dashboard creation, autocapture/replay) are respected — no task touches them.
- **Testing convention:** Tasks 1-2 are TDD with real pure-logic tests (node env, matching existing `analytics.test.ts`). Task 3 (React wiring) and Task 4 (static privacy copy) are verified by typecheck + build + manual verification — the project has no jsdom/RTL harness and this plan deliberately does not add one.
- **Type/name consistency:** `phCapture`/`phIdentify`/`phReset`/`initPostHog`/`isPostHogEnabled` used identically across Tasks 1-3; PostHog config object is identical in the implementation and the Task 1 test assertion.
- **No placeholders:** every code step shows complete code; every run step shows the exact command and expected result.
