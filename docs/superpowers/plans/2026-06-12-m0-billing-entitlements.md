# M0 Billing & Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the paid layer on top of the existing Supabase backend — a `plan` per profile, a Stripe webhook that sets it, client entitlement helpers, an upgrade gate, a pricing page, and wire M1's watermark flag to Free-vs-Pro.

**Architecture:** Additive. A migration adds `plan` columns + a `stripe_events` idempotency table. `AuthProvider` becomes the single source of truth for `plan`. Pure `entitlements.ts` drives a `useEntitlement()` hook, an `UpgradeGate`, and the editor's `{ watermark: !isPro }` wiring. A Stripe Edge Function (Deno) verifies + dedupes events and updates profiles; its decision logic is a pure, vitest-tested `mapStripeEvent`. Everything degrades gracefully without keys (dummy Supabase client, disabled pricing buttons).

**Tech Stack:** React 18 · Vite · TypeScript · vitest (node env) · Supabase (Postgres + Auth + Edge Functions/Deno) · Stripe Payment Links.

---

## Important context for the implementer

- The Supabase backend already exists. `src/lib/supabase.ts` exports a `supabase` client with an env+dummy fallback. `src/components/AuthProvider.tsx` exposes `{ user, loading, brandKit, signOut }` via `useAuth()` and already fetches brand-kit data on auth using `supabase.from('brand_kits').select(...)`. Follow that exact pattern when adding the `plan` fetch.
- vitest runs in the `node` environment (no DOM). Write tests ONLY for pure modules (`entitlements.ts`, `mapStripeEvent.ts`). React components and hooks are verified by `npx tsc --noEmit` + `npm run build`, NOT by render tests (we are not adding jsdom in M0).
- The watermark is already an opt-out flag from M1: `renderComposition(ctx, img, theme, doc, L, motionProgress?, opts?: { watermark?: boolean })`, default on. The render path is `src/hooks/useCompositionCanvas.ts`, which calls `renderComposition` at line 71 (live preview) and line 148 (export). The editor calls the hook once at `EditorPage.tsx:767`.
- A known pre-existing `tsc` error exists: `TS7016` for `gifenc` in `src/lib/gifEncoder.ts` (no type declarations). It is acceptable and unrelated. After each task, `npx tsc --noEmit` should report NO errors other than that one.

---

## File Structure

- `supabase/migrations/0001_profiles_plan.sql` — **new.** Plan columns + `stripe_events` table.
- `supabase/schema.sql` — **modify.** Mirror the same columns/table so fresh setups match.
- `src/lib/entitlements.ts` — **new.** Pure plan/feature logic + `renderOptionsFor`.
- `src/lib/entitlements.test.ts` — **new.** Unit tests.
- `src/components/AuthProvider.tsx` — **modify.** Expose `plan` on context.
- `src/hooks/useEntitlement.ts` — **new.** `{ plan, isPro, isLoading, openPortal }`.
- `src/hooks/useCompositionCanvas.ts` — **modify.** Add `watermark` param, thread to both `renderComposition` calls.
- `src/pages/EditorPage.tsx` — **modify.** Pass `!isPro` into the hook.
- `src/components/UpgradeGate.tsx` — **new.** Entitlement gate component.
- `src/pages/PricingPage.tsx` — **new.** Payment Link pricing page.
- `src/App.tsx` — **modify.** Add `/pricing` route.
- `supabase/functions/_shared/mapStripeEvent.ts` — **new.** Pure event→plan mapper.
- `supabase/functions/_shared/mapStripeEvent.test.ts` — **new.** Unit tests.
- `supabase/functions/stripe-webhook/index.ts` — **new.** Deno webhook shell.

---

## Task 1: Data model — plan columns + idempotency table

**Files:**
- Create: `supabase/migrations/0001_profiles_plan.sql`
- Modify: `supabase/schema.sql`

No automated test (pure SQL; cannot run without a live DB). Verification is that the SQL is valid and idempotent (`IF NOT EXISTS`).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0001_profiles_plan.sql`:

```sql
-- M0: Billing & Entitlements — add plan columns to profiles + webhook idempotency.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';      -- free | pro | ltd
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltd_seat INT;

-- Every processed Stripe event id is recorded once so re-deliveries are no-ops.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Mirror columns into schema.sql**

In `supabase/schema.sql`, find the `CREATE TABLE profiles (...)` block. Immediately AFTER that statement (after its closing `);`, before the `-- Enable RLS for profiles` line), add:

