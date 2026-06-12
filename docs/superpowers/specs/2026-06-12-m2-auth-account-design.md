# M2 — Auth & Account hardening design

**Date:** 2026-06-12
**Status:** Approved scope, pre-implementation

## Context

Auth already works: `AuthModal` does magic-link + Google OAuth via Supabase; `AuthProvider`
exposes `{ user, loading, plan, brandKit, signOut }` via `useAuth()` (plan added in M0);
sessions persist across refresh; the Navbar shows a bare "Log in"/"Log out". There is no
account page. Deleting a Supabase auth user requires the service-role key (admin), so a
real delete needs an Edge Function; FKs on `profiles`/`workspaces`/`brand_kits` are already
`ON DELETE CASCADE`.

The plan's M2 also mentioned GitHub OAuth, an `integrations` table, and an `oauth-callback`
function — those belong to the pipeline (M5/M7) and are **out of scope here**. M2 is: an
account page, a secure delete-account flow, and a Navbar account link.

## Goals & non-goals

**In scope:** `/account` page (email, plan badge + upgrade/manage, Brand Kit link, sign out,
delete account); a two-step delete flow (type-your-email + final confirmation modal); a
`delete-account` Edge Function (service-role, self-only); a Navbar account link; pure,
tested helpers for the confirmation and plan-view logic.

**Out of scope (deferred):** `oauth-callback`, `integrations` table, connected-accounts
list (M5/M7); adding GitHub as a login provider (Google + magic link stay as-is); password
re-authentication on delete (messy and low-value with magic-link/OAuth auth, by user
decision).

## Design

### 1. Account page — `src/pages/AccountPage.tsx`, route `/account`

- **Auth guard:** `useAuth()`. While `loading` → a centered spinner. If resolved and no
  `user` → `<Navigate to="/" replace />` (signing in happens via the Navbar modal on the
  landing page).
- **Sections (single place for everything):**
  - **Profile:** the user's email.
  - **Plan:** a badge (`Free` / `Pro` / `Lifetime`). If free → an "Upgrade" link to
    `/pricing`. If paid → a "Manage billing" button calling `useEntitlement().openPortal()`,
    shown ONLY when `VITE_STRIPE_PORTAL_URL` is set (respects the deferred Portal decision).
  - **Brand Kit:** a link to `/settings/brand` (keeps the account page the single hub).
  - **Sign out:** calls `signOut()` then navigates to `/`.
  - **Danger Zone:** the delete flow (below).
- **States:** loading (spinner), the normal authed view, and an error banner if delete fails.

### 2. Delete flow — two independent safeguards

The email match guards against *mistakes* (recognizing which account); the modal guards
against *slips* (accidental clicks). Both required.

1. The danger zone shows the user's email on screen: *"Type your email address
   (george@gmail.com) to confirm."*
2. A text input; the **Delete account** button is disabled until the typed value exactly
   matches the user's email (case-insensitive, trimmed) — `isDeleteConfirmed(input, email)`.
3. Clicking **Delete account** opens a final confirmation modal: *"Your account and all
   data will be permanently deleted. This cannot be undone."* with **Cancel** /
   **Permanently delete**.
4. **Permanently delete** runs `deleteAccount()` (shows a busy state), then redirects to `/`.
   On failure: close the modal, show the error banner, leave the account intact.

No password re-auth.

### 3. delete-account Edge Function — `supabase/functions/delete-account/index.ts` (Deno)

**Security-critical — self-only deletion:**
- Reads the caller's JWT from the `Authorization: Bearer <token>` header (the Supabase JS
  `functions.invoke` attaches the session token automatically).
- Resolves the user with a service-role client: `auth.getUser(jwt)`. If no valid user → 401.
- Deletes exactly that user: `auth.admin.deleteUser(user.id)`. **The id comes only from the
  verified token, never from the request body**, so a caller can never delete another
  account. Cascading FKs remove `profiles`/`workspaces`/`brand_kits`.
- Returns `200 { deleted: true }`, `401` for missing/invalid auth, `500` on admin failure
  (with a `console.error` for Edge logs).
- CORS: handles `OPTIONS` preflight and sets `Access-Control-Allow-*` so the browser
  `invoke` works.

### 4. Client helper — `src/lib/account.ts`

- `deleteAccount(): Promise<void>` — `await supabase.functions.invoke('delete-account')`;
  throw on error; then `await supabase.auth.signOut()`.
- Pure, tested helpers (no React, no Supabase):
  - `isDeleteConfirmed(input: string, email: string): boolean` — `input.trim().toLowerCase()
    === email.trim().toLowerCase()`, and false for empty input.
  - `accountPlanView(plan: Plan, hasPortal: boolean): { badgeLabel: string; cta: 'upgrade' |
    'manage' | 'none' }` — free → `{ 'Free', 'upgrade' }`; pro → `{ 'Pro', hasPortal ?
    'manage' : 'none' }`; ltd → `{ 'Lifetime', hasPortal ? 'manage' : 'none' }`.

### 5. Navbar — `src/components/Navbar.tsx`

When `user` is present, render an **Account** link (`<Link to="/account">`) next to the
existing **Log out** button. No other change.

### 6. Route — `src/App.tsx`

Add `<Route path="/account" element={<AccountPage />} />`.

## Graceful degradation without keys

- No Supabase keys / no session → `/account` redirects to `/`. No crash.
- `VITE_STRIPE_PORTAL_URL` unset → "Manage billing" hidden (paid users still see their plan).
- `delete-account` not deployed → `invoke` errors → the modal closes and the error banner
  shows a readable message; the account is untouched.

## Testing (vitest, node env, no jsdom)

- `isDeleteConfirmed`: empty → false; wrong → false; exact → true; different case/whitespace
  → true.
- `accountPlanView`: free → Upgrade; pro+portal → Manage; pro+no-portal → none; ltd+portal →
  Manage; ltd+no-portal → none.
- The Edge Function and React components are verified by `tsc` + `npm run build` + manual
  smoke, not render tests (consistent with M0).

## File structure

- Create: `src/pages/AccountPage.tsx`
- Create: `src/lib/account.ts` + `src/lib/account.test.ts`
- Create: `supabase/functions/delete-account/index.ts`
- Modify: `src/components/Navbar.tsx` (Account link)
- Modify: `src/App.tsx` (route)

## Build order

1. `account.ts` pure helpers (`isDeleteConfirmed`, `accountPlanView`) + tests.
2. `deleteAccount()` client call (in `account.ts`).
3. `delete-account` Edge Function.
4. `AccountPage` (guard, sections, delete flow + modal).
5. Navbar Account link + `/account` route.

Each lands with its own commit; pure logic lands with its test.
