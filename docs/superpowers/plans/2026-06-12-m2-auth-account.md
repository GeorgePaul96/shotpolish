# M2 Auth & Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/account` page (email, plan, Brand Kit link, sign out, two-step delete) and a secure self-only `delete-account` Edge Function, plus a Navbar account link.

**Architecture:** Pure, tested helpers (`isDeleteConfirmed`, `accountPlanView`) and a `deleteAccount()` client call live in `src/lib/account.ts`. `AccountPage` composes them with `useAuth`/`useEntitlement`, guarding for auth and running a type-your-email + confirmation-modal delete flow. The `delete-account` Deno Edge Function deletes only the user identified by the verified JWT (never a body-supplied id); FKs cascade the rest.

**Tech Stack:** React 18 · react-router-dom v7 · Vite · TypeScript · vitest (node env) · Supabase Auth + Edge Functions (Deno).

---

## Important context for the implementer

- Auth already works (magic-link + Google). `useAuth()` returns `{ user, loading, plan, brandKit, signOut }`. `useEntitlement()` returns `{ plan, isPro, isLoading, openPortal }`. `Plan` type is in `src/lib/entitlements.ts`.
- `src/lib/supabase.ts` exports `supabase` (env+dummy fallback; importing it never throws).
- Pages render their own `<Navbar />` (see `PricingPage.tsx`); the route element is bare. Follow that.
- vitest runs in the `node` env (no DOM). Test ONLY the pure helpers; React + the Edge Function are verified by `npx tsc --noEmit` + `npm run build`.
- KNOWN pre-existing tsc errors (NOT yours, do not fix): `gifenc` TS7016 in `src/lib/gifEncoder.ts`; `src/pages/BrandKitPage.tsx(34)`; `src/pages/StoryModePage.tsx(109,1187,1190)`. `npx tsc --noEmit` should show NO errors beyond these five.
- `supabase/` is outside the `src`-only tsconfig, so the Deno function is not typechecked by `tsc` — expected.

---

## File Structure

- `src/lib/account.ts` — **new.** Pure helpers (`isDeleteConfirmed`, `accountPlanView`) + `deleteAccount()` client call.
- `src/lib/account.test.ts` — **new.** Tests for the two pure helpers.
- `supabase/functions/delete-account/index.ts` — **new.** Deno Edge Function, self-only deletion.
- `src/pages/AccountPage.tsx` — **new.** The account page.
- `src/components/Navbar.tsx` — **modify.** Add an Account link when signed in.
- `src/App.tsx` — **modify.** Add the `/account` route.

---

## Task 1: account.ts — pure helpers + delete call

**Files:**
- Create: `src/lib/account.ts`
- Create: `src/lib/account.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/account.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isDeleteConfirmed, accountPlanView } from './account'

describe('isDeleteConfirmed', () => {
  const email = 'George@Gmail.com'
  it('false for empty input', () => { expect(isDeleteConfirmed('', email)).toBe(false) })
  it('false for a wrong value', () => { expect(isDeleteConfirmed('nope@x.com', email)).toBe(false) })
  it('true for an exact match', () => { expect(isDeleteConfirmed('George@Gmail.com', email)).toBe(true) })
  it('true ignoring case and surrounding whitespace', () => {
    expect(isDeleteConfirmed('  george@gmail.com ', email)).toBe(true)
  })
})

describe('accountPlanView', () => {
  it('free -> Free badge + upgrade cta', () => {
    expect(accountPlanView('free', true)).toEqual({ badgeLabel: 'Free', cta: 'upgrade' })
  })
  it('pro with portal -> Pro badge + manage', () => {
    expect(accountPlanView('pro', true)).toEqual({ badgeLabel: 'Pro', cta: 'manage' })
  })
  it('pro without portal -> Pro badge + none', () => {
    expect(accountPlanView('pro', false)).toEqual({ badgeLabel: 'Pro', cta: 'none' })
  })
  it('ltd with portal -> Lifetime badge + manage', () => {
    expect(accountPlanView('ltd', true)).toEqual({ badgeLabel: 'Lifetime', cta: 'manage' })
  })
  it('ltd without portal -> Lifetime badge + none', () => {
    expect(accountPlanView('ltd', false)).toEqual({ badgeLabel: 'Lifetime', cta: 'none' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/account.test.ts`