```sql
-- M0 billing columns (also applied via migrations/0001_profiles_plan.sql)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';      -- free | pro | ltd
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltd_seat INT;
```

Then at the very END of `supabase/schema.sql`, append:

```sql
-- Stripe webhook idempotency (written only by the service-role webhook).
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_profiles_plan.sql supabase/schema.sql
git commit -m "feat(M0): add plan columns to profiles + stripe_events idempotency table"
```

---

## Task 2: Pure entitlement logic

**Files:**
- Create: `src/lib/entitlements.ts`
- Create: `src/lib/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/entitlements.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/entitlements.test.ts`
Expected: FAIL — cannot find module `./entitlements`.

- [ ] **Step 3: Implement**

Create `src/lib/entitlements.ts`:

```ts
// Pure entitlement logic — no React, no Supabase. Single source of the
// plan→feature mapping used by the hook, the upgrade gate, and the editor.

export type Plan = 'free' | 'pro' | 'ltd'
export type Feature = 'watermark_removal' | 'scheduled_publishing'

/** Paid plans get every gated feature. */
export function isPaid(plan: Plan): boolean {
  return plan === 'pro' || plan === 'ltd'
}

/** Currently every gated feature is unlocked by any paid plan. */
export function hasFeature(plan: Plan, _feature: Feature): boolean {
  return isPaid(plan)
}

/** RenderOptions for the canvas: free users get the watermark, paid users don't. */
export function renderOptionsFor(isPro: boolean): { watermark: boolean } {
  return { watermark: !isPro }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/entitlements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entitlements.ts src/lib/entitlements.test.ts
git commit -m "feat(M0): pure entitlements logic (isPaid, hasFeature, renderOptionsFor)"
```

---

## Task 3: Expose `plan` through AuthProvider

**Files:**
- Modify: `src/components/AuthProvider.tsx`

No unit test (React + Supabase IO). Verify with `npx tsc --noEmit`.

- [ ] **Step 1: Import the Plan type and extend the context type**

In `src/components/AuthProvider.tsx`, add to the imports at the top:

```ts
import type { Plan } from '../lib/entitlements'
```

Change the `AuthContextType` interface from:

```ts
interface AuthContextType {
  user: User | null
  loading: boolean
  brandKit: any | null
  signOut: () => Promise<void>
}
```

to:

```ts
interface AuthContextType {
  user: User | null
  loading: boolean
  plan: Plan
  brandKit: any | null
  signOut: () => Promise<void>
}
```

And update the `createContext` default to include `plan: 'free'`:

```ts
const AuthContext = createContext<AuthContextType>({ user: null, loading: true, plan: 'free', brandKit: null, signOut: async () => {} })
```

- [ ] **Step 2: Add plan state and a fetch helper**

Inside `AuthProvider`, next to `const [brandKit, setBrandKit] = useState<any | null>(null)`, add:

```ts
  const [plan, setPlan] = useState<Plan>('free')
```

Inside the `useEffect`, next to the existing `fetchBrandKit` function, add a `fetchPlan` helper (mirror the brand-kit fetch pattern):

```ts
    const fetchPlan = async (uid: string) => {
      const { data } = await supabase.from('profiles').select('plan').eq('id', uid).single()
      const p = data?.plan
      setPlan(p === 'pro' || p === 'ltd' ? p : 'free')
    }
```

- [ ] **Step 3: Call fetchPlan on session load and auth change; reset on sign-out**

In the SAME `useEffect`, there are two places that handle an active user (the `getSession().then(...)` block and the `onAuthStateChange(...)` block). In BOTH, where you see:

```ts
      if (activeUser) {
        migrateLocalToCloud(activeUser)
        fetchBrandKit(activeUser.id)
      } else {
        setBrandKit(null)
      }
```

change them to:

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

- [ ] **Step 4: Provide plan on the context**

Change the provider value from:

```tsx
    <AuthContext.Provider value={{ user, loading, brandKit, signOut }}>
```

to:

```tsx
    <AuthContext.Provider value={{ user, loading, plan, brandKit, signOut }}>
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`.

- [ ] **Step 6: Commit**

```bash
git add src/components/AuthProvider.tsx
git commit -m "feat(M0): expose profile plan through AuthProvider"
```

---

## Task 4: useEntitlement hook

**Files:**
- Create: `src/hooks/useEntitlement.ts`

