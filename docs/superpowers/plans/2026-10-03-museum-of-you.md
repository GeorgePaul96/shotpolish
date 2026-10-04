# Museum of You Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "Museum of You" (option A swipe gallery) inside ShotPolish: builder, recipient viewer with camera "Masterpiece" finale, free/paid publishing via Supabase + Stripe, manage page, landing page.

**Architecture:** Lazy-loaded React pages under `/museum*` and `/m/:slug`, sharing one `MuseumViewer` component fed a `ViewerMuseum` shape. Supabase holds museums in RLS-locked tables + a private bucket; four thin Deno edge functions over a pure, Vitest-covered `_shared/museum.ts` do every read/write. Stripe Checkout (one-time $3.99) reuses the existing signed, deduped `stripe-webhook`.

**Tech Stack:** React 18, react-router-dom 7, Vite 5 (multi-page build), TypeScript strict, Vitest 4, Supabase JS 2 + Deno edge functions, Stripe (npm:stripe@^17, apiVersion 2024-06-20).

**Spec:** `docs/superpowers/specs/2026-10-03-museum-of-you-design.md`

**Execution note:** executed inline by the same author who wrote the spec, right after this plan. Backend/logic tasks carry complete code. UI tasks (7–10) specify exact contracts, markup, and behavior and port styles/painters from the approved prototype at
`%TEMP%/claude/.../scratchpad/museum-demo/index.html` (option A section) instead of duplicating ~1,500 lines here.

## Global Constraints

- Limits: `FREE_EXHIBITS = 3`, `MAX_EXHIBITS = 20`, `FREE_DAYS = 7`, `PRICE_CENTS = 399` (`$3.99`, `usd`). Text limits: names 40, title 80, place 60, year 20, medium 100.
- Slug: 10-char base62. Edit key: 32-char base62, stored only as SHA-256 hex.
- Bucket `museums` is private; paths `{museum_id}/{position}.jpg`, `{museum_id}/final.jpg`. Signed read URLs live 3600s.
- Tables `museums`, `museum_exhibits`: RLS on, **no client policies**.
- Redirect origin from `PUBLIC_SITE_URL` env, fallback `https://shotpolish.org`. Never from the request.
- Existing invariants unchanged: webhook signature + dedupe + rollback, `delete-account` identity from JWT, `Plan` union sync.
- No names/captions/photos in analytics props. Camera frames never uploaded.
- Museum UI copy: plain, warm, no em-dashes (repo removed them sitewide in b5b34cd).
- Verify with `npx vitest run` and `npx tsc --noEmit` (2 pre-existing errors: `gifenc` types, `BrandKitPage.tsx:34`; add no new ones) and `npm run build`.

---

### Task 1: Shared museum rules + pure edge logic

**Files:**
- Create: `supabase/functions/_shared/museum.ts`
- Test: `supabase/functions/_shared/museum.test.ts`

**Interfaces:**
- Produces: `FREE_EXHIBITS, MAX_EXHIBITS, FREE_DAYS, PRICE_CENTS, PRICE_CURRENCY, LIMITS`, types `Tier`, `MuseumStatus`, `MuseumState`, `CleanMuseumInput`; `validateMuseumInput(raw: unknown)`, `randomBase62(len, rand?)`, `generateSlug()`, `generateEditKey()`, `hashEditKey(key): Promise<string>`, `keyMatches(hash, key): Promise<boolean>`, `isValidSlug(v)`, `isValidEditKey(v)`, `museumState(row, now)`, `freeExpiry(now)`, `canPublishFree(n)`, `photoPath(id, pos)`, `finalPhotoPath(id)`, `expectedPhotoPaths(id, count, hasFinal)`, `mapMuseumPayment(event)`.