Expected: FAIL — cannot find module `./account`.

- [ ] **Step 3: Implement**

Create `src/lib/account.ts`:

```ts
import { supabase } from './supabase'
import type { Plan } from './entitlements'

/** True only when the typed value exactly matches the email (case/space-insensitive). */
export function isDeleteConfirmed(input: string, email: string): boolean {
  const a = input.trim().toLowerCase()
  const b = email.trim().toLowerCase()
  return a.length > 0 && a === b
}

export type PlanCta = 'upgrade' | 'manage' | 'none'

/** UI view-model for the account page's plan section. */
export function accountPlanView(plan: Plan, hasPortal: boolean): { badgeLabel: string; cta: PlanCta } {
  if (plan === 'free') return { badgeLabel: 'Free', cta: 'upgrade' }
  const badgeLabel = plan === 'ltd' ? 'Lifetime' : 'Pro'
  return { badgeLabel, cta: hasPortal ? 'manage' : 'none' }
}

/**
 * Permanently delete the signed-in user's account. Invokes the delete-account
 * Edge Function (which auto-receives the session JWT), then signs out locally.
 * Throws if the function call fails (the caller surfaces the error).
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  await supabase.auth.signOut()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/account.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/account.ts src/lib/account.test.ts
git commit -m "feat(M2): account helpers (isDeleteConfirmed, accountPlanView) + deleteAccount call"
```

---

## Task 2: delete-account Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

No vitest test (Deno IO-only). Verify it does not break the suite/typecheck.

- [ ] **Step 1: Implement the function**

Create `supabase/functions/delete-account/index.ts`:

```ts
// Supabase Edge Function (Deno). Deletes ONLY the user identified by the
// caller's verified JWT — never an id from the request body — so a caller can
// only ever delete their own account. Cascading FKs remove profiles/workspaces/
// brand_kits. Deploy: supabase functions deploy delete-account
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'Missing authorization header' })
  const token = authHeader.replace('Bearer ', '')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify the token and resolve the user; the id comes ONLY from here.
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return json(401, { error: 'Invalid or expired token' })

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('delete-account failed', { userId: user.id, error: deleteError.message })
    return json(500, { error: deleteError.message })
  }

  return json(200, { deleted: true })
})
```

- [ ] **Step 2: Verify nothing else broke**

Run: `npx vitest run`
Expected: all pass (the new file adds no tests; suite unchanged).

Run: `npx tsc --noEmit`
Expected: only the 5 known pre-existing errors (the Deno file is outside the src-only tsconfig, so it does not appear).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat(M2): delete-account edge function (self-only, service-role)"
```

---

## Task 3: AccountPage

**Files:**
- Create: `src/pages/AccountPage.tsx`

No render test (node env). Verify with `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 1: Implement the page**