No unit test (React hook + env). Verify with `npx tsc --noEmit`.

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useEntitlement.ts`:

```ts
import { useAuth } from '../components/AuthProvider'
import { isPaid, type Plan } from '../lib/entitlements'

export interface Entitlement {
  plan: Plan
  isPro: boolean
  isLoading: boolean
  openPortal: () => void
}

/** Reads the current plan from AuthProvider and exposes entitlement helpers. */
export function useEntitlement(): Entitlement {
  const { plan, loading } = useAuth()
  const openPortal = () => {
    const url = import.meta.env.VITE_STRIPE_PORTAL_URL as string | undefined
    if (!url) {
      console.warn('[useEntitlement] VITE_STRIPE_PORTAL_URL is not set; cannot open portal.')
      return
    }
    window.open(url, '_blank', 'noopener')
  }
  return { plan, isPro: isPaid(plan), isLoading: loading, openPortal }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useEntitlement.ts
git commit -m "feat(M0): useEntitlement hook (plan, isPro, openPortal)"
```

---

## Task 5: Wire the watermark to entitlement

**Files:**
- Modify: `src/hooks/useCompositionCanvas.ts`
- Modify: `src/pages/EditorPage.tsx`

No new unit test (the logic — `renderOptionsFor` — is already tested in Task 2). Verify with `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 1: Add a `watermark` param to the canvas hook**

In `src/hooks/useCompositionCanvas.ts`, change the function signature from:

```ts
export function useCompositionCanvas(
  doc: CompositionDocument,
  canvasRef: RefObject<HTMLCanvasElement>,
  motionProgress: number = 1.0 // Optional reveal animation timeline progress (0.0 to 1.0)
) {
```

to:

```ts
export function useCompositionCanvas(
  doc: CompositionDocument,
  canvasRef: RefObject<HTMLCanvasElement>,
  motionProgress: number = 1.0, // Optional reveal animation timeline progress (0.0 to 1.0)
  watermark: boolean = true     // false for entitled (Pro/LTD) users — drops the canvas watermark
) {
```

- [ ] **Step 2: Keep the flag in a ref and pass it to both render calls**

In the same file, just after the existing:

```ts
  const progressRef = useRef(motionProgress)
  progressRef.current = motionProgress
```

add:

```ts
  const watermarkRef = useRef(watermark)
  watermarkRef.current = watermark
```

Change the live-preview render call (currently `renderComposition(ctx, img, theme, currentDoc, L, progressRef.current)`) to:

```ts
    renderComposition(ctx, img, theme, currentDoc, L, progressRef.current, { watermark: watermarkRef.current })
```

Change the export render call (currently `renderComposition(ctx, img, theme, docCopy, L, activeProgress)`) to:

```ts
    renderComposition(ctx, img, theme, docCopy, L, activeProgress, { watermark: watermarkRef.current })
```

- [ ] **Step 3: Pass `!isPro` from the editor**

In `src/pages/EditorPage.tsx`, add the import near the other hook imports (e.g. after the `useCompositionCanvas` import on line 4):

```ts
import { useEntitlement } from '../hooks/useEntitlement'
```

Find the hook call at line 767:

```ts
  const { isRendering, exportImage } = useCompositionCanvas(compositionDoc, canvasRef, motionProgress)
```

Immediately BEFORE it, read entitlement:

```ts
  const { isPro } = useEntitlement()
```

And change the hook call to pass the watermark flag:

```ts
  const { isRendering, exportImage } = useCompositionCanvas(compositionDoc, canvasRef, motionProgress, !isPro)
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`.

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositionCanvas.ts src/pages/EditorPage.tsx
git commit -m "feat(M0): drop watermark for Pro users in editor render + export"
```

---

## Task 6: UpgradeGate component

**Files:**
- Create: `src/components/UpgradeGate.tsx`

No render test (branch logic covered by `entitlements.test.ts`). Verify with `npx tsc --noEmit`.

- [ ] **Step 1: Implement**

Create `src/components/UpgradeGate.tsx`:

```tsx
import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { hasFeature, type Feature } from '../lib/entitlements'

interface UpgradeGateProps {
  feature: Feature
  children: ReactNode
  /** Optional custom upsell; defaults to a small card linking to /pricing. */
  fallback?: ReactNode
}

/** Renders children when the current plan unlocks `feature`, else an upsell. */
export function UpgradeGate({ feature, children, fallback }: UpgradeGateProps) {
  const { plan } = useAuth()
  if (hasFeature(plan, feature)) return <>{children}</>
  if (fallback) return <>{fallback}</>
  return (
    <div className="rounded-2xl border border-[#E5E7EC] bg-white p-5 text-center shadow-card">
      <p className="text-sm font-medium text-[#374151]">This is a Pro feature</p>
      <p className="mt-1 text-xs text-[#6B7280]">Upgrade to unlock it.</p>
      <Link to="/pricing" className="btn-primary mt-3 inline-flex px-4 py-2 text-sm">
        See plans
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`.

- [ ] **Step 3: Commit**

```bash
git add src/components/UpgradeGate.tsx
git commit -m "feat(M0): UpgradeGate component gating Pro features"
```

---

## Task 7: PricingPage + route

**Files:**
- Create: `src/pages/PricingPage.tsx`
- Modify: `src/App.tsx`

No unit test (UI). Verify with `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 1: Implement the pricing page**

Create `src/pages/PricingPage.tsx`. Placeholder labels/prices live in one `TIERS` array (real numbers deferred). Each tier's Payment Link comes from env; a missing link disables that button rather than rendering a dead link. Signed-out users are sent to sign in (the existing `AuthModal` is opened via a custom event the Navbar/modal already listens for is NOT assumed — instead we link to `/` with a prompt). Keep it self-contained:

```tsx
import { useAuth } from '../components/AuthProvider'
import { Navbar } from '../components/Navbar'

interface Tier {
  id: 'monthly' | 'annual' | 'ltd'
  name: string
  priceLabel: string      // placeholder — real pricing deferred
  blurb: string
  envKey: string          // Vite env var holding the Stripe Payment Link URL
}

const TIERS: Tier[] = [
  { id: 'monthly', name: 'Pro Monthly', priceLabel: '$— / mo',  blurb: 'Everything in Pro, billed monthly.', envKey: 'VITE_STRIPE_PAYMENT_LINK_MONTHLY' },
  { id: 'annual',  name: 'Pro Annual',  priceLabel: '$— / yr',  blurb: 'Two months free, billed yearly.',     envKey: 'VITE_STRIPE_PAYMENT_LINK_ANNUAL'  },
  { id: 'ltd',     name: 'Lifetime',    priceLabel: '$— once',  blurb: 'Pay once, founders pricing.',          envKey: 'VITE_STRIPE_PAYMENT_LINK_LTD'     },
]

const FEATURES = [
  'Watermark-free exports',
  'Scheduled publishing (coming soon)',
  'Priority support',
]

function paymentUrl(tier: Tier, userId: string | null, email?: string): string | null {
  const base = import.meta.env[tier.envKey] as string | undefined
  if (!base) return null
  if (!userId) return base
  const sep = base.includes('?') ? '&' : '?'
  const params = new URLSearchParams({ client_reference_id: userId })
  if (email) params.set('prefilled_email', email)
  return `${base}${sep}${params.toString()}`
}

export function PricingPage() {
  const { user } = useAuth()

  return (
    <main className="min-h-screen bg-[#F5F6F8] text-[#111827]">
      <Navbar />
      <section className="mx-auto max-w-5xl px-4 pt-28 pb-20">
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Simple, founder-friendly pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[#6B7280]">
          Free forever for watermarked exports. Upgrade for clean exports and the publishing pipeline.
        </p>

        <ul className="mx-auto mt-8 flex max-w-md flex-col gap-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-[#374151]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {f}
            </li>
          ))}
        </ul>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map(tier => {
            const url = paymentUrl(tier, user?.id ?? null, user?.email ?? undefined)
            const configured = url !== null
            return (
              <div key={tier.id} className="flex flex-col rounded-2xl border border-[#E5E7EC] bg-white p-6 shadow-card">
                <h2 className="text-lg font-semibold">{tier.name}</h2>
                <p className="mt-1 text-2xl font-bold tracking-tight">{tier.priceLabel}</p>
                <p className="mt-2 text-sm text-[#6B7280]">{tier.blurb}</p>
                <div className="flex-1" />
                {!user ? (
                  <a href="/" className="btn-ghost mt-5 px-4 py-2 text-center text-sm">Sign in to upgrade</a>
                ) : configured ? (
                  <a href={url!} className="btn-primary mt-5 px-4 py-2 text-center text-sm">Choose {tier.name}</a>
                ) : (
                  <button disabled className="mt-5 cursor-not-allowed rounded-xl bg-[#F0F1F4] px-4 py-2 text-center text-sm text-[#9CA3AF]">
                    Billing not configured yet
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import next to the other page imports:

```tsx
import { PricingPage } from './pages/PricingPage'
```

Add the route inside `<Routes>` (e.g. after the `/settings/brand` route):

```tsx
        <Route path="/pricing" element={<PricingPage />} />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PricingPage.tsx src/App.tsx
git commit -m "feat(M0): pricing page with Payment Link tiers + /pricing route"
```

---

## Task 8: Stripe webhook (pure mapper + Deno shell)

**Files:**
- Create: `supabase/functions/_shared/mapStripeEvent.ts`
- Create: `supabase/functions/_shared/mapStripeEvent.test.ts`
- Create: `supabase/functions/stripe-webhook/index.ts`

The pure mapper is vitest-tested. The Deno `index.ts` shell is NOT run under vitest (Deno-only imports); it is a thin IO wrapper around the tested mapper.

- [ ] **Step 1: Write the failing test for the pure mapper**

Create `supabase/functions/_shared/mapStripeEvent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapStripeEvent, type StripeEventLike } from './mapStripeEvent'

const checkout = (overrides: Record<string, any> = {}): StripeEventLike => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: { client_reference_id: 'user-123', customer: 'cus_1', metadata: { plan: 'pro' }, ...overrides } },
})