- [ ] **Step 1: Write the failing tests** (`museum.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import {
  validateMuseumInput, randomBase62, generateSlug, generateEditKey, hashEditKey, keyMatches,
  isValidSlug, isValidEditKey, museumState, freeExpiry, canPublishFree, expectedPhotoPaths,
  mapMuseumPayment, FREE_EXHIBITS, MAX_EXHIBITS,
} from './museum'

const ex = (title = 'Lisbon') => ({ title })

describe('validateMuseumInput', () => {
  it('accepts and trims a minimal museum', () => {
    const r = validateMuseumInput({ recipientName: '  Sam  ', exhibits: [{ title: ' Night  train ', place: '', medium: 'rain' }], hasFinalPhoto: true })
    expect(r).toEqual({ ok: true, value: { recipientName: 'Sam', curatorName: null, hasFinalPhoto: true,
      exhibits: [{ title: 'Night train', place: null, year: null, medium: 'rain' }] } })
  })
  it('requires a recipient name', () => {
    expect(validateMuseumInput({ recipientName: ' ', exhibits: [ex()] })).toEqual({ ok: false, error: 'Add the name of the person this museum is for.' })
  })
  it('requires 1..MAX exhibits, each with a title', () => {
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: Array.from({ length: MAX_EXHIBITS + 1 }, () => ex()) }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [ex(''), ex()] })).toEqual({ ok: false, error: 'Exhibit 1 needs a title.' })
  })
  it('enforces text limits', () => {
    expect(validateMuseumInput({ recipientName: 'x'.repeat(41), exhibits: [ex()] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [ex('x'.repeat(81))] }).ok).toBe(false)
    expect(validateMuseumInput({ recipientName: 'Sam', exhibits: [{ title: 'a', medium: 'm'.repeat(101) }] }).ok).toBe(false)
  })
  it('rejects non-objects', () => {
    expect(validateMuseumInput(null).ok).toBe(false)
    expect(validateMuseumInput('x').ok).toBe(false)
  })
})

describe('slugs and edit keys', () => {
  it('generates base62 strings of the right length', () => {
    expect(isValidSlug(generateSlug())).toBe(true)
    expect(isValidEditKey(generateEditKey())).toBe(true)
    expect(generateSlug()).not.toBe(generateSlug())
  })
  it('rejects bytes >= 248 to stay unbiased', () => {
    const bytes = [255, 249, 248, 0, 61, 62, 247]
    const rand = (n: number) => Uint8Array.from({ length: n }, (_, i) => bytes[i % bytes.length])
    expect(randomBase62(4, rand)).toBe('0z0z') // 0->'0', 61->'z', 62->'0', 247%62=61->'z'
  })
  it('validators reject bad shapes', () => {
    expect(isValidSlug('abc')).toBe(false)
    expect(isValidSlug('abcdefghi!')).toBe(false)
    expect(isValidEditKey(42)).toBe(false)
  })
  it('hashes keys to sha-256 hex and matches only the right key', async () => {
    const key = generateEditKey()
    const hash = await hashEditKey(key)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await keyMatches(hash, key)).toBe(true)
    expect(await keyMatches(hash, generateEditKey())).toBe(false)
  })
})

describe('museumState / expiry', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('draft until live', () => expect(museumState({ status: 'draft', expires_at: null }, now)).toBe('draft'))
  it('open while not expired or forever', () => {
    expect(museumState({ status: 'live', expires_at: null }, now)).toBe('open')
    expect(museumState({ status: 'live', expires_at: '2026-10-04T00:00:00Z' }, now)).toBe('open')
  })
  it('closed at or after expiry', () => expect(museumState({ status: 'live', expires_at: '2026-10-03T12:00:00Z' }, now)).toBe('closed'))
  it('free expiry is FREE_DAYS later', () => expect(freeExpiry(now)).toBe('2026-10-10T12:00:00.000Z'))
  it('free publishing only up to FREE_EXHIBITS', () => {
    expect(canPublishFree(FREE_EXHIBITS)).toBe(true)
    expect(canPublishFree(FREE_EXHIBITS + 1)).toBe(false)
  })
  it('expected photo paths', () => {
    expect(expectedPhotoPaths('m1', 2, true)).toEqual(['m1/0.jpg', 'm1/1.jpg', 'm1/final.jpg'])
    expect(expectedPhotoPaths('m1', 1, false)).toEqual(['m1/0.jpg'])
  })
})

describe('mapMuseumPayment', () => {
  const ev = (type: string, obj: Record<string, unknown>) => ({ id: 'evt', type, data: { object: obj } })
  it('maps a paid museum checkout', () => {
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', metadata: { kind: 'museum', museum_id: 'm1' } })))
      .toEqual({ museumId: 'm1', sessionId: 'cs_1' })
  })
  it('maps async payment success', () => {
    expect(mapMuseumPayment(ev('checkout.session.async_payment_succeeded', { id: 'cs_2', payment_status: 'paid', metadata: { kind: 'museum', museum_id: 'm2' } })))
      .toEqual({ museumId: 'm2', sessionId: 'cs_2' })
  })
  it('ignores unpaid, non-museum, and other events', () => {
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'unpaid', metadata: { kind: 'museum', museum_id: 'm' } }))).toBeNull()
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'paid', metadata: { plan: 'pro' } }))).toBeNull()
    expect(mapMuseumPayment(ev('customer.subscription.updated', { metadata: { kind: 'museum', museum_id: 'm' } }))).toBeNull()
    expect(mapMuseumPayment(ev('checkout.session.completed', { id: 'cs', payment_status: 'paid', metadata: { kind: 'museum' } }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run supabase/functions/_shared/museum.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** (`museum.ts`)

```ts
// Pure Museum of You rules shared by the museum-* edge functions and the
// stripe-webhook. No Deno/SDK imports, so it runs under Vitest.
// NOTE: the limits and price below are duplicated in src/lib/museum/rules.ts
// (client and edge are separate bundles). rules.sync.test.ts keeps them equal.

export const FREE_EXHIBITS = 3
export const MAX_EXHIBITS = 20
export const FREE_DAYS = 7
export const PRICE_CENTS = 399
export const PRICE_CURRENCY = 'usd'
export const LIMITS = { name: 40, title: 80, place: 60, year: 20, medium: 100 } as const

export type Tier = 'free' | 'full'
export type MuseumStatus = 'draft' | 'live'
export type MuseumState = 'draft' | 'open' | 'closed'

export interface CleanExhibit { title: string; place: string | null; year: string | null; medium: string | null }
export interface CleanMuseumInput { recipientName: string; curatorName: string | null; exhibits: CleanExhibit[]; hasFinalPhoto: boolean }
type Result = { ok: true; value: CleanMuseumInput } | { ok: false; error: string }

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const optional = (v: unknown): string | null => clean(v) || null
const tooLong = (label: string, max: number): Result => ({ ok: false, error: `${label} is too long (max ${max} characters).` })

export function validateMuseumInput(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Missing museum details.' }
  const r = raw as Record<string, unknown>
  const recipientName = clean(r.recipientName)
  if (!recipientName) return { ok: false, error: 'Add the name of the person this museum is for.' }
  if (recipientName.length > LIMITS.name) return tooLong('Their name', LIMITS.name)
  const curatorName = optional(r.curatorName)
  if (curatorName && curatorName.length > LIMITS.name) return tooLong('Your name', LIMITS.name)
  if (!Array.isArray(r.exhibits) || r.exhibits.length === 0) return { ok: false, error: 'Add at least one exhibit.' }
  if (r.exhibits.length > MAX_EXHIBITS) return { ok: false, error: `A museum can hold up to ${MAX_EXHIBITS} exhibits.` }
  const exhibits: CleanExhibit[] = []
  for (const [i, item] of r.exhibits.entries()) {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const n = i + 1
    const title = clean(e.title)
    if (!title) return { ok: false, error: `Exhibit ${n} needs a title.` }
    if (title.length > LIMITS.title) return tooLong(`Exhibit ${n}'s title`, LIMITS.title)
    const place = optional(e.place), year = optional(e.year), medium = optional(e.medium)
    if (place && place.length > LIMITS.place) return tooLong(`Exhibit ${n}'s place`, LIMITS.place)
    if (year && year.length > LIMITS.year) return tooLong(`Exhibit ${n}'s year`, LIMITS.year)
    if (medium && medium.length > LIMITS.medium) return tooLong(`Exhibit ${n}'s medium`, LIMITS.medium)
    exhibits.push({ title, place, year, medium })
  }
  return { ok: true, value: { recipientName, curatorName, exhibits, hasFinalPhoto: r.hasFinalPhoto === true } }
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const cryptoBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Unbiased base62: bytes >= 248 (62 * 4) are rejected. */
export function randomBase62(length: number, rand: (n: number) => Uint8Array = cryptoBytes): string {
  let out = ''
  while (out.length < length) {
    for (const b of rand(length * 2)) {
      if (b >= 248) continue
      out += B62[b % 62]
      if (out.length === length) break
    }
  }
  return out
}
export const generateSlug = () => randomBase62(10)
export const generateEditKey = () => randomBase62(32)
export const isValidSlug = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z]{10}$/.test(v)
export const isValidEditKey = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z]{32}$/.test(v)

