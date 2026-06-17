# ARCHITECTURE.md — ShotPolish

## One-paragraph overview
A static React SPA does all image composition and export **in the browser**.
A minimal Supabase backend adds accounts (auth + `profiles`), persistence
(`workspaces`, `brand_kits`), and billing. Stripe drives plan changes through a
single signed webhook edge function. There is no application server — only
static hosting (Vercel) plus Supabase edge functions for the two operations that
require a service-role key (webhook plan writes, account deletion).

## Components
```
Browser (Vite SPA)
 ├─ pages/ + components/  ── UI, routing (react-router-dom)
 ├─ hooks/                ── canvas rendering, entitlement resolution
 ├─ workers/encode        ── off-main-thread GIF encoding
 └─ lib/                  ── pure logic (render, export, copy/sequence engines,
                              entitlements, supabase client, workspace store)
        │
        ├── supabase-js ──► Supabase Auth (email OTP + Google OAuth)
        │                   Postgres: profiles / workspaces / brand_kits  (RLS on)
        │
        └── supabase.functions.invoke('delete-account')

Stripe ── webhook ──► edge fn stripe-webhook (service role) ──► profiles.plan
```

## Data flow (critical paths)
1. **Auth**: `AuthProvider` calls `supabase.auth.getSession()` + subscribes to
   `onAuthStateChange`, then loads `profiles.plan` and the user's brand kit. A DB
   trigger (`handle_new_user`) auto-creates a `profiles` row on signup.
2. **Editing/export**: image + options → `lib/composition.ts` renders to canvas
   → `lib/motionExport.ts` / `workers/encode.worker.ts` produce PNG/MP4/WebM/GIF.
   Entirely client-side; nothing uploaded.
3. **Entitlement gating**: `useEntitlement` reads plan from `AuthProvider`,
   resolves features via pure `lib/entitlements.ts`. Free → watermark applied;
   paid → not. `UpgradeGate` blocks paid-only UI.
4. **Billing**: client redirects to Stripe Checkout (+ optional portal via
   `VITE_STRIPE_PORTAL_URL`). Stripe → `stripe-webhook`: verify signature →
   dedupe on `stripe_events.id` → `mapStripeEvent()` (pure) → update
   `profiles.plan` / `stripe_customer_id` / `plan_renews_at`, assign LTD seat.
5. **Account deletion**: `lib/account.ts` invokes `delete-account`; the function
   resolves the user from the JWT and calls `auth.admin.deleteUser`, which
   cascades to profiles → workspaces/brand_kits.

## Trust boundaries
- **Client is untrusted.** Entitlement checks in the browser are UX only; the
  paywall is not cryptographically enforced (see audit_report.md). The only
  server-enforced truth is `profiles.plan`, written solely by the webhook.
- **RLS** restricts every table to `auth.uid() = owner`. `stripe_events` and plan
  writes happen only with the service-role key inside edge functions.
- Edge functions never trust request bodies for identity (`delete-account` uses
  the JWT; `stripe-webhook` uses the Stripe signature).

## Key decisions (the "why")
- **Client-side render/export**: zero infra cost, instant feedback; tradeoff =
  heavy CPU on-device and a structurally weak paywall (documented limitation).
- **Plan union duplicated** across client/edge bundles: Deno edge code can't
  import from `src/`. Accepted duplication over a shared package.
- **Webhook idempotency via insert-or-fail** on `stripe_events`, with rollback
  delete on update failure so Stripe retries reprocess (avoids stranding payers).
- **Hybrid workspace store**: works logged-out (local) and logged-in (DB sync).

## Known limitations (from audit_report.md, still true)
- Paywall enforceable only server-side via plan; client gating is bypassable.
- Heavy GIF/MP4 encoding can stall low-end / mobile devices.
- LTD seat assignment is not fully race-safe (guarded by null-check, not a DB
  sequence/unique constraint) — noted inline in stripe-webhook.
