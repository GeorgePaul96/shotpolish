# M0 — Billing & Entitlements design

**Date:** 2026-06-12
**Status:** Approved scope, pre-implementation

## Context

The Supabase backend already exists on `main` (it was on the remote, ahead of the
stale local checkout used during M1): `@supabase/supabase-js`, a client with an
env+dummy fallback ([src/lib/supabase.ts](../../../src/lib/supabase.ts)), an
`AuthProvider` exposing `{ user, loading, brandKit, signOut }` via `useAuth()`
([src/components/AuthProvider.tsx](../../../src/components/AuthProvider.tsx)), a
`profiles` table auto-created on signup by trigger, plus `workspaces` and
`brand_kits` with RLS ([supabase/schema.sql](../../../supabase/schema.sql)).

M1 already made the canvas watermark an opt-out flag:
`renderComposition(ctx, img, theme, doc, L, motionProgress?, { watermark })`.

M0 adds the paid layer: a `plan` on each profile, a Stripe webhook that sets it,
client entitlement helpers, an upgrade gate, a pricing page, and the wiring that
turns M1's watermark flag into a real Free-vs-Pro gate. **Stripe integration style:
Payment Links** (user-approved).

This is scaffolded to run **degraded without keys** and go live when the user pastes
Supabase + Stripe credentials. No external accounts are required to build or test it;
activation is a later, user-driven step.

## Goals & non-goals

**In scope:** plan columns + webhook idempotency table; `plan` exposed through
`AuthProvider`; `entitlements.ts` (pure) + `useEntitlement()`; `UpgradeGate`;
`PricingPage` at `/pricing`; `stripe-webhook` Edge Function with a pure, tested
event→plan mapping; wire `{ watermark: !isPro }` into the editor export.

**Out of scope (deferred):** actual pricing tiers / labels / price points; whether to
surface the Customer Portal in the UI now (the `openPortal()` helper is built, but
exposing it is deferred); server-side re-enforcement of the watermark at publish time
(that is M7); account page / integrations list (M2); any non-billing module.

## Design

### 1. Data model

New migration `supabase/migrations/0001_profiles_plan.sql`, also mirrored into
`schema.sql` so a fresh setup matches:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';      -- free | pro | ltd
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltd_seat INT;

-- Webhook idempotency: every processed Stripe event id is recorded once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

The existing RLS policy lets a user read their own profile, so the client can read
`plan`. `stripe_events` is written only by the webhook using the service-role key
(bypasses RLS); no client policy needed.

### 2. Entitlement read path — single source of truth

Extend `AuthProvider` (it already fetches brand-kit data on auth) to also select
`plan` from `profiles` for the active user and expose it:

```ts
interface AuthContextType {
  user: User | null
  loading: boolean
  plan: Plan          // 'free' | 'pro' | 'ltd', defaults to 'free' until/unless loaded
  brandKit: any | null
  signOut: () => Promise<void>
}
```

`plan` defaults to `'free'` (no session, dummy keys, or fetch failure all yield free).
It is refreshed on `getSession` and `onAuthStateChange`, mirroring `fetchBrandKit`.

### 3. Pure logic + hook

`src/lib/entitlements.ts` (pure, no React, no Supabase):

```ts
export type Plan = 'free' | 'pro' | 'ltd'
export type Feature = 'watermark_removal' | 'scheduled_publishing'
export function isPaid(plan: Plan): boolean        // pro || ltd
export function hasFeature(plan: Plan, f: Feature): boolean
```

`src/hooks/useEntitlement.ts`:

```ts
function useEntitlement(): {
  plan: Plan
  isPro: boolean        // isPaid(plan)
  isLoading: boolean    // from useAuth().loading
  openPortal: () => void // opens VITE_STRIPE_PORTAL_URL in a new tab; no-op + console.warn if unset
}
```

### 4. UI

`src/components/UpgradeGate.tsx`:

```tsx
<UpgradeGate feature="watermark_removal" fallback={<UpsellCard/>}>
  {/* entitled content */}
</UpgradeGate>
```

Renders children when `hasFeature(plan, feature)`, else the upsell (default: a small
card with copy + a link to `/pricing`). Uses `useEntitlement` + `useAuth().plan`.

`src/pages/PricingPage.tsx`, route `/pricing` in `App.tsx`:
- Free vs Pro feature comparison.
- Three CTA buttons sourced from env: `VITE_STRIPE_PAYMENT_LINK_MONTHLY`,
  `_ANNUAL`, `_LTD`. Each link, when a user is signed in, is appended with
  `?client_reference_id=<user.id>` (and `prefilled_email` when available) so the
  webhook can map the payment to the profile.
