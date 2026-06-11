# M1 Client Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the no-backend slice of plan-module M1 — fix the hero→editor file handoff, make the canvas watermark an entitlement flag, and move GIF encoding off the main thread.

**Architecture:** Three independent changes, each landing with its own test and commit. A `pendingUpload` module singleton carries the dropped `File` across navigation. `renderComposition` gains a trailing optional `{ watermark }` flag (defaults to current always-on behavior). GIF palette/encode work moves into a Web Worker fed by transferred RGBA buffers; the heavy step is factored into a pure, node-testable `gifEncoder` helper.

**Tech Stack:** React 18 · Vite · TypeScript · vitest (node env) · gifenc · Web Workers (Vite `new Worker(new URL(...), { type: 'module' })`).

---

## File Structure

- `src/lib/pendingUpload.ts` — **new.** Module singleton: `setPendingUpload` / `consumePendingUpload`. One responsibility: hold one pending `File` for one-time consumption.
- `src/lib/pendingUpload.test.ts` — **new.** Unit test for the singleton.
- `src/components/HeroSection.tsx` — **modify.** `handleFile` stores the file then navigates.
- `src/pages/EditorPage.tsx` — **modify.** Consume pending upload on mount.
- `src/lib/composition.ts` — **modify.** Add `RenderOptions`, trailing `opts` param to `renderComposition`, extract `drawWatermark` helper guarded by the flag.
- `src/lib/composition.watermark.test.ts` — **new.** Unit test for `drawWatermark` via a recording mock context (no real canvas; vitest runs in node).
- `src/lib/gifEncoder.ts` — **new.** Pure, stateful GIF encoder wrapping gifenc: `createGifEncoder()` → `{ addFrame, finish }`. Node-testable.
- `src/lib/gifEncoder.test.ts` — **new.** Asserts valid GIF byte stream from known frames.
- `src/workers/encode.worker.ts` — **new.** Thin worker wrapping `createGifEncoder`; receives transferred RGBA frames, posts progress + final bytes.
- `src/lib/motionExport.ts` — **modify.** `exportMotionGIF` keeps its signature/abort/progress contract but posts frames to the worker instead of encoding inline.

---

## Task 1: Hero → editor file handoff

**Files:**
- Create: `src/lib/pendingUpload.ts`
- Create: `src/lib/pendingUpload.test.ts`
- Modify: `src/components/HeroSection.tsx`
- Modify: `src/pages/EditorPage.tsx:770-777`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pendingUpload.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingUpload, consumePendingUpload } from './pendingUpload'

// A minimal stand-in for File — we only need object identity, not real File APIs.
const fakeFile = (name: string) => ({ name }) as unknown as File

