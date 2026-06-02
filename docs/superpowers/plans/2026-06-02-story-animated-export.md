# Story Animated Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing story builder's Export modal to produce an animated MP4/WebM walkthrough by sequencing each slide's existing spotlight animation and crossfading between them.

**Architecture:** A new `storyAnimationExport.ts` module exposes three functions: `buildFrameSequence` (pure — maps frame indices to per-slide progress values), `renderStoryFrame` (renders one frame to a canvas, handles crossfades via two reused offscreen canvases), and `exportStoryAsVideo` (drives the existing `exportMotionVideo` MediaRecorder pipeline). `ExportModal` gains an "Animated Story" section with a looping preview canvas and an export trigger. Zero new runtime dependencies.

**Tech Stack:** TypeScript, React 18, Canvas API, MediaRecorder API (existing), Vitest (added for `buildFrameSequence` unit tests), existing `composition.ts` / `motionExport.ts` / `socialFormats.ts`.

---

## File Map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/storyAnimationExport.ts` | **Create** | Frame sequencer, per-frame renderer, export orchestrator |
| `src/lib/storyAnimationExport.test.ts` | **Create** | Unit tests for `buildFrameSequence` (pure function, no DOM) |
| `src/pages/StoryModePage.tsx` | **Modify** | ExportModal: add `formatId` prop + animated section (state, preview canvas, export trigger) |
| `src/lib/analytics.ts` | **Modify** | Add 4 typed story animation event helpers to `Events` |
| `vite.config.ts` | **Modify** | Add Vitest config block |
| `package.json` | **Modify** | Add `"test": "vitest"` script + install `vitest` dev dependency |

---

## Task 1: Vitest setup + `buildFrameSequence()`

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/lib/storyAnimationExport.ts`
- Create: `src/lib/storyAnimationExport.test.ts`

- [ ] **Step 1.1 — Install Vitest**

```bash
cd "c:/Users/georg/OneDrive/Desktop/Projects/ShotPolish"
npm install -D vitest
```

Expected: `vitest` appears in `package.json` devDependencies.

- [ ] **Step 1.2 — Add Vitest config to `vite.config.ts`**

Replace the entire file:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 1.3 — Add test script to `package.json`**

Add `"test": "vitest run"` to the `scripts` block. The scripts section should now be:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 1.4 — Write the failing test**

Create `src/lib/storyAnimationExport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildFrameSequence } from './storyAnimationExport'

describe('buildFrameSequence', () => {
  it('produces correct frame count for 1 slide (no crossfade)', () => {
    const frames = buildFrameSequence(1)
    // 1.5s × 30fps = 45 frames
    expect(frames.length).toBe(45)
  })

  it('produces correct frame count for 2 slides (one crossfade)', () => {
    const frames = buildFrameSequence(2)
    // 45 slide + 8 crossfade + 45 slide = 98 frames  (0.25 × 30 = 7.5 → 8)
    expect(frames.length).toBe(98)
  })

  it('first frame is a slide frame at progress 0', () => {
    const frames = buildFrameSequence(2)
    expect(frames[0].type).toBe('slide')
    expect(frames[0].slideIndex).toBe(0)
    expect(frames[0].localProgress).toBe(0)
  })

  it('last slide frame has localProgress 1', () => {
    const frames = buildFrameSequence(2)
    // frame 44 is the last frame of slide 0 (0-indexed)
    expect(frames[44].type).toBe('slide')
    expect(frames[44].localProgress).toBeCloseTo(1.0, 5)
  })

  it('first crossfade frame has crossfadeAlpha 1 and nextSlideProgress 0', () => {
    const frames = buildFrameSequence(2)
    const cf = frames[45]
    expect(cf.type).toBe('crossfade')
    expect(cf.slideIndex).toBe(0)
    expect(cf.nextSlideIndex).toBe(1)
    expect(cf.crossfadeAlpha).toBeCloseTo(1.0, 5)
    expect(cf.nextSlideProgress).toBe(0)
  })

  it('last crossfade frame has crossfadeAlpha ~0 and nextSlideProgress ~1', () => {
    const frames = buildFrameSequence(2)
    const cf = frames[52]   // last crossfade frame (index 45+7 = 52)
    expect(cf.type).toBe('crossfade')
    expect(cf.crossfadeAlpha).toBeCloseTo(0.0, 1)
    expect(cf.nextSlideProgress).toBeCloseTo(1.0, 1)
  })

  it('next slide starts after crossfade', () => {
    const frames = buildFrameSequence(2)
    const firstSlide2 = frames[53]
    expect(firstSlide2.type).toBe('slide')
    expect(firstSlide2.slideIndex).toBe(1)
    expect(firstSlide2.localProgress).toBe(0)
  })

  it('last frame of a 2-slide story is slide 1 at progress 1', () => {
    const frames = buildFrameSequence(2)
    const last = frames[frames.length - 1]
    expect(last.type).toBe('slide')
    expect(last.slideIndex).toBe(1)
    expect(last.localProgress).toBeCloseTo(1.0, 5)
  })
})
```

- [ ] **Step 1.5 — Run the test to confirm it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module './storyAnimationExport'`