export async function hashEditKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
/** Constant-time compare of the stored hash against hash(key). */
export async function keyMatches(storedHash: string, key: string): Promise<boolean> {
  const h = await hashEditKey(key)
  if (h.length !== storedHash.length) return false
  let diff = 0
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ storedHash.charCodeAt(i)
  return diff === 0
}

export function museumState(row: { status: MuseumStatus; expires_at: string | null }, now: Date): MuseumState {
  if (row.status !== 'live') return 'draft'
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return 'closed'
  return 'open'
}
export const freeExpiry = (now: Date) => new Date(now.getTime() + FREE_DAYS * 86_400_000).toISOString()
export const canPublishFree = (exhibitCount: number) => exhibitCount <= FREE_EXHIBITS

export const photoPath = (museumId: string, position: number) => `${museumId}/${position}.jpg`
export const finalPhotoPath = (museumId: string) => `${museumId}/final.jpg`
export function expectedPhotoPaths(museumId: string, exhibitCount: number, hasFinalPhoto: boolean): string[] {
  const paths = Array.from({ length: exhibitCount }, (_, i) => photoPath(museumId, i))
  if (hasFinalPhoto) paths.push(finalPhotoPath(museumId))
  return paths
}

export interface MuseumPayment { museumId: string; sessionId: string }
export function mapMuseumPayment(event: { type: string; data: { object: Record<string, any> } }): MuseumPayment | null {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return null
  const obj = event.data.object
  if (obj.metadata?.kind !== 'museum') return null
  if (obj.payment_status !== 'paid') return null
  const museumId = obj.metadata?.museum_id
  if (typeof museumId !== 'string' || !museumId) return null
  return { museumId, sessionId: String(obj.id ?? '') }
}
```

- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/museum*.ts && git commit -m "feat(museum): pure shared rules, keys, state, payment mapping"`

---

### Task 2: Client rules (+ sync test with edge)

**Files:**
- Create: `src/lib/museum/rules.ts`
- Test: `src/lib/museum/rules.test.ts`, `src/lib/museum/rules.sync.test.ts`

**Interfaces:**
- Produces: `FREE_EXHIBITS, MAX_EXHIBITS, FREE_DAYS, PRICE_CENTS, PRICE_LABEL, LIMITS`, `type Tier`, `interface DraftExhibit { id: string; title: string; place: string; year: string; medium: string; photo: Blob | null }`, `interface MuseumDraft { recipientName: string; curatorName: string; exhibits: DraftExhibit[]; finalPhoto: Blob | null; updatedAt: number }`, `emptyDraft()`, `newExhibit(id: string, photo: Blob | null)`, `requiredTier(count)`, `draftProblems(d): string[]`, `daysLeft(expiresAt, now): number | null`, `MEDIUM_SUGGESTIONS`, `nextMedium(current)`.

- [ ] **Step 1: Failing tests**

```ts
// rules.test.ts
import { describe, it, expect } from 'vitest'
import { requiredTier, draftProblems, daysLeft, emptyDraft, newExhibit, nextMedium, MEDIUM_SUGGESTIONS, FREE_EXHIBITS, MAX_EXHIBITS } from './rules'

const photo = new Blob(['x'], { type: 'image/jpeg' })
const withExhibits = (n: number) => ({ ...emptyDraft(), recipientName: 'Sam',
  exhibits: Array.from({ length: n }, (_, i) => ({ ...newExhibit(`e${i}`, photo), title: `T${i}` })) })

describe('requiredTier', () => {
  it('free up to the limit, full above', () => {
    expect(requiredTier(FREE_EXHIBITS)).toBe('free')
    expect(requiredTier(FREE_EXHIBITS + 1)).toBe('full')
  })
})
describe('draftProblems', () => {
  it('a complete draft has none', () => expect(draftProblems(withExhibits(2))).toEqual([]))
  it('flags missing name, photos, titles, too many', () => {
    const d = withExhibits(2); d.recipientName = ''; d.exhibits[0].photo = null; d.exhibits[1].title = ' '
    expect(draftProblems(d)).toEqual(['Add the name of the person this museum is for.', 'Exhibit 1 needs a photo.', 'Exhibit 2 needs a title.'])
    expect(draftProblems({ ...emptyDraft(), recipientName: 'Sam' })).toEqual(['Add at least one exhibit.'])
    expect(draftProblems(withExhibits(MAX_EXHIBITS + 1))).toContain(`A museum can hold up to ${MAX_EXHIBITS} exhibits.`)
  })
})
describe('daysLeft', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('null means forever', () => expect(daysLeft(null, now)).toBeNull())
  it('rounds partial days up and floors at 0', () => {
    expect(daysLeft('2026-10-03T13:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-10T12:00:00Z', now)).toBe(7)
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})
describe('nextMedium', () => {
  it('cycles through suggestions', () => {
    expect(nextMedium('')).toBe(MEDIUM_SUGGESTIONS[0])
    expect(nextMedium(MEDIUM_SUGGESTIONS[0])).toBe(MEDIUM_SUGGESTIONS[1])
    expect(nextMedium(MEDIUM_SUGGESTIONS[MEDIUM_SUGGESTIONS.length - 1])).toBe(MEDIUM_SUGGESTIONS[0])
  })
})
```

```ts
// rules.sync.test.ts — client and edge bundles can't share an import; keep them identical.
import { describe, it, expect } from 'vitest'
import * as client from './rules'
import * as edge from '../../../supabase/functions/_shared/museum'

describe('museum rules stay in sync (client vs edge)', () => {
  it('limits and price match', () => {
    expect(client.FREE_EXHIBITS).toBe(edge.FREE_EXHIBITS)
    expect(client.MAX_EXHIBITS).toBe(edge.MAX_EXHIBITS)
    expect(client.FREE_DAYS).toBe(edge.FREE_DAYS)
    expect(client.PRICE_CENTS).toBe(edge.PRICE_CENTS)
    expect(client.LIMITS).toEqual(edge.LIMITS)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.** `npx vitest run src/lib/museum`
- [ ] **Step 3: Implement `rules.ts`**

```ts
// Museum of You rules for the client (pure). NOTE: limits/price duplicated in
// supabase/functions/_shared/museum.ts; rules.sync.test.ts keeps them equal.

export const FREE_EXHIBITS = 3
export const MAX_EXHIBITS = 20
export const FREE_DAYS = 7
export const PRICE_CENTS = 399
export const PRICE_LABEL = '$3.99'
export const LIMITS = { name: 40, title: 80, place: 60, year: 20, medium: 100 } as const

