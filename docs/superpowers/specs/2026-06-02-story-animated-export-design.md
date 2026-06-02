# Story Animated Export — Design Spec
**Date:** 2026-06-02
**Status:** Approved for implementation

---

## Hypothesis

Founders posting product updates on X and LinkedIn rely on screenshots, but a single screenshot rarely communicates a complete workflow. A sequence of spotlit screenshots — played back as an animated walkthrough — may communicate feature launches, product updates, and workflows more effectively than static images alone.

The goal of this feature is to answer one question: **do users find more value in animated feature walkthroughs than in static screenshots?**

Every implementation decision optimises for learning speed, not technical polish.

---

## Critical Assessment — What Already Exists

Before building anything, auditing the codebase reveals the feature is approximately **75% done**.

| Component | Status | Notes |
|---|---|---|
| `renderComposition(ctx, img, theme, doc, L, motionProgress)` | ✅ Exists | Already animates via a single float 0→1. Spotlight, callout arrow, card scale, headline fade all driven by `motionProgress`. **Reuse unchanged.** |
| `exportMotionVideo()` in `motionExport.ts` | ✅ Exists | MediaRecorder pipeline: canvas.captureStream → MP4/WebM blob. Progress callbacks. **Reuse unchanged.** |
| `exportMotionGIF()` in `motionExport.ts` | ✅ Exists | gifenc pipeline with memory guards. **Do not use in V0** — 256-colour palette produces visible banding on dark gradient backgrounds. |
| Multi-slide data model (slides, assets, selections, callouts) | ✅ Exists | `StorySlide[]` + `Record<string, StoryAsset>` in `StoryModePage`. **Reuse unchanged.** |
| `ExportModal` in `StoryModePage.tsx` | 🔧 Needs extension | Add animated export section. Approx +80 lines. |
| **Multi-slide frame sequencer** | ❌ Missing | Orchestrates global frame → per-slide progress + crossfades. New file, ~120 lines. |

**What this means:** The feature is a glue layer. One new file, two modified files, ~200 lines of new code, zero new dependencies.

---

## Out of Scope for V0

- GIF export (colour quantization degrades dark gradient backgrounds)
- Duration controls or per-slide timing
- Timeline editing of any kind
- Audio / voiceover
- Custom transition types
- Animation preview before builder step (preview lives in export modal only)
- Intro / outro title cards
- Any new route or navigation surface

---

## Animation Timeline Model

### Per-slide timing

| Parameter | Value | Rationale |
|---|---|---|
| Slide duration | **1.5 seconds** | Fast enough to feel energetic, long enough for spotlight + callout to read |
| Crossfade duration | **0.25 seconds** | Smooth but not cinematic — this is a product update, not a film |
| Animation overlap | Next slide's `motionProgress` starts at **75% of crossfade** | Prevents "dead" mid-fade frames; gives overlapping energy |
| Frame rate | **30 fps** | Standard for social video; balances quality and render time |

### Total durations

| Slides | Duration | Approx render time |
|---|---|---|
| 3 | 5.0s | ~8s |
| 5 | 8.5s | ~15s |
| 8 | 13.75s | ~25s |
| 10 | 17.25s | ~30s |

### Frame sequence logic

For a story with N slides, each frame `f` (at 30fps) resolves to one of two states:

**Single-slide frame** (most frames):
```
slideIndex = floor(f / framesPerSlide)
localProgress = (f % framesPerSlide) / framesPerSlide  →  0.0 to 1.0
renderComposition(..., motionProgress: localProgress)
```

**Crossfade frame** (between slides):
```
crossfadeProgress = 0.0 → 1.0 over 0.25s (7–8 frames)
alphaA = 1.0 - crossfadeProgress
alphaB = crossfadeProgress
nextSlideLocalProgress = max(0, (crossfadeProgress - 0.75) / 0.25)  ← starts at 75%

Render slide[i]   to offscreenA at motionProgress=1.0, draw with globalAlpha=alphaA
Render slide[i+1] to offscreenB at motionProgress=nextSlideLocalProgress, draw with globalAlpha=alphaB
```