- [ ] **Step 1.6 — Create `src/lib/storyAnimationExport.ts` with `buildFrameSequence`**

```typescript
import {
  THEMES,
  computeLayout,
  renderComposition,
  type FrameType,
  type Selection,
  type Callout,
  type StoryRole,
} from './composition'
import { SOCIAL_FORMATS } from './socialFormats'
import { exportMotionVideo, type ExportResult, type ExportProgress } from './motionExport'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIDE_DURATION_S  = 1.5
const CROSSFADE_S       = 0.25
const FPS               = 30
const OVERLAP_START     = 0.75  // next slide animation begins at 75% of crossfade

// ── Public types ─────────────────────────────────────────────────────────────

export interface FrameSpec {
  type: 'slide' | 'crossfade'
  slideIndex: number
  localProgress: number
  crossfadeAlpha?: number      // opacity of outgoing slide (1→0); only on crossfade frames
  nextSlideIndex?: number      // only on crossfade frames
  nextSlideProgress?: number   // motionProgress for incoming slide; only on crossfade frames
}

// Minimal interface — structurally compatible with StorySlide from StoryModePage.
// Using a local interface avoids importing from a page file into a lib.
export interface AnimSlide {
  id: string
  assetId: string
  role: StoryRole
  title: string
  callout: string
  selection: Selection | null
  callouts?: Callout[]
}

export interface AnimAsset {
  decodedImage: HTMLImageElement | null
  width: number
  height: number
  status: string
}

export interface StoryAnimConfig {
  formatId: string
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
}

// ── buildFrameSequence ────────────────────────────────────────────────────────

export function buildFrameSequence(
  slideCount: number,
  fps: number = FPS,
  slideDurationS: number = SLIDE_DURATION_S,
  crossfadeDurationS: number = CROSSFADE_S,
): FrameSpec[] {
  const spf = Math.round(slideDurationS * fps)    // frames per slide
  const cpf = Math.round(crossfadeDurationS * fps) // frames per crossfade
  const frames: FrameSpec[] = []

  for (let si = 0; si < slideCount; si++) {
    for (let f = 0; f < spf; f++) {
      frames.push({
        type: 'slide',
        slideIndex: si,
        localProgress: spf > 1 ? f / (spf - 1) : 1.0,
      })
    }
    if (si < slideCount - 1) {
      for (let f = 0; f < cpf; f++) {
        const t = cpf > 1 ? f / (cpf - 1) : 1.0
        frames.push({
          type: 'crossfade',
          slideIndex: si,
          localProgress: 1.0,
          crossfadeAlpha: 1.0 - t,
          nextSlideIndex: si + 1,
          nextSlideProgress: Math.max(0, (t - OVERLAP_START) / (1 - OVERLAP_START)),
        })
      }
    }
  }

  return frames
}
```

- [ ] **Step 1.7 — Run the test to confirm it passes**

```bash
npm test
```

Expected: All 8 tests PASS.

- [ ] **Step 1.8 — Commit**

```bash
git add vite.config.ts package.json package-lock.json src/lib/storyAnimationExport.ts src/lib/storyAnimationExport.test.ts
git commit -m "feat: add buildFrameSequence + vitest setup"
```

---

## Task 2: `renderStoryFrame()` and `exportStoryAsVideo()`

