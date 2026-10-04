# API_MAP.md — ShotPolish

No REST API of our own. "API surface" = Supabase client calls, two Deno edge
functions, and Stripe. All identity is enforced by Supabase Auth + RLS or by
verified tokens/signatures inside edge functions.

## Edge functions (`supabase/functions/`)

### stripe-webhook  (POST, public, signature-gated)
- Verifies `Stripe-Signature` via `constructEventAsync` + `STRIPE_WEBHOOK_SECRET`.
- Idempotency: inserts `event.id` into `stripe_events`; duplicate ⇒ 200 no-op.
- `mapStripeEvent()` (pure, `_shared/`) → plan update, then writes `profiles`
  with the service-role key.
- On DB update failure: deletes the idempotency row so Stripe retries reprocess.
- Handled events:
  | Stripe event | Result |
  |--------------|--------|
  | `checkout.session.completed` | plan ← `metadata.plan` (`pro`/`ltd`), keyed by `client_reference_id` (user id); LTD assigns next `ltd_seat` once |
  | `customer.subscription.updated` | plan ← `pro`, set `plan_renews_at`, keyed by `customer` |
  | `customer.subscription.deleted` | plan ← `free`, clear `plan_renews_at`, keyed by `customer` |
  | anything else | ignored (200) |

### delete-account  (POST, JWT-gated)
- Requires `Authorization: Bearer <jwt>`; resolves user via `auth.getUser(token)`.
- **User id comes only from the token, never the body** — caller can delete only
  themselves. Calls `auth.admin.deleteUser(user.id)` (cascades, see DATABASE.md).
- CORS: `*` origin, POST/OPTIONS.

### Museum of You functions  (POST JSON, public, CORS `*`)
No account. Ownership = a 32-char edit key returned once by `museum-create`;
only its SHA-256 is stored. Pure logic in `_shared/museum.ts` (Vitest-covered);
shared CORS/JSON helpers in `_shared/http.ts`. Called from `src/lib/museum/api.ts`.
| Function | Body | Returns |
|----------|------|---------|
| `museum-create` | `{ recipientName, curatorName?, exhibits:[{title,place?,year?,medium?}], hasFinalPhoto }` | `{ slug, editKey, uploads:[{path, token}] }` (signed upload URLs, bucket `museums`) |
| `museum-publish` | `{ slug, editKey, tier:'free'\|'full' }` | free: `{ state, tier, expiresAt }` (7 days, ≤3 exhibits, never renewed). full: `{ checkoutUrl }` (Stripe Checkout, `metadata.kind='museum'`, `metadata.museum_id`). 409 if photos missing. |
| `museum-get` | `{ slug, editKey? }` | open: names, `branded`, exhibits with 1-hour signed `photoUrl`, `finalPhotoUrl`. closed: names only. draft/missing: 404 `{state:'missing'}` unless owner. Valid key adds `owner:{tier,status,expiresAt,publishedAt,exhibitCount}`. |
| `museum-delete` | `{ slug, editKey }` | `{ deleted: true }` (photos removed, rows cascade) |

## Client → Supabase calls (where)
| Call | File |
|------|------|
| `auth.signInWithOtp` / `signInWithOAuth('google')` | `components/AuthModal.tsx` |
| `auth.getSession` / `onAuthStateChange` / `signOut` | `components/AuthProvider.tsx`, `lib/account.ts` |
| `from('profiles').select('plan')` | `components/AuthProvider.tsx` |
| `from('brand_kits')` select/insert/update | `AuthProvider.tsx`, `pages/BrandKitPage.tsx` |
| `from('workspaces')` upsert/select/delete | `lib/workspaceStore.ts` |
| `functions.invoke('delete-account')` | `lib/account.ts` |

## Environment variables
**Client (Vite, `import.meta.env`)** — public, shipped in bundle:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (dummy fallback in `lib/supabase.ts`)
- `VITE_STRIPE_PORTAL_URL` (customer portal link)
- `VITE_PUBLIC_URL` (production origin baked into the watermark remix link; falls back to `https://shotpolish.org` — see `src/lib/remix.ts`)
- `VITE_PUBLIC_POSTHOG_KEY` (PostHog project API key; unset ⇒ PostHog disabled/no-op — see `src/lib/posthog.ts`)
- `VITE_PUBLIC_POSTHOG_HOST` (PostHog ingestion host; falls back to `https://eu.i.posthog.com`)
- `DEV` (Vite built-in)

**Edge functions (Deno, `Deno.env`)** — secret, never in client:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL` (origin for museum Checkout success/cancel URLs; falls back to `https://shotpolish.org`)

## Invariants to preserve
1. Service-role key only inside edge functions.
2. `delete-account` identity from JWT only.
3. `stripe-webhook` rejects unsigned/invalid payloads (400) and dedupes.
4. `Plan` union kept in sync between `lib/entitlements.ts` and
   `_shared/mapStripeEvent.ts` (separate bundles, can't share an import).