export type Tier = 'free' | 'full'

export interface DraftExhibit { id: string; title: string; place: string; year: string; medium: string; photo: Blob | null }
export interface MuseumDraft { recipientName: string; curatorName: string; exhibits: DraftExhibit[]; finalPhoto: Blob | null; updatedAt: number }

export const emptyDraft = (): MuseumDraft => ({ recipientName: '', curatorName: '', exhibits: [], finalPhoto: null, updatedAt: Date.now() })
export const newExhibit = (id: string, photo: Blob | null): DraftExhibit => ({ id, title: '', place: '', year: '', medium: '', photo })
export const requiredTier = (exhibitCount: number): Tier => (exhibitCount > FREE_EXHIBITS ? 'full' : 'free')

export function draftProblems(d: MuseumDraft): string[] {
  const problems: string[] = []
  if (!d.recipientName.trim()) problems.push('Add the name of the person this museum is for.')
  if (d.exhibits.length === 0) problems.push('Add at least one exhibit.')
  if (d.exhibits.length > MAX_EXHIBITS) problems.push(`A museum can hold up to ${MAX_EXHIBITS} exhibits.`)
  d.exhibits.forEach((e, i) => {
    if (!e.photo) problems.push(`Exhibit ${i + 1} needs a photo.`)
    if (!e.title.trim()) problems.push(`Exhibit ${i + 1} needs a title.`)
  })
  return problems
}

/** Whole days until expiry, rounded up; 0 once closed; null = open forever. */
export function daysLeft(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000))
}

export const MEDIUM_SUGGESTIONS = [
  'bad decisions, one shared umbrella',
  'flour, a smoke alarm, optimism',
  'two aux cords, zero compromise',
  'one borrowed jacket, perfect timing',
  'cold coffee and a very long walk',
  'inside jokes nobody else gets',
  'a wrong turn that turned out right',
  'sunscreen, sand, no regrets',
]
export function nextMedium(current: string): string {
  const i = MEDIUM_SUGGESTIONS.indexOf(current)
  return MEDIUM_SUGGESTIONS[(i + 1) % MEDIUM_SUGGESTIONS.length]
}
```

- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(museum): client rules + client/edge sync test`

---

### Task 3: Database migration + docs

**Files:**
- Create: `supabase/migrations/0005_museums.sql`
- Modify: `supabase/schema.sql` (append same objects), `DATABASE.md` (tables + storage + migration row)

- [ ] **Step 1: Write migration**

```sql
-- Museum of You: gift museums built without an account. Only edge functions
-- (service role) read or write these; RLS is on with no client policies.
CREATE TABLE IF NOT EXISTS public.museums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[0-9A-Za-z]{10}$'),
  edit_key_hash text NOT NULL CHECK (edit_key_hash ~ '^[0-9a-f]{64}$'),
  recipient_name text NOT NULL CHECK (char_length(recipient_name) BETWEEN 1 AND 40),
  curator_name text CHECK (curator_name IS NULL OR char_length(curator_name) <= 40),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'full')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  exhibit_count int NOT NULL CHECK (exhibit_count BETWEEN 1 AND 20),
  has_final_photo boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at timestamptz,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.museum_exhibits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  museum_id uuid NOT NULL REFERENCES public.museums(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position BETWEEN 0 AND 19),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  place text CHECK (place IS NULL OR char_length(place) <= 60),
  year text CHECK (year IS NULL OR char_length(year) <= 20),
  medium text CHECK (medium IS NULL OR char_length(medium) <= 100),
  UNIQUE (museum_id, position)
);

ALTER TABLE public.museums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.museum_exhibits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: anon/authenticated clients get nothing.

-- Private bucket. Uploads use signed upload URLs and reads use short-lived
-- signed URLs, both minted by edge functions, so no storage policies are added.
INSERT INTO storage.buckets (id, name, public)
VALUES ('museums', 'museums', false)
ON CONFLICT (id) DO UPDATE SET public = false;
```

- [ ] **Step 2:** Append the same block to `supabase/schema.sql` under a `-- Museum of You` header. Add `museums`, `museum_exhibits`, bucket `museums`, and migration `0005_museums.sql` rows to `DATABASE.md`.
- [ ] **Step 3: Commit** — `feat(museum): museums + museum_exhibits tables, private bucket`

---

### Task 4: Edge functions (create / publish / get / delete)

**Files:**
- Create: `supabase/functions/_shared/http.ts`, `supabase/functions/museum-create/index.ts`, `supabase/functions/museum-publish/index.ts`, `supabase/functions/museum-get/index.ts`, `supabase/functions/museum-delete/index.ts`
- Modify: `API_MAP.md`, `DEVELOPER_GUIDE.md` (deploy commands, `PUBLIC_SITE_URL` secret)

**Interfaces (HTTP, all POST JSON, CORS like `delete-account`):**
- `museum-create` ← `{ recipientName, curatorName?, exhibits: [{title, place?, year?, medium?}], hasFinalPhoto }` → 200 `{ slug, editKey, uploads: [{ path, token }] }` | 400 `{ error }`
- `museum-publish` ← `{ slug, editKey, tier: 'free'|'full' }` → 200 `{ state: 'open', tier, expiresAt }` | 200 `{ checkoutUrl }` | 400/404/409 `{ error }`
- `museum-get` ← `{ slug, editKey? }` → 200 `{ state: 'open', recipientName, curatorName, branded, exhibits: [{title,place,year,medium,photoUrl}], finalPhotoUrl, owner? }` | 200 `{ state: 'closed', recipientName, curatorName, owner? }` | 200 `{ state: 'draft', owner }` (owner only) | 404 `{ state: 'missing' }`. `owner = { tier, status, expiresAt, publishedAt, exhibitCount }`.
- `museum-delete` ← `{ slug, editKey }` → 200 `{ deleted: true }` | 404

- [ ] **Step 1: `_shared/http.ts`**

```ts
// Shared CORS + JSON helpers for browser-called edge functions.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try { const v = await req.json(); return v && typeof v === 'object' ? v as Record<string, unknown> : null } catch { return null }
}
/** Handles OPTIONS and non-POST; returns a Response to send, or null to continue. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  return null
}
```

- [ ] **Step 2: `museum-create/index.ts`**