**Files:**
- Modify: `src/lib/storyAnimationExport.ts` (append to existing file)

These functions require the DOM so they are verified via browser smoke test, not unit tests.

- [ ] **Step 2.1 — Append `renderStoryFrame` and `exportStoryAsVideo` to `src/lib/storyAnimationExport.ts`**

Add the following after the closing brace of `buildFrameSequence`:

```typescript
// ── Internal helpers ─────────────────────────────────────────────────────────

function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  slide: AnimSlide,
  asset: AnimAsset,
  motionProgress: number,
  config: StoryAnimConfig,
): void {
  if (!asset.decodedImage) return
  const theme = THEMES[config.themeIndex] ?? THEMES[0]
  const L = computeLayout(
    asset.width,
    asset.height,
    config.padding,
    slide.title,
    config.formatId,
    config.frameType,
  )
  if (canvas.width !== L.compW || canvas.height !== L.compH) {
    canvas.width  = L.compW
    canvas.height = L.compH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  renderComposition(ctx, asset.decodedImage, theme, {
    id: slide.id,
    formatId: config.formatId,
    themeIndex: config.themeIndex,
    padding: config.padding,
    shadowOpacity: config.shadowOpacity,
    frameType: config.frameType,
    role: slide.role,
    headline:   { text: slide.title,   visible: !!slide.title   },
    screenshot: {
      imageUrl:     null,
      naturalWidth:  asset.width,
      naturalHeight: asset.height,
      visible:       true,
      selection:     slide.selection ?? null,
      callout:       { text: slide.callout, visible: !!slide.callout },
      callouts:      slide.callouts ?? [],
    },
  }, L, motionProgress)
}

// Two offscreen canvases allocated once and reused across frames.
let _offA: HTMLCanvasElement | null = null
let _offB: HTMLCanvasElement | null = null
function offscreens(): [HTMLCanvasElement, HTMLCanvasElement] {
  if (!_offA) _offA = document.createElement('canvas')
  if (!_offB) _offB = document.createElement('canvas')
  return [_offA, _offB]
}

// ── renderStoryFrame ──────────────────────────────────────────────────────────

export function renderStoryFrame(
  spec: FrameSpec,
  slides: AnimSlide[],
  assets: Record<string, AnimAsset>,
  canvas: HTMLCanvasElement,
  config: StoryAnimConfig,
): void {
  const fmt = SOCIAL_FORMATS[config.formatId]
  if (!fmt || fmt.width === 0) return   // free format not supported for animation

  if (canvas.width !== fmt.width || canvas.height !== fmt.height) {
    canvas.width  = fmt.width
    canvas.height = fmt.height
  }

  if (spec.type === 'slide') {
    const slide = slides[spec.slideIndex]
    const asset = assets[slide.assetId]
    if (asset?.decodedImage) renderSlideToCanvas(canvas, slide, asset, spec.localProgress, config)
    return
  }

  // Crossfade: draw outgoing slide at full opacity, draw incoming on top with rising alpha.
  const [offA, offB] = offscreens()
  const slideA = slides[spec.slideIndex]
  const assetA = assets[slideA.assetId]
  if (assetA?.decodedImage) renderSlideToCanvas(offA, slideA, assetA, 1.0, config)

  const slideB = slides[spec.nextSlideIndex!]
  const assetB = assets[slideB.assetId]
  if (assetB?.decodedImage) renderSlideToCanvas(offB, slideB, assetB, spec.nextSlideProgress ?? 0, config)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.globalAlpha = 1.0
  if (offA.width > 0) ctx.drawImage(offA, 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 1.0 - (spec.crossfadeAlpha ?? 1.0)  // incoming slide opacity
  if (offB.width > 0) ctx.drawImage(offB, 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 1.0
}

// ── exportStoryAsVideo ────────────────────────────────────────────────────────

export async function exportStoryAsVideo(
  slides: AnimSlide[],
  assets: Record<string, AnimAsset>,
  config: StoryAnimConfig,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const fmt = SOCIAL_FORMATS[config.formatId]
  if (!fmt || fmt.width === 0) throw new Error('Animated export requires a fixed social format (not "free").')

  const frameSeq    = buildFrameSequence(slides.length)
  const totalFrames = frameSeq.length

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width  = fmt.width
  exportCanvas.height = fmt.height

  const renderFrame = (progress: number) => {
    const fi = Math.min(Math.round(progress * (totalFrames - 1)), totalFrames - 1)
    renderStoryFrame(frameSeq[fi], slides, assets, exportCanvas, config)
  }

  return exportMotionVideo(exportCanvas, totalFrames, FPS, renderFrame, onProgress, signal)
}
```