describe('pendingUpload', () => {
  beforeEach(() => { consumePendingUpload() }) // clear any leftover state

  it('returns null when nothing is pending', () => {
    expect(consumePendingUpload()).toBeNull()
  })

  it('returns the file once, then null', () => {
    const f = fakeFile('shot.png')
    setPendingUpload(f)
    expect(consumePendingUpload()).toBe(f)
    expect(consumePendingUpload()).toBeNull()
  })

  it('keeps only the most recent pending file', () => {
    const a = fakeFile('a.png')
    const b = fakeFile('b.png')
    setPendingUpload(a)
    setPendingUpload(b)
    expect(consumePendingUpload()).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pendingUpload.test.ts`
Expected: FAIL — cannot find module `./pendingUpload`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/pendingUpload.ts`:

```ts
// Carries a single dropped/selected File from the landing hero to the editor
// across an in-app navigation. Deliberately ephemeral: a File survives a
// route change but not a page refresh, so consuming it once and clearing it
// makes the "polish this, then forget it" semantics explicit and testable.

let pending: File | null = null

export function setPendingUpload(file: File): void {
  pending = file
}

export function consumePendingUpload(): File | null {
  const f = pending
  pending = null
  return f
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pendingUpload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the hero to store the file before navigating**

In `src/components/HeroSection.tsx`, add the import near the existing imports:

```tsx
import { setPendingUpload } from '../lib/pendingUpload'
```

Replace the existing `handleFile` inside `HeroSection`:

```tsx
  const handleFile = () => {
    navigate('/editor')
  }
```

with:

```tsx
  const handleFile = (file: File) => {
    setPendingUpload(file)
    navigate('/editor')
  }
```

(The `UploadDropzone` already calls `onFile(file)` with the `File`; this just stops discarding it.)

- [ ] **Step 6: Consume the pending file when the editor mounts**

In `src/pages/EditorPage.tsx`, add the import near the top imports (alongside the other `../lib/...` imports, e.g. after line 16):

```tsx
import { consumePendingUpload } from '../lib/pendingUpload'
```

Then, immediately after the existing file-handling block (the `useEffect` cleanup at line 777 that revokes `imageUrl`), add a mount-only effect:

```tsx
  // Consume a file handed off from the landing hero (one-time, cleared on read).
  useEffect(() => {
    const file = consumePendingUpload()
    if (file) handleFile(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

`handleFile` is defined just above (line 770) via `useCallback`, so it is in scope. The empty dependency array runs this once on mount; `consumePendingUpload` clears the singleton so a later remount or refresh shows the empty dropzone.

- [ ] **Step 7: Verify build + manual smoke**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, open the landing page, drop an image on the hero dropzone.
Expected: editor opens with the image already loaded — no second upload prompt. Then refresh `/editor` directly → empty dropzone (no stale image).

- [ ] **Step 8: Commit**

```bash
git add src/lib/pendingUpload.ts src/lib/pendingUpload.test.ts src/components/HeroSection.tsx src/pages/EditorPage.tsx
git commit -m "feat(M1): hand dropped hero file to editor via pendingUpload singleton"
```

---

## Task 2: Watermark as an entitlement flag

**Files:**
- Modify: `src/lib/composition.ts:807-816` (signature), `:1097-1105` (watermark block)
- Create: `src/lib/composition.watermark.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/composition.watermark.test.ts`. It tests the extracted `drawWatermark` helper with a recording mock context — vitest runs in `node`, so there is no real canvas; we assert the draw decision, not pixels.

```ts
import { describe, it, expect } from 'vitest'
import { drawWatermark } from './composition'
import type { Rect } from './composition'

// Records which 2D-context methods were called. Only the members drawWatermark
// touches are implemented.
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillText: (t: string) => calls.push(`fillText:${t}`),
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set fillStyle(_v: string) {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const wm: Rect = { x: 100, y: 100, w: 80, h: 20 }

describe('drawWatermark', () => {
  it('draws the ShotPolish mark when watermark is on (default)', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, undefined)
    expect(calls).toContain('fillText:ShotPolish')
  })

  it('draws the mark when watermark is explicitly true', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, { watermark: true })
    expect(calls).toContain('fillText:ShotPolish')
  })

  it('draws nothing when watermark is false', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, { watermark: false })
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/composition.watermark.test.ts`
Expected: FAIL — `drawWatermark` is not exported.

- [ ] **Step 3: Add the options type and extract the helper**

In `src/lib/composition.ts`, add an exported type near the other exported types (e.g. after the `Rect` interface around line 127):

```ts
export interface RenderOptions {
  /** Draw the ShotPolish watermark onto the canvas. Defaults to true. */
  watermark?: boolean
}
```

Add the `drawWatermark` helper. Place it as a standalone exported function (e.g. just above `renderComposition` near line 807):

```ts
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  watermark: Rect,
  compW: number,
  opts?: RenderOptions,
) {
  if (opts?.watermark === false) return
  ctx.save()
  const wms = Math.max(Math.round(compW * 0.012), 10)
  ctx.font          = `500 ${wms}px 'Inter',system-ui,sans-serif`
  ctx.textAlign     = 'right'
  ctx.textBaseline  = 'bottom'
  ctx.fillStyle     = 'rgba(255,255,255,0.26)'
  ctx.fillText('ShotPolish', watermark.x, watermark.y + watermark.h)
  ctx.restore()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/composition.watermark.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Thread the option through `renderComposition` and call the helper**

In `src/lib/composition.ts`, change the `renderComposition` signature (line 807-814) to add a trailing optional param:

```ts
export function renderComposition(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  theme: Theme,
  doc: CompositionDocument,
  L: ComputedLayout,
  motionProgress: number = 1.0,
  opts?: RenderOptions,
) {
```

Replace the inline watermark block (the `// 10. Watermark` section, lines 1097-1105) with a call to the helper:

```ts
  // 10. Watermark (suppressed for entitled users via opts.watermark === false)
  drawWatermark(ctx, watermark, compW, opts)
```

`watermark` and `compW` are already destructured from `L` at line 815. No existing call site changes — all five callers omit `opts`, so the watermark stays on for everyone.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npx vitest run`
Expected: PASS (existing tests + the 3 new watermark tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/composition.ts src/lib/composition.watermark.test.ts
git commit -m "feat(M1): make canvas watermark an opt-out RenderOptions flag"
```

---

## Task 3: GIF encoding off the main thread

**Files:**
- Create: `src/lib/gifEncoder.ts`
- Create: `src/lib/gifEncoder.test.ts`
- Create: `src/workers/encode.worker.ts`
- Modify: `src/lib/motionExport.ts:83-160` (`exportMotionGIF` body)

- [ ] **Step 1: Write the failing test for the pure encoder**

Create `src/lib/gifEncoder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createGifEncoder } from './gifEncoder'

// Builds a flat opaque-red RGBA buffer of w*h pixels.
function redFrame(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255
  }
  return buf
}

describe('createGifEncoder', () => {
  it('produces a valid GIF byte stream with the GIF89a header', () => {
    const enc = createGifEncoder()
    enc.addFrame(redFrame(4, 4), 4, 4, 100)
    enc.addFrame(redFrame(4, 4), 4, 4, 100)
    const bytes = enc.finish()
    expect(bytes.length).toBeGreaterThan(6)
    // "GIF89a" magic
    const header = String.fromCharCode(...bytes.slice(0, 6))
    expect(header).toBe('GIF89a')
  })

  it('encodes multiple frames without throwing', () => {
    const enc = createGifEncoder()
    for (let i = 0; i < 5; i++) enc.addFrame(redFrame(8, 8), 8, 8, 80)
    expect(() => enc.finish()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gifEncoder.test.ts`
Expected: FAIL — cannot find module `./gifEncoder`.

- [ ] **Step 3: Implement the pure encoder**

Create `src/lib/gifEncoder.ts`. This holds exactly the gifenc per-frame logic currently inline in `exportMotionGIF`, so output is equivalent.

```ts
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export interface GifEncoderHandle {
  /** Quantize one RGBA frame and append it. `rgba` length must be w*h*4. */
  addFrame(rgba: Uint8ClampedArray, width: number, height: number, delay: number): void
  /** Finalize and return the complete GIF byte stream. */
  finish(): Uint8Array
}

export function createGifEncoder(): GifEncoderHandle {
  const gif = GIFEncoder()
  return {
    addFrame(rgba, width, height, delay) {
      const palette = quantize(rgba, 256)
      const index = applyPalette(rgba, palette)
      gif.writeFrame(index, width, height, { palette, delay })
    },
    finish() {
      gif.finish()
      return gif.bytesView()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gifEncoder.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the worker wrapper**

Create `src/workers/encode.worker.ts`. It owns a single encoder per export run and posts progress + final bytes. RGBA arrives as a transferred `ArrayBuffer`; the GIF result is transferred back.

```ts
/// <reference lib="webworker" />
import { createGifEncoder, type GifEncoderHandle } from '../lib/gifEncoder'

type InMsg =
  | { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; delay: number; total: number }
  | { type: 'finish' }

type OutMsg =
  | { type: 'progress'; written: number; total: number }
  | { type: 'done'; gif: ArrayBuffer }
  | { type: 'error'; message: string }

let encoder: GifEncoderHandle | null = null
let written = 0

const post = (msg: OutMsg, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? [])

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    if (msg.type === 'frame') {
      if (!encoder) { encoder = createGifEncoder(); written = 0 }
      const rgba = new Uint8ClampedArray(msg.rgba)
      encoder.addFrame(rgba, msg.width, msg.height, msg.delay)
      written++
      post({ type: 'progress', written, total: msg.total })
    } else if (msg.type === 'finish') {
      if (!encoder) { post({ type: 'done', gif: new Uint8Array().buffer }); return }
      const bytes = encoder.finish()
      // Copy into a fresh ArrayBuffer so we can transfer it cleanly.
      const out = bytes.slice().buffer
      encoder = null
      written = 0
      post({ type: 'done', gif: out }, [out])
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
```

- [ ] **Step 6: Rewrite `exportMotionGIF` to drive the worker**

In `src/lib/motionExport.ts`, replace the body of `exportMotionGIF` (the part from the `const gif = GIFEncoder()` line through `return { blob, format: 'gif', url: ... }`, i.e. lines ~117-160) so it renders frames on the main thread but offloads palette+encode to the worker. Keep the dimension cap, frame-skip, and memory-guard logic above it unchanged. Also remove the now-unused `import { GIFEncoder, quantize, applyPalette } from 'gifenc'` at the top of the file (the worker owns gifenc now).

Replace the whole `exportMotionGIF` function with:

```ts
export async function exportMotionGIF(
  exportFrame: (progress: number) => Promise<string | null>,  // returns data URL per frame
  totalFrames: number,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  // 1. Cap dimensions at max 960px width to prevent high-DPR out-of-memory pressure
  let w = targetWidth
  let h = targetHeight
  if (w > 960) {
    const scale = 960 / w
    w = 960
    h = Math.round(h * scale)
  }

  // 2. Adaptive Frame Skipping: Cap at 45 frames to prevent huge files and browser crashes
  const maxAllowedFrames = 45
  const step = totalFrames > maxAllowedFrames ? Math.ceil(totalFrames / maxAllowedFrames) : 1
  const renderFramesCount = Math.ceil(totalFrames / step)

  // 3. Predicted Memory Safety Check
  const predictedBytes = w * h * renderFramesCount * 4
  const predictedMB = Math.round(predictedBytes / (1024 * 1024))
  if (predictedMB > 120) {
    console.warn(`[GIF Export Guard] Predicted render memory: ${predictedMB}MB. Capping dimensions further.`)
  }

  const delay = Math.round((1000 / fps) * step)

  // Offscreen canvas for pixel extraction (must stay on the main thread —
  // the composition engine renders to a DOM canvas). Only the CPU-heavy
  // quantize/encode is offloaded to the worker.
  const offscreen = document.createElement('canvas')
  offscreen.width  = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d', { willReadFrequently: true })!

  const worker = new Worker(new URL('../workers/encode.worker.ts', import.meta.url), { type: 'module' })

  try {
    const gifBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'progress') {
          onProgress?.({ frame: msg.written, total: renderFramesCount, percent: Math.round((msg.written / renderFramesCount) * 100) })
        } else if (msg.type === 'done') {
          resolve(msg.gif as ArrayBuffer)
        } else if (msg.type === 'error') {
          reject(new Error(msg.message))
        }
      }
      worker.onerror = () => reject(new Error('GIF encode worker error'))

      ;(async () => {
        try {
          for (let i = 0; i < totalFrames; i += step) {
            if (signal?.aborted) break

            const progress = i / totalFrames
            const dataUrl = await exportFrame(progress)
            if (!dataUrl) continue

            await new Promise<void>((res, rej) => {
              const img = new Image()
              img.onload = () => { ctx.drawImage(img, 0, 0, w, h); res() }
              img.onerror = () => rej(new Error('Frame image decode failed'))
              img.src = dataUrl
            })

            const { data } = ctx.getImageData(0, 0, w, h)
            // Transfer the pixel buffer to the worker (zero-copy).
            const rgba = new Uint8ClampedArray(data).buffer
            worker.postMessage(
              { type: 'frame', rgba, width: w, height: h, delay, total: renderFramesCount },
              [rgba],
            )

            // Yield so frame rendering stays responsive.
            await new Promise(r => setTimeout(r, 0))
          }
          worker.postMessage({ type: 'finish' })
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    })

    const blob = new Blob([gifBytes], { type: 'image/gif' })
    return { blob, format: 'gif', url: URL.createObjectURL(blob) }
  } finally {
    worker.terminate()
  }
}
```

- [ ] **Step 7: Run full suite + typecheck + build**

Run: `npx vitest run`
Expected: PASS (all existing + gifEncoder tests).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; Vite emits the worker as a separate chunk.

- [ ] **Step 8: Manual smoke (mobile-freeze acceptance)**

Run: `npm run dev`. In the editor, enable motion, export a multi-slide GIF.
Expected: progress updates render smoothly; the tab stays responsive during encode (palette work is now in the worker); the downloaded GIF plays correctly. Export a second and third GIF — each succeeds and the worker is terminated between runs (no growing worker count in devtools).

- [ ] **Step 9: Commit**

```bash
git add src/lib/gifEncoder.ts src/lib/gifEncoder.test.ts src/workers/encode.worker.ts src/lib/motionExport.ts
git commit -m "feat(M1): move GIF palette+encode to a Web Worker to stop mobile freeze"
```

---

## Self-Review Notes

- **Spec coverage:** Hero handoff (Task 1), watermark flag (Task 2), GIF worker (Task 3) — all three spec goals mapped. Reducer refactor correctly absent (deferred). Video export untouched (per spec).
- **Test strategy vs spec:** spec suggested rendering to an offscreen canvas for the watermark test; since vitest runs in `node` (no canvas), the plan instead factors `drawWatermark` and asserts the draw decision via a recording mock context — same guarantee (mark present iff flag on), no new dependency. GIF test targets the factored pure `createGifEncoder`, matching the spec's "pure encode step testable without a real Worker."
- **Type consistency:** `RenderOptions` defined in Task 2 and used only there. `GifEncoderHandle` / `createGifEncoder` defined in Task 3 Step 3, consumed by the worker in Step 5. Worker message shapes (`frame`/`finish` in; `progress`/`done`/`error` out) match between worker (Step 5) and `exportMotionGIF` (Step 6).
- **No placeholders:** every code step shows complete code.
```