```ts
// Creates a draft museum and returns its secret edit key plus signed upload
// URLs for each photo. The key is shown once; only its SHA-256 is stored.
// Deploy: supabase functions deploy museum-create
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { expectedPhotoPaths, generateEditKey, generateSlug, hashEditKey, validateMuseumInput } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req); if (early) return early
  const parsed = validateMuseumInput(await readJson(req))
  if (!parsed.ok) return json(400, { error: parsed.error })
  const m = parsed.value

  const editKey = generateEditKey()
  const editKeyHash = await hashEditKey(editKey)
  let museum: { id: string; slug: string } | null = null
  for (let attempt = 0; attempt < 3 && !museum; attempt++) {
    const { data, error } = await admin.from('museums').insert({
      slug: generateSlug(), edit_key_hash: editKeyHash, recipient_name: m.recipientName,
      curator_name: m.curatorName, exhibit_count: m.exhibits.length, has_final_photo: m.hasFinalPhoto,
    }).select('id, slug').single()
    if (!error) museum = data
    else if (error.code !== '23505') { // anything but a slug collision
      console.error('museum-create insert failed', { error: error.message })
      return json(500, { error: 'Could not create the museum. Try again.' })
    }
  }
  if (!museum) return json(500, { error: 'Could not create the museum. Try again.' })

  const fail = async (msg: string, detail: string) => {
    console.error('museum-create failed', { museumId: museum!.id, detail })
    await admin.from('museums').delete().eq('id', museum!.id)
    return json(500, { error: msg })
  }
  const { error: exErr } = await admin.from('museum_exhibits')
    .insert(m.exhibits.map((e, position) => ({ museum_id: museum!.id, position, ...e })))
  if (exErr) return fail('Could not save the exhibits. Try again.', exErr.message)

  const uploads: { path: string; token: string }[] = []
  for (const path of expectedPhotoPaths(museum.id, m.exhibits.length, m.hasFinalPhoto)) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return fail('Could not prepare photo uploads. Try again.', error?.message ?? 'no data')
    uploads.push({ path, token: data.token })
  }
  return json(200, { slug: museum.slug, editKey, uploads })
})
```

- [ ] **Step 3: `museum-publish/index.ts`**

```ts
// Opens a museum. tier 'free': live for FREE_DAYS (only if <= FREE_EXHIBITS and
// not already live, so the free window can't be renewed). tier 'full': returns
// a Stripe Checkout URL; stripe-webhook flips it to full + open forever.
// Deploy: supabase functions deploy museum-publish
import Stripe from 'npm:stripe@^17'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import {
  FREE_EXHIBITS, MAX_EXHIBITS, PRICE_CENTS, PRICE_CURRENCY, canPublishFree, expectedPhotoPaths, freeExpiry,
  isValidEditKey, isValidSlug, keyMatches, museumState,
} from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const SITE = (Deno.env.get('PUBLIC_SITE_URL') || 'https://shotpolish.org').replace(/\/+$/, '')
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req); if (early) return early
  const body = await readJson(req)
  const { slug, editKey, tier } = body ?? {}
  if (!isValidSlug(slug) || !isValidEditKey(editKey) || (tier !== 'free' && tier !== 'full')) {
    return json(400, { error: 'Invalid request.' })
  }
  const { data: museum } = await admin.from('museums')
    .select('id, edit_key_hash, tier, status, exhibit_count, has_final_photo, expires_at')
    .eq('slug', slug).maybeSingle()
  if (!museum || !(await keyMatches(museum.edit_key_hash, editKey))) return json(404, { error: 'Museum not found.' })

  const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(museum.id, { limit: MAX_EXHIBITS + 5 })
  const have = new Set((files ?? []).map((f) => `${museum.id}/${f.name}`))
  const missing = expectedPhotoPaths(museum.id, museum.exhibit_count, museum.has_final_photo).filter((p) => !have.has(p))
  if (listErr || missing.length) return json(409, { error: 'Some photos are still uploading. Try again in a moment.' })

  if (museum.tier === 'full') return json(200, { state: 'open', tier: 'full', expiresAt: null })

  if (tier === 'free') {
    if (!canPublishFree(museum.exhibit_count)) return json(400, { error: `Free museums hold up to ${FREE_EXHIBITS} exhibits.` })
    if (museum.status === 'live') {
      return json(200, { state: museumState(museum, new Date()), tier: 'free', expiresAt: museum.expires_at })
    }
    const now = new Date()
    const expiresAt = freeExpiry(now)
    const { error } = await admin.from('museums').update({
      status: 'live', published_at: now.toISOString(), expires_at: expiresAt, updated_at: now.toISOString(),
    }).eq('id', museum.id)
    if (error) { console.error('museum-publish update failed', { museumId: museum.id, error: error.message }); return json(500, { error: 'Could not open the museum. Try again.' }) }
    return json(200, { state: 'open', tier: 'free', expiresAt })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: PRICE_CURRENCY, unit_amount: PRICE_CENTS,
          product_data: { name: 'Museum of You: full museum', description: `Up to ${MAX_EXHIBITS} exhibits, open forever.` },
        },
      }],
      metadata: { kind: 'museum', museum_id: museum.id },
      success_url: `${SITE}/museum/manage/${slug}?paid=1`,
      cancel_url: `${SITE}/museum/manage/${slug}?canceled=1`,
    })
    await admin.from('museums').update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', museum.id)
    return json(200, { checkoutUrl: session.url })
  } catch (err) {
    console.error('museum-publish checkout failed', { museumId: museum.id, error: (err as Error).message })
    return json(502, { error: 'Payments are unavailable right now. Try again in a minute.' })
  }
})
```

- [ ] **Step 4: `museum-get/index.ts`**