- [ ] **Step 2.2 — Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see "Object is possibly null" on `offA`/`offB`, add `!` non-null assertions as shown (they are guaranteed by `offscreens()`).

- [ ] **Step 2.3 — Browser smoke test**

Run `npm run dev`, open the app at `http://localhost:5173`, open browser DevTools Console, and paste:

```javascript
// This smoke test imports are only possible because the dev server exposes ES modules.
// If paste fails, wrap in: (async () => { ... })()
const { buildFrameSequence } = await import('/src/lib/storyAnimationExport.ts')
const frames = buildFrameSequence(3)
console.assert(frames.length === 151, `Expected 151 frames, got ${frames.length}`)
console.log('buildFrameSequence smoke test PASSED — frames:', frames.length)
```

Expected: `buildFrameSequence smoke test PASSED — frames: 151`

- [ ] **Step 2.4 — Full export smoke test**

In the running app, complete the story flow: upload 3 screenshots, proceed to the builder. Then open DevTools and paste:

```javascript
// Access the internal React state via a debug trick (Vite dev only)
// Instead, use the existing Export modal — we'll wire it in Task 3.
// For now, just confirm the module loads without errors:
const mod = await import('/src/lib/storyAnimationExport.ts')
console.log('Exported functions:', Object.keys(mod))
// Expected: ['buildFrameSequence', 'renderStoryFrame', 'exportStoryAsVideo']
```

Expected: `Exported functions: ['buildFrameSequence', 'renderStoryFrame', 'exportStoryAsVideo']`

- [ ] **Step 2.5 — Commit**

```bash
git add src/lib/storyAnimationExport.ts
git commit -m "feat: add renderStoryFrame and exportStoryAsVideo"
```

---

## Task 3: Extend `ExportModal` — animated export state and trigger

**Files:**
- Modify: `src/pages/StoryModePage.tsx`

The `ExportModal` component starts at line 489. The `BuilderStep` renders it starting around line 1366. This task adds: a new `formatId` prop, four new state variables, an export handler, and a download handler.

- [ ] **Step 3.1 — Add `formatId` to `ExportModal` props**

Find the `ExportModal` function signature (around line 489):

```typescript
function ExportModal({
  intent, slides, assets, themeIndex, padding, shadowOpacity, frameType, onClose,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
  onClose: () => void
})
```

Replace with:

```typescript
function ExportModal({
  intent, slides, assets, themeIndex, padding, shadowOpacity, frameType, formatId, onClose,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
  formatId: string
  onClose: () => void
})
```

- [ ] **Step 3.2 — Pass `formatId` from `BuilderStep` to `ExportModal`**

Find the `<ExportModal` JSX inside `BuilderStep` (around line 1369). It currently looks like:

```tsx
<ExportModal
  intent={intent}
  slides={slides}
  assets={assets}
  themeIndex={themeIndex}
  padding={padding}
  shadowOpacity={shadowOpacity}
  frameType={frameType}
  onClose={() => setShowExport(false)}
/>
```

Add `formatId={formatId}` before `onClose`:

```tsx
<ExportModal
  intent={intent}
  slides={slides}
  assets={assets}
  themeIndex={themeIndex}
  padding={padding}
  shadowOpacity={shadowOpacity}
  frameType={frameType}
  formatId={formatId}
  onClose={() => setShowExport(false)}
/>
```

- [ ] **Step 3.3 — Add imports to `StoryModePage.tsx`**

At the top of `StoryModePage.tsx`, find the existing import block. Add:

```typescript
import {
  buildFrameSequence,
  renderStoryFrame,
  exportStoryAsVideo,
  type AnimSlide,
  type AnimAsset,
  type StoryAnimConfig,
} from '../lib/storyAnimationExport'
import type { ExportProgress, ExportResult } from '../lib/motionExport'
```