Both offscreen canvases are the same dimensions as the export format (e.g. 1080×1080 for Twitter). They are reused across frames to avoid repeated allocation.

---

## Architecture

### New file: `src/lib/storyAnimationExport.ts` (~120 lines)

Three exported functions:

**`buildFrameSequence(slides, fps, slideDurationS, crossfadeDurationS)`**
- Returns `FrameSpec[]` — one entry per frame for the full story
- `FrameSpec = { type: 'slide' | 'crossfade', slideIndex: number, localProgress: number, crossfadeAlpha?: number, nextSlideIndex?: number, nextSlideProgress?: number }`
- Pure function, no side effects, easily testable

**`renderStoryFrame(spec, slides, assets, canvas, config)`**
- `config: { formatId: string, themeIndex: number, padding: number, shadowOpacity: number, frameType: FrameType }`
- For `type: 'slide'`: calls `renderComposition` directly on the target canvas
- For `type: 'crossfade'`: renders each slide to a reused offscreen canvas, blends onto target via `globalAlpha`
- Returns void; caller owns the canvas

**`exportStoryAsVideo(slides, assets, config, onProgress?, signal?)`**
- Builds frame sequence
- Creates a single export canvas at the format's pixel dimensions
- Calls existing `exportMotionVideo(canvas, totalFrames, fps, renderFrame, onProgress, signal)`
- `renderFrame(progress)` maps progress back to frame index via `Math.round(progress * totalFrames)`, calls `renderStoryFrame`
- Returns `Promise<ExportResult>` (same type as `motionExport.ts`)

### Modified: `ExportModal` in `StoryModePage.tsx` (+~80 lines)

New state variables:
```typescript
const [animStatus, setAnimStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
const [animProgress, setAnimProgress] = useState<ExportProgress | null>(null)
const [animResult, setAnimResult]   = useState<ExportResult | null>(null)
const abortRef = useRef<AbortController | null>(null)
const previewCanvasRef = useRef<HTMLCanvasElement>(null)
const previewRafRef    = useRef<number | null>(null)
```

Preview loop (starts on modal open, stops on unmount):
```typescript
// RAF loop drives previewFrameRef through buildFrameSequence at 1× speed
// renderStoryFrame writes to previewCanvasRef at ~240×135px scaled preview
// Loops: when frameIndex >= totalFrames, reset to 0
```

Export trigger:
```typescript
const handleAnimExport = async () => {
  abortRef.current = new AbortController()
  setAnimStatus('exporting')
  stopPreviewLoop()
  try {
    const result = await exportStoryAsVideo(slides, assets, config, setAnimProgress, abortRef.current.signal)
    setAnimResult(result)
    setAnimStatus('done')
    track('story_anim_complete', { slides: slides.length, format: result.format })
  } catch (e) {
    setAnimStatus('error')
    track('story_anim_error', { slides: slides.length })
  }
}
```

Download trigger (after done):
```typescript
// Creates <a href={animResult.url} download="story.mp4"> and clicks it
// Revokes object URL after 60s
track('story_anim_download', { format: animResult.format })
```

### Modified: `src/lib/analytics.ts`

Four new event names added to the existing `track()` call pattern:
- `story_anim_started` — user clicked "Export as MP4"
- `story_anim_complete` — export finished successfully (props: slides count, format, duration)
- `story_anim_download` — user clicked the save/download button
- `story_anim_error` — export threw an error

---

## Export Modal UX

### Layout

Two sections in one modal, separated by a `<hr>`:

1. **Animated Story** (top, visually prominent)
   - Looping preview canvas (~100% modal width, 16:9 aspect ratio, dark background)
   - "● Preview" pill overlay, top-left of canvas
   - "Export as Video →" button (label is format-agnostic; actual format shown only in done state)

2. **Static Slides** (bottom, existing behaviour unchanged)
   - Format checkboxes (existing)
   - "Download N images →" button (existing)

### State transitions

**Idle:** Preview loops. Both sections active.

**Exporting:** Preview stops. Spinner + "Rendering slide X of N…" + progress bar replace the export button. Static section dimmed (`opacity: 0.4`, `pointer-events: none`).