```ts
// Public read of a museum by slug. Photos come back as 1-hour signed URLs and
// only while the museum is open. A valid editKey adds owner fields (used by
// the manage page), including for drafts and closed museums.
// Deploy: supabase functions deploy museum-get
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { finalPhotoPath, isValidEditKey, isValidSlug, keyMatches, museumState, photoPath } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'
const URL_TTL = 3600

Deno.serve(async (req) => {
  const early = preflight(req); if (early) return early
  const body = await readJson(req)
  const slug = body?.slug, editKey = body?.editKey
  if (!isValidSlug(slug)) return json(404, { state: 'missing' })
  const { data: row } = await admin.from('museums')
    .select('id, edit_key_hash, recipient_name, curator_name, tier, status, exhibit_count, has_final_photo, published_at, expires_at')
    .eq('slug', slug).maybeSingle()
  if (!row) return json(404, { state: 'missing' })

  const isOwner = isValidEditKey(editKey) && await keyMatches(row.edit_key_hash, editKey)
  const state = museumState(row, new Date())
  const owner = isOwner ? { owner: { tier: row.tier, status: row.status, expiresAt: row.expires_at, publishedAt: row.published_at, exhibitCount: row.exhibit_count } } : {}
  const names = { recipientName: row.recipient_name, curatorName: row.curator_name }

  if (state === 'draft') return isOwner ? json(200, { state, ...names, ...owner }) : json(404, { state: 'missing' })
  if (state === 'closed') return json(200, { state, ...names, ...owner })

  const { data: exhibits, error: exErr } = await admin.from('museum_exhibits')
    .select('position, title, place, year, medium').eq('museum_id', row.id).order('position')
  if (exErr || !exhibits) return json(500, { error: 'Could not load this museum. Refresh to try again.' })
  const paths = exhibits.map((e) => photoPath(row.id, e.position))
  if (row.has_final_photo) paths.push(finalPhotoPath(row.id))
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrls(paths, URL_TTL)
  if (signErr || !signed) return json(500, { error: 'Could not load the photos. Refresh to try again.' })
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]))

  return json(200, {
    state, ...names, branded: row.tier === 'free',
    exhibits: exhibits.map((e) => ({ title: e.title, place: e.place, year: e.year, medium: e.medium, photoUrl: urlFor.get(photoPath(row.id, e.position)) ?? '' })),
    finalPhotoUrl: row.has_final_photo ? urlFor.get(finalPhotoPath(row.id)) ?? null : null,
    ...owner,
  })
})
```

- [ ] **Step 5: `museum-delete/index.ts`**

```ts
// Permanently deletes a museum (rows + photos). Requires the edit key.
// Deploy: supabase functions deploy museum-delete
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { isValidEditKey, isValidSlug, keyMatches } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req); if (early) return early
  const body = await readJson(req)
  const slug = body?.slug, editKey = body?.editKey
  if (!isValidSlug(slug) || !isValidEditKey(editKey)) return json(404, { error: 'Museum not found.' })
  const { data: row } = await admin.from('museums').select('id, edit_key_hash').eq('slug', slug).maybeSingle()
  if (!row || !(await keyMatches(row.edit_key_hash, editKey))) return json(404, { error: 'Museum not found.' })

  const { data: files } = await admin.storage.from(BUCKET).list(row.id, { limit: 100 })
  if (files?.length) {
    const { error } = await admin.storage.from(BUCKET).remove(files.map((f) => `${row.id}/${f.name}`))
    if (error) { console.error('museum-delete storage failed', { museumId: row.id, error: error.message }); return json(500, { error: 'Could not delete the photos. Try again.' }) }
  }
  const { error } = await admin.from('museums').delete().eq('id', row.id)
  if (error) { console.error('museum-delete row failed', { museumId: row.id, error: error.message }); return json(500, { error: 'Could not delete the museum. Try again.' }) }
  return json(200, { deleted: true })
})
```

- [ ] **Step 6:** Document the four functions + `PUBLIC_SITE_URL` in `API_MAP.md`; add deploy commands to `DEVELOPER_GUIDE.md`.
- [ ] **Step 7: Commit** — `feat(museum): create/publish/get/delete edge functions`

(No Deno runtime locally: correctness rests on the Vitest-covered `_shared/museum.ts`; the user runs the post-deploy smoke test in the spec §10.)

---

### Task 5: Stripe webhook museum branch

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts` (after dedupe insert, before `mapStripeEvent`)
- Test: `supabase/functions/_shared/mapStripeEvent.test.ts` (add case)

- [ ] **Step 1: Failing test** (append to `mapStripeEvent.test.ts`)

```ts
it('ignores museum checkout sessions (handled by mapMuseumPayment)', () => {
  expect(mapStripeEvent({ id: 'e', type: 'checkout.session.completed',
    data: { object: { id: 'cs', payment_status: 'paid', metadata: { kind: 'museum', museum_id: 'm1' } } } })).toBeNull()
})
```
Run → PASS already (no `client_reference_id`) — this locks the behavior so a future change can't route museum payments into plan updates.

- [ ] **Step 2: Webhook branch**

```ts
import { mapMuseumPayment } from '../_shared/museum.ts'
// ...after the stripe_events dedupe insert:
  const museumPayment = mapMuseumPayment(event as any)
  if (museumPayment) {
    const now = new Date().toISOString()
    const { error: museumError } = await supabase.from('museums')
      .update({ tier: 'full', status: 'live', expires_at: null, stripe_session_id: museumPayment.sessionId, updated_at: now })
      .eq('id', museumPayment.museumId)
    if (museumError) {
      await supabase.from('stripe_events').delete().eq('id', event.id)
      console.error('stripe-webhook museum update failed', { eventId: event.id, museumId: museumPayment.museumId, error: museumError.message })
      return new Response('Update failed', { status: 500 })
    }
    // Keep the original publish date if it was already open for free.
    await supabase.from('museums').update({ published_at: now }).eq('id', museumPayment.museumId).is('published_at', null)
    return new Response(JSON.stringify({ received: true, museum: true }), { status: 200 })
  }
