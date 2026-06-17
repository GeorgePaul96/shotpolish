# CLAUDE.md — ShotPolish

> Orientation file for AI coding agents. Read this first, then the doc in
> `docs/` matching your task. Goal: understand the project without scanning
> the whole tree. Keep this file under ~150 lines.

## What this is
ShotPolish turns raw product screenshots into polished, on-brand social/launch
assets. Pure client-side SPA (React + Vite + TS) with a thin Supabase backend
(auth, three Postgres tables, two Deno edge functions) and Stripe billing.

## Stack (see package.json — do not guess versions)
- React 18 + react-router-dom 7, Vite 5, TypeScript 5, Tailwind 3
- Supabase JS 2 (auth + Postgres), Deno edge functions
- Stripe (billing via webhook), framer-motion, gifenc (GIF export)
- Tests: Vitest (`npm test`)

## Commands
- `npm run dev` — local dev server
- `npm run build` — `vite build` + SPA fallback copy (scripts/copy-spa-fallback.mjs)
- `npm test` — Vitest (run mode)
- Edge fns: `supabase functions deploy stripe-webhook | delete-account`

## Map (full detail in PROJECT_MAP.md)
- `src/pages/` — route screens (Home, Editor, StoryMode, BrandKit, Pricing, Account)
- `src/components/` — Navbar, Auth, gating, landing sections, the editor `ShotPolishTool`
- `src/lib/` — pure logic: composition/render, entitlements, export pipeline,
  "grounded" copy/sequencing engines (deterministic, NOT real AI), supabase client
- `src/hooks/` — `useCompositionCanvas`, `useEntitlement`
- `src/workers/` — `encode.worker.ts` (off-thread GIF encode)
- `supabase/` — `schema.sql`, `migrations/`, `functions/`
- `docs/` — reference docs (below) + `docs/superpowers/` historical plans/specs

## Reference docs (read the one matching your task)
- ARCHITECTURE.md — system design, data flow, boundaries, key decisions
- PROJECT_MAP.md — every source file, one line each (find code without scanning)
- DATABASE.md — tables, RLS, triggers, migrations
- API_MAP.md — edge functions, Supabase calls, env vars, Stripe events
- DEVELOPER_GUIDE.md — setup, workflows, conventions, gotchas

## Conventions / gotchas (verified, not assumed)
- The `Plan` union (`'free' | 'pro' | 'ltd'`) is **duplicated** in
  `src/lib/entitlements.ts` and `supabase/functions/_shared/mapStripeEvent.ts`
  because client (Vite) and edge (Deno) can't share an import. Keep them in sync.
- Entitlement logic is centralized and pure in `src/lib/entitlements.ts`. Don't
  scatter plan checks.
- Workspace persistence is **hybrid**: Supabase `workspaces` table when signed
  in, local storage otherwise (`src/lib/workspaceStore.ts`).
- "AI" features (`aiSuggestions`, `contextEngine`, `narrativeSequencing`,
  `captionComposer`, `launchTimeline`, `postingGuide`) are deterministic keyword
  logic — no model calls. Don't add network calls expecting an existing AI layer.
- Security-critical: `delete-account` derives the user id ONLY from the verified
  JWT, never the request body. `stripe-webhook` verifies signatures + dedupes via
  `stripe_events`. Preserve both invariants.
- `src/lib/supabase.ts` falls back to dummy URL/key so the app boots without env
  vars (dev/test). Real values come from `VITE_SUPABASE_*`.

## Large files — read targeted ranges, not whole
These four hold >50% of source LOC. Grep for the symbol, read the range:
- `src/pages/StoryModePage.tsx` (~2090 lines)
- `src/pages/EditorPage.tsx` (~1540 lines)
- `src/components/ShotPolishTool.tsx` (~1200 lines)
- `src/lib/composition.ts` (~1120 lines)

## Don't read (no signal, high token cost)
node_modules, dist, package-lock.json, bundle-stats.html, `*.png` assets,
`.superpowers/` brainstorm artifacts, `update-composition.patch`,
`docs/superpowers/` plans unless doing historical/spec archaeology.
See .claudeignore.