Create `src/pages/AccountPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/Navbar'
import { useAuth } from '../components/AuthProvider'
import { useEntitlement } from '../hooks/useEntitlement'
import { accountPlanView, isDeleteConfirmed, deleteAccount } from '../lib/account'

export function AccountPage() {
  const { user, loading, signOut } = useAuth()
  const { plan, openPortal } = useEntitlement()
  const navigate = useNavigate()

  const [confirmInput, setConfirmInput] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F6F8]">
        <Navbar />
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </main>
    )
  }

  if (!user) return <Navigate to="/" replace />

  const hasPortal = !!import.meta.env.VITE_STRIPE_PORTAL_URL
  const { badgeLabel, cta } = accountPlanView(plan, hasPortal)
  const email = user.email ?? ''
  const canDelete = isDeleteConfirmed(confirmInput, email)

  const handleSignOut = async () => { await signOut(); navigate('/') }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount()
      navigate('/')
    } catch (e) {
      setModalOpen(false)
      setError(e instanceof Error ? e.message : 'Could not delete your account. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F6F8] text-[#111827]">
      <Navbar />
      <section className="mx-auto max-w-2xl px-4 pt-28 pb-20">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Profile */}
        <div className="mt-6 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-[#374151]">Profile</h2>
          <p className="mt-2 text-sm text-[#6B7280]">{email}</p>
        </div>

        {/* Plan */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#374151]">Plan</h2>
              <span className="mt-2 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{badgeLabel}</span>
            </div>
            {cta === 'upgrade' && <Link to="/pricing" className="btn-primary px-4 py-2 text-sm">Upgrade</Link>}
            {cta === 'manage' && <button onClick={openPortal} className="btn-ghost px-4 py-2 text-sm">Manage billing</button>}
          </div>
        </div>

        {/* Brand kit */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#374151]">Brand kit</h2>
            <Link to="/settings/brand" className="btn-ghost px-4 py-2 text-sm">Edit brand kit</Link>
          </div>
        </div>

        {/* Session */}
        <div className="mt-4 rounded-2xl border border-[#E5E7EC] bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#374151]">Session</h2>
            <button onClick={handleSignOut} className="btn-ghost px-4 py-2 text-sm">Sign out</button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-8 rounded-2xl border border-red-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
          <p className="mt-2 text-sm text-[#6B7280]">
            Deleting your account permanently removes your profile, workspaces, and brand kits. This cannot be undone.
          </p>
          <p className="mt-3 text-sm text-[#374151]">
            Type your email address (<span className="font-medium">{email}</span>) to confirm.
          </p>
          <input
            type="email"
            value={confirmInput}
            onChange={e => setConfirmInput(e.target.value)}
            placeholder={email}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            disabled={!canDelete}
            onClick={() => setModalOpen(true)}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
          >
            Delete account
          </button>
        </div>
      </section>

      {/* Final confirmation modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#111827]">Delete account?</h3>
            <p className="mt-2 text-sm text-[#6B7280]">Your account and all data will be permanently deleted. This cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} disabled={deleting} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit`
Expected: only the 5 known pre-existing errors.

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AccountPage.tsx
git commit -m "feat(M2): account page with plan, brand-kit link, sign out, two-step delete"
```

---

## Task 4: Navbar account link + route

**Files:**
- Modify: `src/components/Navbar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the Account link in the Navbar**

In `src/components/Navbar.tsx`, find the signed-in branch of the CTA block (around lines 60-66):

```tsx
              {user ? (
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100"
                >
                  Log out
                </button>
              ) : (
```

Replace it with (add an Account link before Log out):

```tsx
              {user ? (
                <>
                  <Link
                    to="/account"
                    className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100"
                  >
                    Account
                  </Link>
                  <button
                    onClick={signOut}
                    className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors duration-150 rounded-lg hover:bg-gray-100"
                  >
                    Log out
                  </button>
                </>
              ) : (
```

(`Link` is already imported in Navbar.tsx — confirm the import line `import { Link, useLocation } from 'react-router-dom'` is present; if not, add `Link` to it.)

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import next to the other page imports:

```tsx
import { AccountPage } from './pages/AccountPage'
```

Add the route inside `<Routes>` (e.g. after the `/pricing` route):

```tsx
        <Route path="/account" element={<AccountPage />} />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit`
Expected: only the 5 known pre-existing errors.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/Navbar.tsx src/App.tsx
git commit -m "feat(M2): navbar account link + /account route"
```

---

## Self-Review Notes

- **Spec coverage:** account page sections (T3), two-step delete with email match + modal (T3 + T1 helper), delete-account Edge Function self-only (T2), Navbar link + route (T4), pure helpers + tests (T1). All spec sections mapped.
- **Test infra:** only pure helpers tested (`isDeleteConfirmed`, `accountPlanView`), per the spec's node-env/no-jsdom decision. React + Deno verified by tsc/build.
- **Type consistency:** `Plan` imported from `entitlements.ts`; `accountPlanView` returns `{ badgeLabel, cta: PlanCta }` consumed in AccountPage; `deleteAccount()` thrown error caught in AccountPage's `handleDelete`.
- **Security:** the Edge Function derives the user id only from the verified JWT (`auth.getUser(token)`), never from the body — self-only deletion. CORS preflight handled.
- **Graceful degradation:** `/account` redirects to `/` when unauthenticated; "Manage billing" hidden when `VITE_STRIPE_PORTAL_URL` unset (`accountPlanView(..., false) -> cta 'none'`); delete `invoke` failure surfaces an error banner and leaves the account intact.
- **Known acceptable noise:** the 5 pre-existing tsc errors remain; nothing new.
```