- [ ] **Step 3.4 — Add animated export state inside `ExportModal`**

Inside the `ExportModal` function body, immediately after the existing `const [status, setStatus]` line, add:

```typescript
const [animStatus,   setAnimStatus]   = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
const [animProgress, setAnimProgress] = useState<ExportProgress | null>(null)
const [animResult,   setAnimResult]   = useState<ExportResult | null>(null)
const abortRef       = useRef<AbortController | null>(null)
const previewCanvasRef = useRef<HTMLCanvasElement>(null)
const previewRafRef    = useRef<number | null>(null)
const frameSeqRef      = useRef(buildFrameSequence(slides.length))

const fmt       = SOCIAL_FORMATS[formatId]
const canAnimate = !!(fmt && fmt.width > 0) &&
  slides.every(s => assets[s.assetId]?.status === 'ready')
```

- [ ] **Step 3.5 — Add the export handler inside `ExportModal`**

After the state declarations, add:

```typescript
const animConfig: StoryAnimConfig = {
  formatId,
  themeIndex,
  padding,
  shadowOpacity,
  frameType,
}

const handleAnimExport = async () => {
  if (!canAnimate || animStatus !== 'idle') return
  const ctrl = new AbortController()
  abortRef.current = ctrl
  setAnimStatus('exporting')
  stopPreview()
  track('story_anim_started', { slides: slides.length })
  try {
    const result = await exportStoryAsVideo(
      slides as AnimSlide[],
      assets as Record<string, AnimAsset>,
      animConfig,
      setAnimProgress,
      ctrl.signal,
    )
    setAnimResult(result)
    setAnimStatus('done')
    track('story_anim_complete', { slides: slides.length, format: result.format })
  } catch {
    if (!ctrl.signal.aborted) {
      setAnimStatus('error')
      track('story_anim_error', { slides: slides.length })
    }
  }
}

const handleAnimDownload = () => {
  if (!animResult) return
  const a = document.createElement('a')
  a.href = animResult.url
  a.download = `story.${animResult.format}`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  track('story_anim_download', { format: animResult.format })
  setTimeout(() => URL.revokeObjectURL(animResult.url), 60_000)
}
```

- [ ] **Step 3.6 — Add preview stop helper and cleanup on modal close**

Add directly after the handlers:

```typescript
const stopPreview = () => {
  if (previewRafRef.current !== null) {
    cancelAnimationFrame(previewRafRef.current)
    previewRafRef.current = null
  }
}
```

Find the existing `onClose` prop usage (the modal overlay has `onClick={e => e.target === e.currentTarget && onClose()}`). Wrap the existing `onClose` to also abort and stop preview. Find the close button JSX:

```tsx
<button onClick={onClose} className="w-7 h-7 ...">
```

Replace with:

```tsx
<button onClick={() => { abortRef.current?.abort(); stopPreview(); onClose() }} className="w-7 h-7 ...">
```

And on the overlay click (the outer `motion.div onClick`):

```tsx
onClick={e => e.target === e.currentTarget && (abortRef.current?.abort(), stopPreview(), onClose())}
```

- [ ] **Step 3.7 — Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.8 — Commit**

```bash
git add src/pages/StoryModePage.tsx src/lib/storyAnimationExport.ts
git commit -m "feat: extend ExportModal with animated export state and handlers"
```

---

## Task 4: Add preview canvas + animated section JSX to `ExportModal`

**Files:**
- Modify: `src/pages/StoryModePage.tsx`

- [ ] **Step 4.1 — Add the preview RAF loop effect inside `ExportModal`**

After the `stopPreview` function, add a `useEffect` that starts the preview when the modal mounts and stops it on unmount:

```typescript
useEffect(() => {
  if (!canAnimate || !previewCanvasRef.current) return
  const frames    = frameSeqRef.current
  let startTime: number | null = null

  const loop = (ts: number) => {
    if (!previewCanvasRef.current) return
    if (startTime === null) startTime = ts
    const elapsedS    = (ts - startTime) / 1000
    const totalS      = frames.length / 30
    const t           = elapsedS % totalS
    const fi          = Math.min(Math.floor(t * 30), frames.length - 1)
    renderStoryFrame(
      frames[fi],
      slides as AnimSlide[],
      assets as Record<string, AnimAsset>,
      previewCanvasRef.current,
      animConfig,
    )
    previewRafRef.current = requestAnimationFrame(loop)
  }
  previewRafRef.current = requestAnimationFrame(loop)
  return stopPreview
}, [canAnimate])
```