- If a link env var is missing, that button renders disabled with "Billing not
  configured yet" — never a dead link. If the user is signed out, buttons route to
  sign-in first (open the existing `AuthModal`).
- Prices/labels are placeholders pulled from a single `TIERS` array (real numbers
  deferred — see non-goals).

### 5. Stripe webhook

`supabase/functions/stripe-webhook/index.ts` (Deno Edge Function):
- Reads raw body, verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`.
- Idempotency: `INSERT INTO stripe_events (id, type)`; if the id already exists
  (conflict), return 200 without reprocessing.
- Uses the service-role key to update `profiles`.
- Handles:
  - `checkout.session.completed` → resolve user via `client_reference_id`; set
    `plan` ('pro' for subscription links, 'ltd' for the LTD link — distinguished by
    a price→plan map), `stripe_customer_id`; for LTD assign the next `ltd_seat`
    (`MAX(ltd_seat)+1`).
  - `customer.subscription.updated` → set `plan='pro'`, `plan_renews_at`.
  - `customer.subscription.deleted` → set `plan='free'`, clear `plan_renews_at`.
- The decision logic — `mapStripeEvent(event) → { stripeCustomerId?, userId?, plan, planRenewsAt? } | null` —
  is a **pure function in its own module** (`_shared/mapStripeEvent.ts`) so it is
  unit-tested without Stripe or network. The handler is the thin IO shell around it.

### 6. Wire M1's watermark to entitlement

In the editor's export/render call sites, pass `{ watermark: !isPro }` (from
`useEntitlement`) into `renderComposition`. Free → watermark; Pro/LTD → clean export.
This is the visible payoff of M0 + M1 together. (Publish-time server re-check is M7.)

### 7. Graceful degradation without keys

- No Supabase keys → dummy client, no session → `plan='free'` → watermark on, gates
  show upsell. No crash.
- Missing Payment Link env → disabled "not configured" buttons.
- Missing `VITE_STRIPE_PORTAL_URL` → `openPortal()` warns and no-ops.
- The webhook simply isn't deployed until the user does so; the client never depends
  on it being live.

### 8. Activation checklist (user, later)

Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_STRIPE_PAYMENT_LINK_MONTHLY/_ANNUAL/_LTD`, `VITE_STRIPE_PORTAL_URL`.
Supabase function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Run the migration; register the webhook
endpoint and price→plan mapping in Stripe; finalize tiers/labels and Portal exposure.

## Testing (vitest)

- `entitlements.ts`: `isPaid`/`hasFeature` for free/pro/ltd × features.
- `mapStripeEvent.ts`: each handled event type → correct `{plan,…}`; unhandled event
  → `null`; missing `client_reference_id` → `null` (no silent wrong write).
- Watermark wiring: a tiny pure helper `renderOptionsFor(isPro) => { watermark: !isPro }`
  in `entitlements.ts`, tested directly. The editor call site uses it.

**Test-infra note:** vitest runs in the `node` environment (no DOM). To avoid adding
jsdom/testing-library in M0, no React-rendering tests are written. `UpgradeGate` is a
thin wrapper over the already-tested `hasFeature` predicate, so its branch logic is
covered by the `entitlements.ts` tests rather than a component render test.

## File structure

- Create: `supabase/migrations/0001_profiles_plan.sql`
- Modify: `supabase/schema.sql` (mirror columns + stripe_events)
- Modify: `src/components/AuthProvider.tsx` (expose `plan`)
- Create: `src/lib/entitlements.ts` + `src/lib/entitlements.test.ts` (includes
  `renderOptionsFor`)
- Create: `src/hooks/useEntitlement.ts`
- Create: `src/components/UpgradeGate.tsx` (no separate test — logic covered by
  `entitlements.test.ts`)
- Create: `src/pages/PricingPage.tsx`; Modify `src/App.tsx` (route `/pricing`)
- Create: `supabase/functions/stripe-webhook/index.ts`
- Create: `supabase/functions/_shared/mapStripeEvent.ts` + `.test.ts`
- Modify: editor export call site(s) to pass `{ watermark: !isPro }`

## Build order

1. Migration + schema mirror (data foundation)
2. `entitlements.ts` (pure, tested)
3. `AuthProvider` exposes `plan`
4. `useEntitlement` hook
5. Wire watermark to `!isPro` (M0+M1 payoff, small, high value)
6. `UpgradeGate`
7. `PricingPage` + route
8. `mapStripeEvent` (pure, tested) then `stripe-webhook` shell

Each lands independently with its own test and commit.