**Done:** Progress bar replaced by success card — checkmark, "MP4 ready", file size + duration, "↓ Save" button. Static section re-enabled. Object URL stored in state; download triggered on "Save" click.

**Error:** Replace progress area with red error message. "Try again" button resets to idle.

### Constraints

- Export button is disabled if any slide asset is not `status: 'ready'`
- Abort controller wired to modal close: if user closes mid-export, the render loop is cancelled
- Preview canvas uses a downscaled render (canvas pixel width: 480px max, independent of CSS display size) to avoid performance impact while modal is open
- File size estimate is NOT shown pre-export (too complex to predict accurately for V0)

---

## Validation Metrics

The purpose of V0 is not revenue. It is answering whether animated exports drive more value than static exports.

| Metric | Signal |
|---|---|
| `story_anim_started` / `story_export_started` ratio | Are users trying the animated path? |
| `story_anim_download` / `story_anim_complete` ratio | Do users keep the file after seeing it? |
| `story_anim_error` rate | Is the export pipeline stable? |
| Time between `story_anim_complete` and `story_anim_download` | Did users hesitate? (preview quality signal) |
| Return visits after animated export (session analytics) | Does exporting a video bring users back? |

---

## Build Order

**Day 1**
1. Create `src/lib/storyAnimationExport.ts`
   - Implement `buildFrameSequence()` with unit-testable pure logic
   - Implement `renderStoryFrame()` with two-offscreen-canvas crossfade
   - Implement `exportStoryAsVideo()` wiring to existing `exportMotionVideo()`
2. Manual smoke test: call `exportStoryAsVideo` directly from browser console with 3 slides, verify MP4 downloads

**Day 2**
3. Add animated export state and export trigger to `ExportModal`
4. Add preview canvas RAF loop to `ExportModal`
5. Wire abort controller to modal `onClose`

**Day 3**
6. Add analytics events
7. QA across browsers (Chrome, Firefox, Safari)
   - Safari: verify MediaRecorder falls back to WebM gracefully
   - Firefox: verify WebM exports play in VLC / social platforms
8. Test with 10-slide story (memory / render time limit)
9. Test with all 5 frame types (browser, iphone, android, ipad, none)

**Day 4–5 (buffer)**
- Fix QA bugs
- Test GIF quality as stretch goal — if banding is acceptable on light-themed compositions, wire `exportMotionGIF` with a "GIF" toggle

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **MediaRecorder timing jitter** causes uneven pacing in MP4 | Medium | The `setTimeout`-based render loop in `exportMotionVideo` can drift. For V0 this is acceptable; if noticeable, switch to a frame-count-driven approach. |
| **Safari produces WebM** instead of MP4 (H.264 not available via MediaRecorder on Safari) | High | Already handled in `getSupportedVideoMimeType()`. Label button "Export as Video" and show format label (MP4/WebM) in done state. |
| **GIF banding on dark gradients** | Confirmed | Excluded from V0 scope. Ship MP4/WebM only. |
| **Memory pressure on 10-slide export** | Low | `exportMotionVideo` uses `canvas.captureStream()` — frames are streamed, not buffered. Memory is bounded by two offscreen canvases (constant), not slide count. |
| **`StoryModePage.tsx` grows too large** | Medium | File is 1843 lines. Adding ~80 lines brings it to ~1920. If it exceeds 2100 lines, extract `ExportModal` to `src/components/ExportModal.tsx`. Not a blocker for V0. |
| **Preview canvas blocks main thread** | Low | Preview runs at ≤24fps on a downscaled canvas (480px wide). Should not impact builder interaction. If it does, add `requestIdleCallback` throttling. |

---

## Future Considerations (Post-Validation)

Only pursue these if analytics show animated exports are shared and drive return usage.

- GIF export with quality mitigation (reduced palette on backgrounds, higher palette on screenshot content)
- Per-slide duration control (simple slider: 1s / 1.5s / 2s / 3s)
- Separate `/animate` route for a dedicated animated story experience
- Intro/outro title card generation
- Background music (royalty-free tracks, browser-side)