describe('mapStripeEvent', () => {
  it('checkout.session.completed with metadata.plan=pro maps to pro for the user', () => {
    expect(mapStripeEvent(checkout())).toEqual({ userId: 'user-123', stripeCustomerId: 'cus_1', plan: 'pro' })
  })

  it('checkout.session.completed with metadata.plan=ltd maps to ltd', () => {
    const e = checkout({ metadata: { plan: 'ltd' } })
    expect(mapStripeEvent(e)).toEqual({ userId: 'user-123', stripeCustomerId: 'cus_1', plan: 'ltd' })
  })

  it('checkout without client_reference_id returns null (no silent wrong write)', () => {
    const e = checkout({ client_reference_id: null })
    expect(mapStripeEvent(e)).toBeNull()
  })

  it('checkout without a valid metadata.plan returns null', () => {
    const e = checkout({ metadata: {} })
    expect(mapStripeEvent(e)).toBeNull()
  })

  it('customer.subscription.updated maps customer to pro with renewal date', () => {
    const e: StripeEventLike = {
      id: 'evt_2', type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_9', current_period_end: 1750000000 } },
    }
    expect(mapStripeEvent(e)).toEqual({
      stripeCustomerId: 'cus_9', plan: 'pro', planRenewsAt: new Date(1750000000 * 1000).toISOString(),
    })
  })

  it('customer.subscription.deleted maps customer to free and clears renewal', () => {
    const e: StripeEventLike = {
      id: 'evt_3', type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_9' } },
    }
    expect(mapStripeEvent(e)).toEqual({ stripeCustomerId: 'cus_9', plan: 'free', planRenewsAt: null })
  })

  it('unhandled event type returns null', () => {
    const e: StripeEventLike = { id: 'evt_4', type: 'invoice.paid', data: { object: {} } }
    expect(mapStripeEvent(e)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/mapStripeEvent.test.ts`
Expected: FAIL — cannot find module `./mapStripeEvent`.

- [ ] **Step 3: Implement the pure mapper**

Create `supabase/functions/_shared/mapStripeEvent.ts`. It is dependency-free (no Stripe SDK import) so vitest can run it. `Plan` is duplicated here as a local 3-string union because this file is bundled by Deno, separately from `src/`; keep it in sync with `src/lib/entitlements.ts`.

```ts
// Pure Stripe-event → profile-update mapping. No SDK import so it runs under
// vitest. The Deno webhook shell verifies the signature then delegates here.

export type Plan = 'free' | 'pro' | 'ltd'

export interface StripeEventLike {
  id: string
  type: string
  data: { object: Record<string, any> }
}

export interface PlanUpdate {
  userId?: string            // present for checkout (we know the Supabase user)
  stripeCustomerId?: string  // present whenever Stripe gives us the customer id
  plan: Plan
  planRenewsAt?: string | null // ISO string, or null to clear
}

export function mapStripeEvent(event: StripeEventLike): PlanUpdate | null {
  const obj = event.data.object

  if (event.type === 'checkout.session.completed') {
    const userId = obj.client_reference_id
    const plan = obj.metadata?.plan
    if (!userId) return null
    if (plan !== 'pro' && plan !== 'ltd') return null
    return { userId, stripeCustomerId: obj.customer ?? undefined, plan }
  }

  if (event.type === 'customer.subscription.updated') {
    if (!obj.customer) return null
    const renews = typeof obj.current_period_end === 'number'
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null
    return { stripeCustomerId: obj.customer, plan: 'pro', planRenewsAt: renews }
  }

  if (event.type === 'customer.subscription.deleted') {
    if (!obj.customer) return null
    return { stripeCustomerId: obj.customer, plan: 'free', planRenewsAt: null }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/mapStripeEvent.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the Deno webhook shell**

Create `supabase/functions/stripe-webhook/index.ts`. This runs on Deno (Supabase Edge Functions), not under vitest. It verifies the signature, dedupes on event id, calls the pure mapper, and applies the update with the service-role client.

```ts
// Supabase Edge Function (Deno). Verifies Stripe signatures, dedupes events,
// and applies the pure mapStripeEvent() result to profiles using the
// service-role key. Deploy: supabase functions deploy stripe-webhook
import Stripe from 'npm:stripe@^17'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { mapStripeEvent } from '../_shared/mapStripeEvent.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 })
  }

  // Idempotency: record the event id; a duplicate insert means already processed.
  const { error: dupeError } = await supabase
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })
  if (dupeError) {
    // Unique-violation -> we've already handled this event. Acknowledge and stop.
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
  }

  const update = mapStripeEvent(event as any)
  if (!update) {
    return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200 })
  }

  const patch: Record<string, unknown> = { plan: update.plan }
  if (update.stripeCustomerId) patch.stripe_customer_id = update.stripeCustomerId
  if (update.planRenewsAt !== undefined) patch.plan_renews_at = update.planRenewsAt

  // LTD: assign the next founders-wall seat if not already set.
  if (update.plan === 'ltd') {
    const { data: top } = await supabase
      .from('profiles').select('ltd_seat').not('ltd_seat', 'is', null)
      .order('ltd_seat', { ascending: false }).limit(1).maybeSingle()
    patch.ltd_seat = ((top?.ltd_seat as number | null) ?? 0) + 1
  }

  const query = update.userId
    ? supabase.from('profiles').update(patch).eq('id', update.userId)
    : supabase.from('profiles').update(patch).eq('stripe_customer_id', update.stripeCustomerId!)

  const { error: updateError } = await query
  if (updateError) {
    return new Response(`DB update failed: ${updateError.message}`, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
```

- [ ] **Step 6: Run the full test suite + typecheck + build**

Run: `npx vitest run`
Expected: all tests pass (entitlements + mapStripeEvent + the existing M1 tests).

Run: `npx tsc --noEmit`
Expected: no errors other than the known `gifenc` `TS7016`. (The Deno `index.ts` is under `supabase/`, which is outside the `src`-only tsconfig include, so it is not typechecked here — that is expected; it targets the Deno runtime.)

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/mapStripeEvent.ts supabase/functions/_shared/mapStripeEvent.test.ts supabase/functions/stripe-webhook/index.ts
git commit -m "feat(M0): stripe-webhook edge function + pure event->plan mapper"
```

---

## Self-Review Notes

- **Spec coverage:** data model (T1), entitlements pure logic (T2), AuthProvider plan (T3), useEntitlement (T4), watermark wiring (T5), UpgradeGate (T6), PricingPage+route (T7), webhook + pure mapper (T8). All spec sections mapped.
- **Refinement vs spec:** the spec said pro/ltd are "distinguished by a price→plan map"; this plan uses Payment Link **metadata** (`session.metadata.plan`), which Stripe copies onto the checkout session — simpler and equally valid for Payment Links, and it keeps `mapStripeEvent` SDK-free and unit-testable. Same intent (distinguish pro vs ltd at checkout).
- **Test infra:** only pure modules are tested (entitlements, mapStripeEvent), honoring the spec's node-env / no-jsdom decision. React pieces verified by tsc + build.
- **Type consistency:** `Plan` union is identical in `src/lib/entitlements.ts` and `supabase/functions/_shared/mapStripeEvent.ts` (intentional duplication across bundles, noted in code). `renderOptionsFor(isPro)` returns `{ watermark: boolean }`, matching M1's `RenderOptions`. Hook param `watermark: boolean` threads to M1's `{ watermark }` option.
- **Known acceptable noise:** the pre-existing `gifenc` `TS7016` remains the only tsc error throughout.
```