- [ ] **Step 4.2 — Add the "Animated Story" section to the modal JSX**

Inside the `ExportModal` return, immediately after the opening `<motion.div>` (the white card) and `<div className="flex items-center ...">` header block, and **before** the existing format checkboxes `<div className="px-5 py-4 ...">`, insert:

```tsx
{/* ── Animated Story section ─────────────────────────── */}
<div className="px-5 pt-4 pb-3 border-b border-[#E5E7EC]">
  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
    Animated Story
  </p>

  {/* Preview canvas */}
  <div className="relative rounded-xl overflow-hidden bg-[#06080f]"
    style={{ aspectRatio: fmt?.width && fmt.height ? `${fmt.width}/${fmt.height}` : '16/9' }}>
    <canvas
      ref={previewCanvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
    {canAnimate && (
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider text-white/70 bg-black/50 border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] animate-pulse" />
        Preview
      </div>
    )}
  </div>

  {/* Export controls */}
  <div className="mt-2">
    {animStatus === 'idle' && (
      <>
        <button
          onClick={handleAnimExport}
          disabled={!canAnimate}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={canAnimate ? { background: intent.color, color: '#0f172a' } : { background: '#27272a', color: '#71717a' }}
        >
          Export as Video →
        </button>
        {!canAnimate && (
          <p className="text-[10px] text-[#9CA3AF] text-center mt-1">
            {fmt?.width === 0 ? 'Select a social format to enable animated export' : 'Waiting for screenshots to load…'}
          </p>
        )}
      </>
    )}

    {animStatus === 'exporting' && animProgress && (
      <div>
        <div className="flex items-center justify-between text-[10px] text-[#6B7280] mb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-[#818cf8] border-t-transparent rounded-full animate-spin inline-block" />
            Rendering… 
          </span>
          <span style={{ color: intent.color }}>{animProgress.percent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#E5E7EC] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${animProgress.percent}%`, background: intent.color }}
          />
        </div>
      </div>
    )}

    {animStatus === 'done' && animResult && (
      <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-[#34d399] flex items-center justify-center text-sm flex-shrink-0">✓</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[#111827]">{animResult.format.toUpperCase()} ready</p>
          <p className="text-[10px] text-[#6B7280]">
            {(animResult.blob.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        </div>
        <button
          onClick={handleAnimDownload}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#34d399] text-[#0f172a] flex-shrink-0"
        >
          ↓ Save
        </button>
      </div>
    )}

    {animStatus === 'error' && (
      <div className="text-[11px] text-red-400 text-center py-1">
        Export failed.{' '}
        <button onClick={() => setAnimStatus('idle')} className="underline">Try again</button>
      </div>
    )}
  </div>
</div>
{/* ── End Animated Story section ──────────────────────── */}
```

Also update the existing static export section header to say `Static Slides` — find:

```tsx
<p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Select formats</p>
```

Replace with:

```tsx
<p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Static Slides</p>
```

Dim the static section while animated export is in progress. Find the outer `<div className="px-5 py-4 ...">` that wraps the format checkboxes and add a conditional style:

```tsx
<div
  className="px-5 py-4 max-h-64 overflow-y-auto scrollbar-none space-y-1"
  style={animStatus === 'exporting' ? { opacity: 0.4, pointerEvents: 'none' } : {}}
>
```

- [ ] **Step 4.3 — Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.4 — Manual test in browser**

```
1. npm run dev → open http://localhost:5173/story
2. Select any intent → upload 3 screenshots → click "Build Story"
3. Select a social format from the top bar (e.g. "X / Twitter")
4. Click "Generate Launch Kit"
5. The export modal should open
6. The preview canvas should show the animated story looping
7. "Export as Video →" button should be enabled and accent-coloured
8. Click "Export as Video →"
9. Progress bar should appear and count up to 100%
10. Done card should appear with "MP4 ready" or "WebM ready", file size, and "↓ Save" button
11. Click "↓ Save" — video file should download
12. Open the downloaded file — verify animation plays correctly (spotlight reveal, crossfades)
```

- [ ] **Step 4.5 — Commit**

```bash
git add src/pages/StoryModePage.tsx
git commit -m "feat: add animated export preview canvas and export UI to ExportModal"
```

---

## Task 5: Analytics events

**Files:**
- Modify: `src/lib/analytics.ts`

- [ ] **Step 5.1 — Add animated story events to the `Events` object**

In `src/lib/analytics.ts`, add four entries inside the `Events` object after the existing entries:

```typescript
// Story animation
storyAnimStarted:    (slides: number)                           => track('story_anim_started',  { slides }),
storyAnimComplete:   (slides: number, format: string)           => track('story_anim_complete', { slides, format }),
storyAnimDownload:   (format: string)                           => track('story_anim_download', { format }),
storyAnimError:      (slides: number)                           => track('story_anim_error',    { slides }),
```

- [ ] **Step 5.2 — Replace bare `track()` calls in `StoryModePage.tsx` with typed helpers**

In `StoryModePage.tsx`, find the four bare `track(...)` calls added in Task 3 and replace them:

| Replace | With |
|---|---|
| `track('story_anim_started', { slides: slides.length })` | `Events.storyAnimStarted(slides.length)` |
| `track('story_anim_complete', { slides: slides.length, format: result.format })` | `Events.storyAnimComplete(slides.length, result.format)` |
| `track('story_anim_error', { slides: slides.length })` | `Events.storyAnimError(slides.length)` |
| `track('story_anim_download', { format: animResult.format })` | `Events.storyAnimDownload(animResult.format)` |

Also add `Events` to the import at the top of `StoryModePage.tsx` if it isn't already imported:

```typescript
import { track, Events } from '../lib/analytics'
```

- [ ] **Step 5.3 — Verify events fire in dev**

Open the browser console, perform an animated export. Expected console output:

```
[Analytics] story_anim_started { slides: 3 }
[Analytics] story_anim_complete { slides: 3, format: 'mp4' }
[Analytics] story_anim_download { format: 'mp4' }
```

- [ ] **Step 5.4 — Commit**

```bash
git add src/lib/analytics.ts src/pages/StoryModePage.tsx
git commit -m "feat: add story animation analytics events"
```

---

## Task 6: Browser QA

This is a manual checklist. Work through each scenario, note failures, and fix before marking complete.

- [ ] **Step 6.1 — Chrome (primary)**

```
Export with 3 slides  → verify MP4 plays in QuickTime / VLC
Export with 5 slides  → verify crossfades are smooth
Export with 10 slides → verify no crashes or memory issues
Export with "free" format selected → button should be disabled with message
Close modal mid-export → file should NOT be downloaded; no console errors
Re-open modal after close → preview should restart from beginning
```

- [ ] **Step 6.2 — Firefox**

```
Perform a 3-slide export
Expected: export succeeds as WebM (not MP4 — Firefox MediaRecorder does not support H.264)
Done card should say "WEBM ready"
Download and verify the WebM file plays in VLC
```

- [ ] **Step 6.3 — Safari**

```
Perform a 3-slide export
Expected: may produce MP4 or WebM depending on Safari version
Verify file downloads and plays
If export hangs > 60s, note as a bug
```

- [ ] **Step 6.4 — Test all five frame types**

In the story builder top bar, cycle through frame types (Browser, iPhone, Android, iPad, None). Export an animated video for each. All should produce valid files without console errors.

- [ ] **Step 6.5 — Test slides without spotlight or callout**

Create a story where no slide has a spotlight region drawn. Export should succeed — the animation just shows the card scale + headline reveal without spotlight.

- [ ] **Step 6.6 — Fix any QA bugs found, then final commit**

```bash
git add -p   # stage only changed files, review each hunk
git commit -m "fix: story animated export QA fixes"
```

---

## Post-build validation checklist

After shipping:

- [ ] Confirm `story_anim_started` events appear in Plausible
- [ ] Confirm `story_anim_download` / `story_anim_complete` ratio is tracked
- [ ] Watch for `story_anim_error` spikes (indicates browser compatibility issues)
- [ ] Compare engagement metrics on posts with animated exports vs static images over 2 weeks