```
Add `checkout.session.async_payment_succeeded` to the webhook endpoint's events (doc note).

- [ ] **Step 3:** `npx vitest run supabase` → PASS. Update `API_MAP.md` event table.
- [ ] **Step 4: Commit** — `feat(museum): stripe-webhook unlocks full museums`

---

### Task 6: Client libs (image, draft store, api, share card, samples)

**Files:**
- Create: `src/lib/museum/image.ts` (+ `image.test.ts`), `src/lib/museum/draftStore.ts`, `src/lib/museum/api.ts`, `src/lib/museum/shareCard.ts`, `src/lib/museum/samples.ts`

**Interfaces:**
- `image.ts`: `MAX_EDGE = 1600`; `fitWithin(w, h, max?) → {width, height}`; `coverCrop(sw, sh, dw, dh) → {sx, sy, sw, sh}`; `prepareImage(file: Blob) → Promise<Blob>` (JPEG q0.85, EXIF stripped, errors with user-facing messages); `loadImageEl(src: string) → Promise<HTMLImageElement>` (sets `crossOrigin='anonymous'`).
- `draftStore.ts`: `loadDraft() → Promise<MuseumDraft|null>`, `saveDraft(d) → Promise<void>`, `clearDraft()`; `SavedMuseum {slug, editKey, recipientName, createdAt}`; `listMyMuseums()`, `rememberMuseum(m)`, `forgetMuseum(slug)`, `findEditKey(slug) → string|null` (localStorage `museum-of-you:mine`, try/catch everywhere).
- `api.ts`: `ViewerExhibit {title, place, year, medium, photoUrl}`, `ViewerMuseum {recipientName, curatorName, branded, exhibits, finalPhotoUrl}`, `OwnerInfo {tier, status, expiresAt, publishedAt, exhibitCount}`, `GetMuseumResult` union (`open` with `museum` / `closed` / `draft` / `missing`, each with optional `owner`), `MuseumApiError(message, status?)`, `publishingEnabled`, `createMuseum(draft) → {slug, editKey, uploads}`, `uploadPhotos(uploads, blobs, onProgress(done,total))` (2 retries per file, `upsert: true`), `publishMuseum(slug, key, tier) → {state, tier, expiresAt} | {checkoutUrl}`, `getMuseum(slug, key?)`, `deleteMuseum(slug, key)`.
- `shareCard.ts`: `renderShareCard(portrait: CanvasImageSource, pw: number, ph: number, recipientName: string, branded: boolean) → HTMLCanvasElement` (1080×1350, layout ported from prototype `renderShareCard`); `canvasToBlob(c) → Promise<Blob>`.
- `samples.ts`: painters ported from prototype (`paintLisbon`, `paintPancakes`, `paintRoad`, `paintRooftop`) and `exampleMuseum() → ViewerMuseum` (data URLs, recipient "Sam", curator "Alex", `branded: true`).

- [ ] **Step 1: Failing test** (`image.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { fitWithin, coverCrop, MAX_EDGE } from './image'

