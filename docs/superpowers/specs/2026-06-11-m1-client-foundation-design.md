# M1 — Client Foundation (hero handoff · watermark flag · GIF worker)

**Date:** 2026-06-11
**Status:** Approved scope, pre-implementation

## Context

ShotPolish today is a 100% client-side React 18 + Vite + TypeScript + Tailwind app.
There is **no backend** — no Supabase, no auth, no `profiles`/`brand_kits`, no Edge
Functions. Persistence is local IndexedDB ([workspaceStore.ts](../../../src/lib/workspaceStore.ts)).
The production implementation plan (`shotpolish-implementation-plan.md`) assumes a
Supabase stack that does not exist; that backend foundation is real future work but is
**out of scope here** and blocked on external account creation (Supabase, Stripe).

This spec covers the subset of plan-module **M1** that needs no backend and no accounts.
The reducer refactor (49 `useState` → `editorReducer`) is **explicitly deferred** until
M6 (draft engine) actually needs to drive editor state — it is high-risk, regression-prone,
and has no user-visible payoff today.

## Goals

Three independent, shippable changes:

### 1. Hero → editor file handoff
**Problem:** [HeroSection.tsx](../../../src/components/HeroSection.tsx)'s `UploadDropzone`
collects a dropped `File` then discards it — `handleFile = () => navigate('/editor')`.
The user lands on an empty editor and must re-upload.

**Design:** a tiny module singleton `src/lib/pendingUpload.ts`:
```ts
export function setPendingUpload(file: File): void
export function consumePendingUpload(): File | null  // returns once, then clears
```
- `HeroSection.handleFile(file)` → `setPendingUpload(file); navigate('/editor')`.
- `EditorPage` consumes on mount via `useEffect(() => { const f = consumePendingUpload(); if (f) handleFile(f) }, [])`.
- Module ref chosen over router `state`: `File` survives in-app navigation but not a
  refresh; the singleton makes "consume once then clear" explicit and unit-testable, and
  avoids a stale `File` reappearing on Back navigation.

**Acceptance:** drop/select on the hero dropzone → editor opens with the image already
loaded, zero re-upload. Refreshing `/editor` directly still shows the empty dropzone
(no stale file).

### 2. Watermark as an entitlement flag
**Finding:** the watermark is **already** baked onto the canvas at
[composition.ts:1097-1105](../../../src/lib/composition.ts#L1097-L1105) — drawn on the
canvas itself (uncircumventable in the exported PNG), always on.

**Design:** thread an options object through the render path so a future Pro entitlement
can suppress it, without changing today's behavior:
```ts
renderComposition(ctx, img, theme, doc, L, motionProgress?, opts?: { watermark?: boolean })
// opts.watermark defaults to true → identical to current behavior
```
The watermark draw block becomes `if (opts?.watermark !== false) { ... }`. No auth
exists yet, so every caller leaves it on. M0 will pass `watermark: isPro ? false : true`.

**Acceptance:** default export is byte-for-byte visually unchanged (watermark present);
calling with `{ watermark: false }` produces a clean canvas with no "ShotPolish" pixels.

### 3. GIF encoding off the main thread
**Finding:** the mobile freeze is **GIF-only**. Video export uses `MediaRecorder` +
`canvas.captureStream()`, which already encodes off-thread and requires the DOM canvas —
leave it untouched. GIF's `quantize` / `applyPalette` / `writeFrame`
([motionExport.ts](../../../src/lib/motionExport.ts) `exportMotionGIF`) is synchronous
CPU on the main thread.

**Design:** `src/workers/encode.worker.ts` owns palette + encode. The main thread still
renders each frame (the composition engine needs a DOM canvas), extracts `ImageData`, and
**transfers** the RGBA `ArrayBuffer` to the worker. Worker does
`quantize → applyPalette → gif.writeFrame`, and on `finish` transfers the GIF bytes back.
- Message in: `{ type: 'frame', rgba: ArrayBuffer, width, height, delay, index }` then
  `{ type: 'finish' }`.
- Message out: `{ type: 'progress', written, total }`, `{ type: 'done', gif: ArrayBuffer }`,
  `{ type: 'error', message }`.
- `exportMotionGIF` keeps its existing signature and progress/abort contract; internally it
  posts to the worker instead of encoding inline. Object URLs revoked after use.
- Frame-skipping / dimension caps / memory guard stay on the main thread (unchanged).

**Acceptance:** a 6-slide GIF export on a mid Android phone does not freeze the tab; output
GIF is equivalent to the current encoder; no object-URL or worker leaks across 10 sequential
exports; abort still works mid-encode.

## Testing (vitest)

- `pendingUpload`: set → consume returns the file; second consume returns `null`.
- watermark: render to an offscreen canvas with/without the flag; assert the watermark
  pixel region is non-empty when on and empty when off.
- GIF worker transform: feed known frame buffers, assert a valid GIF byte stream is produced
  and progress messages count correctly. (Worker logic factored so the pure encode step is
  testable without a real `Worker`.)

## Out of scope

Reducer refactor (deferred to pre-M6) · any backend/Supabase/auth · billing/entitlement UI
(M0) · video-export changes.

## Build order

1. Hero handoff (smallest, highest user value)
2. Watermark flag (small, unblocks M0 later)
3. GIF worker (largest of the three)

Each lands independently with its own test and commit.
