# DEVELOPER_GUIDE.md — ShotPolish

## Setup
1. `npm install`
2. Create `.env.local` with client vars (see API_MAP.md):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PORTAL_URL`.
   (App boots without them via dummy fallback, but auth/DB won't work.)
3. `npm run dev`.

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build (with SPA fallback) | `npm run build` |
| Preview build | `npm run preview` |
| Tests | `npm test` (Vitest run mode) |
| Deploy edge fn | `supabase functions deploy stripe-webhook` / `delete-account` |

## Backend setup
- Apply `supabase/schema.sql` (or run migrations in order) to a Supabase project.
- Set edge-function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Point a Stripe webhook at the deployed `stripe-webhook` URL; the Checkout
  session must set `client_reference_id` = Supabase user id and `metadata.plan`.

## Conventions
- **TypeScript throughout.** `lib/` holds pure, testable logic (no React/Supabase
  where avoidable); UI lives in `components/`/`pages/`.
- **Entitlements**: change plan→feature rules only in `lib/entitlements.ts`. If
  you add a plan, update BOTH `entitlements.ts` and `_shared/mapStripeEvent.ts`.
- **Persistence**: go through `lib/workspaceStore.ts`; don't query `workspaces`
  directly from components.
- **Exports**: long-running encode work runs async with progress callbacks; GIF
  encoding goes to `workers/encode.worker.ts`. Don't block the main thread.
- **Tests**: pure modules get a `*.test.ts` next to them (Vitest). Add tests for
  new pure logic; the edge-event mapper is tested via `mapStripeEvent.test.ts`.

## Gotchas (verified)
- `Plan` union is duplicated across client/edge bundles — keep in sync.
- `supabase.ts` uses dummy creds when env is missing; failures may be silent in
  that mode.
- The four large files (StoryModePage, EditorPage, ShotPolishTool, composition)
  hold >50% of source LOC — grep for the symbol and read the range.
- "AI" engines are deterministic keyword logic; no model/network calls exist.
- LTD seat assignment isn't fully race-safe (documented in stripe-webhook).

## AI-agent workflow (keep Claude cheap)
Read CLAUDE.md → the one reference doc for your task → grep to the exact symbol →
read only that range. See "AI-First Workflow" in the audit. Don't open
node_modules, dist, lockfiles, assets, or `docs/superpowers/` plans.

## Where to make common changes
| Want to… | Go to |
|----------|-------|
| Add/adjust a plan or feature gate | `lib/entitlements.ts` (+ `_shared/mapStripeEvent.ts`) |
| Change render/watermark output | `lib/composition.ts`, `hooks/useCompositionCanvas.ts` |
| Change export formats | `lib/motionExport.ts`, `lib/storyAnimationExport.ts`, `workers/` |
| Add a route/screen | `src/App.tsx` + `src/pages/` |
| Change billing behavior | `functions/stripe-webhook/` + `_shared/mapStripeEvent.ts` |
| Change DB shape | `supabase/migrations/` (new file) + `schema.sql` + DATABASE.md |
| Brand kit fields | `pages/BrandKitPage.tsx` + `brand_kits` schema |