describe('fitWithin', () => {
  it('keeps small images', () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }))
  it('scales the long edge to MAX_EDGE', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_EDGE, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: MAX_EDGE })
  })
})
describe('coverCrop', () => {
  it('crops the sides of a wide source', () => expect(coverCrop(2000, 1000, 400, 500)).toEqual({ sx: 600, sy: 0, sw: 800, sh: 1000 }))
  it('crops top/bottom of a tall source', () => expect(coverCrop(1000, 2000, 400, 500)).toEqual({ sx: 0, sy: 375, sw: 1000, sh: 1250 }))
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the five modules per the interfaces. **Step 4:** Run → PASS; `npx tsc --noEmit` shows only the 2 pre-existing errors.
- [ ] **Step 5: Commit** — `feat(museum): client libs (image prep, drafts, api, share card, samples)`

---

### Task 7: Viewer (ticket, swipe gallery, final room, gift shop) + example route

**Files:**
- Create: `src/components/museum/museum.css`, `src/components/museum/useMuseumFonts.ts`, `src/components/museum/Ticket.tsx`, `src/components/museum/Plaque.tsx`, `src/components/museum/Gallery.tsx`, `src/components/museum/FinalRoom.tsx`, `src/components/museum/GiftShop.tsx`, `src/components/museum/MuseumViewer.tsx`, `src/pages/MuseumViewerPage.tsx`
- Modify: `src/App.tsx` (lazy routes `/m/:slug`, `/museum/example`), `src/lib/analytics.ts` (museum events)

**Contracts:**
- `MuseumViewer({ museum: ViewerMuseum, mode: 'live'|'preview'|'example', onClose?: () => void })`. Phases: `ticket` → `gallery`. Gift shop opens 2.8s after reveal (400ms with reduced motion).
- `Ticket({ recipientName, curatorName, roomCount, onEnter })`: prototype markup/CSS ("Admit one" stub, "The Museum of {name} · Opening night", "A private exhibition curated by {curator}" or "A private exhibition", row: `No. 000427`-style number derived from name hash, today's date `3 Oct 2026` format, `{n} rooms`).
- `Gallery`: horizontal scroll-snap track; rooms = exhibits + final; per-frame transforms via refs in one rAF (no React state per scroll frame); `lit` class within |p|<0.35 after enter; prev/next buttons + ←/→ keys; pointer/deviceorientation tilt sets `--tx/--ty` on the stage; reduced motion disables transforms.
- `Plaque({ index, exhibit })` and final plaque variants ("Reserved / Medium: to be revealed" → "The Masterpiece / {name}, {year} / Medium: priceless. On permanent display.").
- `FinalRoom({ recipientName, finalPhotoUrl, onReveal(portrait: HTMLCanvasElement, source: 'camera'|'photo'|'upload') })`: "Step closer" → `getUserMedia({ video: { facingMode: 'user' }, audio: false })` → mirrored `<video playsInline muted autoPlay>` inside the void → "Take my portrait" captures a mirrored still → stop tracks → reveal (develop animation). On error/unsupported: if `finalPhotoUrl` → load (crossOrigin) and reveal with source `photo`; else show "Choose a photo" file input → source `upload`. Stops camera on unmount.
- `GiftShop({ recipientName, portrait, branded, mode, onAgain })`: renders share card → object URL `<img>`; **Share** (only if `navigator.canShare?.({ files: [file] })`) → `navigator.share({ files, title })`; **Save image** → `<a download="museum-masterpiece.jpg">`; **Build a museum for someone** → `/museum/new` (tracks `museum_build_own_clicked`); **Walk through again**.
- `MuseumViewerPage`: `/m/:slug` → `getMuseum(slug)`; states loading ("Opening the doors…"), `open` → viewer, `closed` → closed page copy from spec §6, `missing`/`draft` → "This museum doesn't exist" + "Build your own museum"; publishing disabled → same missing copy. `/museum/example` → `exampleMuseum()` with an "Example museum" ribbon linking to `/museum/new`.
- Styles: port prototype tokens/CSS for room, wall, floor, lamp, pool, beam, frame, mat, art/void, plaque, ticket, sheet, toast under `.mu` scope; `.mu` sets its own background/colors so ShotPolish light styles don't bleed in. Fonts via `useMuseumFonts()` (adds `<link id="museum-fonts">` for Cormorant Garamond 500/600/500i + Jost 400/500/600 once).

- [ ] Steps: implement; `npx tsc --noEmit`; dev server check of `/museum/example` at 375×812 and desktop: ticket → swipe 5 rooms → final room (camera denied path → upload) → gift shop. Commit `feat(museum): recipient viewer with Masterpiece finale + example museum`.

---

### Task 8: Builder (`/museum/new`)

**Files:**
- Create: `src/components/museum/ExhibitEditor.tsx`, `src/components/museum/PublishSheet.tsx`, `src/pages/MuseumBuilderPage.tsx`
- Modify: `src/App.tsx` (lazy route)

**Contracts:**
- Loads draft from IndexedDB on mount; debounced (600ms) `saveDraft` on change; object URLs per exhibit id revoked on change/unmount.
- Sections: "Who is this museum for?" (recipient, required, max 40) + "Curated by" (optional); Exhibits (cards: thumbnail, Title*, Place, Year, Medium with **Suggest** = `nextMedium`, move up/down, remove); **Add photos** (multiple, `prepareImage` each, cap at `MAX_EXHIBITS` with message); counter "N of 3 free" / "N exhibits · full museum ({PRICE_LABEL})" and the note at N > 3: "Museums with more than 3 exhibits are {PRICE_LABEL} to open, paid once. You can keep building."; Final room: explanation + optional photo of the recipient ("Used if they don't allow the camera"); actions **Preview** (full-screen `MuseumViewer mode="preview"` from draft object URLs, close button) and **Open the museum** (disabled with `draftProblems` list shown when not ready).
- `PublishSheet({ draft, onDone(slug) })`: options Free (only if `requiredTier === 'free'`: "Free · open 7 days · up to 3 exhibits") and Full ("{PRICE_LABEL} once · open forever · up to 20 exhibits"); progress text "Creating your museum…" → "Hanging photos (n of m)…" → "Opening the doors…"; free → `rememberMuseum` → `clearDraft` → navigate `/museum/manage/:slug`; full → `rememberMuseum` → `clearDraft` → `window.location.assign(checkoutUrl)`; errors inline with Retry; `publishingEnabled === false` → "Publishing isn't switched on yet. Your draft is saved on this device."
- Analytics: `museum_builder_started` (once per mount), `museum_exhibit_added{count}`, `museum_preview_opened`, `museum_publish_clicked{tier}`, `museum_published{tier}`, `museum_checkout_started`.

- [ ] Steps: implement; tsc; dev-server check (add 4 photos, see paywall note, preview, reload keeps draft, publish shows "not switched on" without env). Commit `feat(museum): builder with drafts, preview, publish flow`.

---

### Task 9: Manage page (`/museum/manage/:slug`)

**Files:** Create `src/pages/MuseumManagePage.tsx`; modify `src/App.tsx`.

**Contracts:**
- Key source: `#k=<key>` hash (then `rememberMuseum` and strip hash via `history.replaceState`) else `findEditKey(slug)`. No key → "Open this page from the device you built it on, or use your private manage link."
- `getMuseum(slug, key)` → status pill: "Open · closes in N days" / "Open forever" / "Waiting for payment" / "Closed". Shows recipient link `https://<host>/m/<slug>` with **Copy** (clipboard, fallback select) and **Share** (Web Share text+url when available); private manage link `…/museum/manage/<slug>#k=<key>` with Copy and the line "Keep this link private. It lets you manage or delete the museum."
- `?paid=1`: poll `getMuseum` every 2s up to 30s until `owner.tier === 'full'` → "Your museum is open forever." / timeout copy from spec §7; track `museum_paid_confirmed` once. `?canceled=1`: "Payment canceled. Your museum is saved." Clear query after handling.
- **Open forever for {PRICE_LABEL}** when tier free (any state) → `publishMuseum(slug, key, 'full')` → redirect. If draft and `exhibitCount <= 3` also **Open free for 7 days**.
- **Delete museum**: two-step inline confirm ("Delete forever" / "Keep it") → `deleteMuseum` → `forgetMuseum` → "Deleted. The link no longer works." + "Build a new museum".

- [ ] Steps: implement; tsc; commit `feat(museum): manage page (link, status, upgrade, delete)`.

---

### Task 10: Landing, hub card, routing entry, OG, privacy

**Files:**
- Create: `src/pages/MuseumLandingPage.tsx`, `src/components/MuseumPromo.tsx`, `museum.html`, `public/museum-og.png`
- Modify: `src/pages/HomePage.tsx` (insert `<MuseumPromo />` after `<HeroSection />`), `src/App.tsx` (lazy `/museum`), `vite.config.ts` (`build.rollupOptions.input { main: 'index.html', museum: 'museum.html' }`), `vercel.json` + `public/_redirects` (`/m/*`, `/museum`, `/museum/*` → `/museum.html` before the catch-all), `src/components/LegalPages.tsx` (Museum of You privacy section), `PROJECT_MAP.md`, `CLAUDE.md` (map line).

**Contracts:**
- Landing (dark museum styling): headline "Build a museum about someone you love."; sub "Hang your photos in a softly lit gallery, write the plaques, and send them a ticket. The last room is a surprise."; CTAs **Build a museum** (`/museum/new`) and **See an example** (`/museum/example`); 3 steps (Hang your photos · Write the plaques · Send the ticket); pricing line "Free for up to 3 exhibits (open 7 days). {PRICE_LABEL} once for up to 20, open forever."; privacy line "No account needed. Photos are private to your link, and you can delete them anytime."
- `MuseumPromo`: light ShotPolish card: eyebrow "New from ShotPolish", title "Museum of You", line "Turn your photos into a museum about someone you love, then send them the ticket.", link "Build a museum →".
- `museum.html`: copy of `index.html` with title "Museum of You", description "Someone built a museum about you. Tap to enter.", og:title "You're invited to a private exhibition", og:image `https://shotpolish.org/museum-og.png`, plus museum font link with `id="museum-fonts"`.
- `museum-og.png`: 1200×630, gallery green, gold ticket, "ADMIT ONE", "You're invited to a private exhibition", "Museum of You" (generated once with PowerShell System.Drawing).

- [ ] Steps: implement; tsc; `npm run build` succeeds and emits `dist/museum.html`; commit `feat(museum): landing page, homepage card, gift link previews, privacy`.

---

### Task 11: Verification

- [ ] `npx vitest run` → all pass (74 existing + new).
- [ ] `npx tsc --noEmit` → only the 2 pre-existing errors.
- [ ] `npm run build` → success, `dist/museum.html` present.
- [ ] Dev server walkthrough at phone width: `/museum` → example → builder (4 photos, paywall note, preview incl. final room upload path, gift shop) → homepage card.
- [ ] Hand the user the deploy checklist: `supabase db push`, deploy 4 functions + webhook, secrets (`STRIPE_SECRET_KEY` test, `PUBLIC_SITE_URL`), Stripe webhook events (`checkout.session.completed`, `checkout.session.async_payment_succeeded`), Vercel env `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, smoke test.
