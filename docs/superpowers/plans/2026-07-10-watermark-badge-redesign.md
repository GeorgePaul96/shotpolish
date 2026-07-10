# Watermark Badge Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic grey watermark pill with an on-brand "branded pill" — a violet "S" mark tile + the ShotPolish wordmark ("Shot" accented) + the readable remix link — so free exports read as ShotPolish and earn remix clicks.

**Architecture:** Rewrite the single pure function `drawWatermark()` in `src/lib/composition.ts` plus a small module-private `fillRoundRect` helper. Everything is canvas primitives (no SVG import). The badge only renders for free exports (`opts.watermark !== false`), unchanged. Tests drive the rendered-call contract via a spied 2D context.

**Tech Stack:** TypeScript, Canvas 2D API, Vitest.

## Global Constraints

- Badge draws ONLY when `opts?.watermark !== false`. Paid users get nothing. (verbatim invariant)
- All sizes derive from `compW` via a `unit` so the badge reads the same on a 1200px card and a 2160px story.
- Brand tokens (from `src/index.css` + `public/favicon.svg`): mark tile fill `#7C3AED` (`--accent`), accent text `#a78bfa` (`--accent-soft`, reads better than `#7C3AED` on the dark pill), pill `rgba(15,17,26,0.55)`.
- `drawWatermark` signature is unchanged: `(ctx, watermark: Rect, compW, compH, opts?)`. The `watermark: Rect` param stays for call-site compatibility even though the function computes its own box (as today). Do not touch the call site at `src/lib/composition.ts:1183`.
- No route, landing, or entitlement changes. No anti-crop / frame-integration work.
- `npm test` and `npm run build` must pass before merge. (On Windows PowerShell, node is at `C:\Program Files\nodejs`; prefix PATH if `npm` is not found.)

---

### Task 1: Branded-pill badge redesign

**Files:**
- Modify: `src/lib/composition.ts` — rewrite `drawWatermark()` (currently lines 819-889), add module-private `fillRoundRect` helper.
- Test: `src/lib/composition.watermark.test.ts` — rewrite the assertions to the new contract.

**Interfaces:**
- Consumes: `RenderOptions { watermark?: boolean; remixUrl?: string }` and `Rect` from `src/lib/composition.ts` (already defined, lines 127-144).
- Produces: `drawWatermark(ctx, watermark: Rect, compW: number, compH: number, opts?: RenderOptions): void` — signature unchanged. New module-private helper `fillRoundRect(ctx, x, y, w, h, r): void` (not exported).

- [ ] **Step 1: Rewrite the failing tests**

Replace the entire body of `src/lib/composition.watermark.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { drawWatermark } from './composition'
import type { Rect } from './composition'

// Records which 2D-context methods were called. Only the members drawWatermark touches are implemented.
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillText: (t: string) => calls.push(`fillText:${t}`),
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath: () => calls.push('beginPath'),
    roundRect: () => calls.push('roundRect'),
    fill: () => calls.push('fill'),
    fillRect: () => calls.push('fillRect'),
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set fillStyle(_v: string) {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const wm: Rect = { x: 100, y: 100, w: 80, h: 20 }

describe('drawWatermark', () => {
  it('draws the violet "S" mark tile', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(calls).toContain('fillText:S')
  })

  it('renders the ShotPolish wordmark with an accented "Shot" segment', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    // Line 1 is drawn as three segments so "Shot" can render in the accent color.
    expect(calls).toContain('fillText:Made with ')
    expect(calls).toContain('fillText:Shot')
    expect(calls).toContain('fillText:Polish')
  })

  it('draws the mark by default (opts undefined)', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, undefined)
    expect(calls).toContain('fillText:S')
    expect(calls).toContain('fillText:Shot')
  })

  it('bakes the remix url into the badge when provided', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true, remixUrl: 'shotpolish.org/r/launch-indigo' })
    expect(calls).toContain('fillText:shotpolish.org/r/launch-indigo')
  })

  it('omits the second line when no remix url is given', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    const urlLines = calls.filter(c => c.startsWith('fillText:shotpolish'))
    expect(urlLines).toEqual([])
  })

  it('draws the pill background', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(calls).toContain('roundRect')
  })

  it('draws nothing when watermark is false', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: false })
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- composition.watermark`
Expected: FAIL — the current implementation draws `fillText:Made with ShotPolish` as one string and never draws `fillText:S`, so `draws the violet "S" mark tile` and the segmented-wordmark test fail.

- [ ] **Step 3: Add the `fillRoundRect` helper**

In `src/lib/composition.ts`, add this module-private helper immediately above `export function drawWatermark(` (currently line 819):

```ts
// Fill a rounded rectangle, falling back to a plain rect where roundRect is
// unavailable (older canvas impls). Used by the watermark pill and mark tile.
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath()
    ;(ctx as any).roundRect(x, y, w, h, r)
    ctx.fill()
  } else {
    ctx.fillRect(x, y, w, h)
  }
}
```

- [ ] **Step 4: Rewrite `drawWatermark`**

Replace the entire `drawWatermark` function body (currently lines 819-889) with:

```ts
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  _watermark: Rect,
  compW: number,
  compH: number,
  opts?: RenderOptions,
) {
  if (opts?.watermark === false) return

  const url = opts?.remixUrl // e.g. "shotpolish.org/r/launch-indigo"

  // Brand tokens (mirror src/index.css + public/favicon.svg).
  const MARK_BG      = '#7C3AED'              // --accent (mark tile)
  const ACCENT_TEXT  = '#a78bfa'              // --accent-soft (reads on dark pill)
  const WHITE_STRONG = 'rgba(255,255,255,0.92)'
  const WHITE_DIM    = 'rgba(255,255,255,0.62)'

  ctx.save()

  // Scale everything off composition width so the badge reads the same on a
  // 1200px tweet card or a 2160px story.
  const unit    = Math.max(Math.round(compW * 0.011), 11)
  const padX    = Math.round(unit * 0.85)
  const padY    = Math.round(unit * 0.6)
  const lineGap = Math.round(unit * 0.35)
  const markGap = Math.round(unit * 0.6)
  const margin  = Math.max(Math.round(compW * 0.014), 12)

  const brandFont = `600 ${unit}px 'Inter',system-ui,sans-serif`
  const urlFont   = `500 ${Math.round(unit * 0.84)}px 'Inter',system-ui,sans-serif`

  // ── Measure the text block ──
  const brandH = unit
  const urlH   = url ? Math.round(unit * 0.84) : 0
  const textH  = brandH + (url ? lineGap + urlH : 0)

  // Line 1 is three segments so "Shot" can be accent-colored.
  const seg1 = 'Made with '
  const seg2 = 'Shot'
  const seg3 = 'Polish'
  ctx.font = brandFont
  const seg1W  = ctx.measureText(seg1).width
  const seg2W  = ctx.measureText(seg2).width
  const seg3W  = ctx.measureText(seg3).width
  const brandW = seg1W + seg2W + seg3W

  let urlW = 0
  if (url) { ctx.font = urlFont; urlW = ctx.measureText(url).width }

  const textW    = Math.max(brandW, urlW)
  const markSize = textH // square mark tile as tall as the text block

  const boxW   = Math.round(markSize + markGap + textW + padX * 2)
  const boxH   = Math.round(textH + padY * 2)
  const right  = compW - margin
  const bottom = compH - margin
  const left   = right - boxW
  const top    = bottom - boxH
  const radius = Math.round(boxH * 0.28)

  // ── Pill background ──
  ctx.fillStyle = 'rgba(15,17,26,0.55)'
  fillRoundRect(ctx, left, top, boxW, boxH, radius)

  // ── Mark tile: violet rounded square + white "S" ──
  const markX = left + padX
  const markY = top + padY
  ctx.fillStyle = MARK_BG
  fillRoundRect(ctx, markX, markY, markSize, markSize, Math.round(markSize * 0.28))

  ctx.fillStyle    = '#ffffff'
  ctx.font         = `800 ${Math.round(markSize * 0.62)}px 'Inter',system-ui,sans-serif`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('S', markX + markSize / 2, markY + markSize / 2 + Math.round(markSize * 0.04))

  // ── Text block, left-aligned to the right of the mark ──
  const textX = markX + markSize + markGap
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'

  // Line 1: "Made with " + "Shot"(accent) + "Polish"
  ctx.font = brandFont
  let x = textX
  ctx.fillStyle = WHITE_STRONG
  ctx.fillText(seg1, x, top + padY); x += seg1W
  ctx.fillStyle = ACCENT_TEXT
  ctx.fillText(seg2, x, top + padY); x += seg2W
  ctx.fillStyle = WHITE_STRONG
  ctx.fillText(seg3, x, top + padY)

  // Line 2: the remix link
  if (url) {
    ctx.font      = urlFont
    ctx.fillStyle = WHITE_DIM
    ctx.fillText(url, textX, top + padY + brandH + lineGap)
  }

  ctx.restore()
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- composition.watermark`
Expected: PASS (all 8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/composition.ts src/lib/composition.watermark.test.ts
git commit -m "feat(now): on-brand branded-pill watermark badge

Violet S-tile mark + ShotPolish wordmark (Shot accented) + remix link.
Sharpens the remix viral loop so free exports read as ShotPolish.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Docstring cleanup + full verification

**Files:**
- Modify: `src/lib/remix.ts` — stale `shotpolish.app` docstrings.
- Modify: `src/lib/composition.ts` — the `RenderOptions.remixUrl` docstring example (lines 137-143) says `shotpolish.app`.

**Interfaces:**
- Consumes: nothing new.
- Produces: no runtime change — comments only.

- [ ] **Step 1: Find every stale `shotpolish.app` reference**

Run: `git grep -n "shotpolish.app"`
Expected: matches in `src/lib/remix.ts` (docstring examples) and `src/lib/composition.ts` (the `RenderOptions.remixUrl` doc example). These are comments only — the runtime host (`RAW_BASE` in `remix.ts`) is already `shotpolish.org`.

- [ ] **Step 2: Replace `shotpolish.app` → `shotpolish.org` in those docstrings**

In `src/lib/remix.ts`, update the example in the `buildRemixUrl` docstring:

```ts
/**
 * Human-readable link baked into the watermark badge.
 * With a template id: "shotpolish.org/r/launch-indigo".
 * Without one (custom style): just the host, so the badge always carries a link.
 */
```

In `src/lib/composition.ts`, update the `RenderOptions.remixUrl` docstring example:

```ts
  /**
   * Short, human-readable link baked into the watermark badge (e.g.
   * "shotpolish.org/r/launch-indigo"). Drives the remix viral loop: a viewer
   * of a posted asset can type/scan it to remix that exact style. Ignored when
   * watermark is false. See src/lib/remix.ts.
   */
```

- [ ] **Step 3: Verify no stale references remain**

Run: `git grep -n "shotpolish.app"`
Expected: no matches (exit code 1, no output).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files (was 11 files / 64 tests; watermark file now has 8 tests).

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: exit 0, `✓ built in …`, `SPA fallback: copied dist/index.html -> dist/404.html`. (The "chunk >500 kB" warning is expected and not a failure.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/remix.ts src/lib/composition.ts
git commit -m "docs(now): correct stale shotpolish.app -> shotpolish.org in remix docstrings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification (after both tasks)

The unit tests spy on the 2D context but do not prove the badge *looks* right. Before calling this done, verify visually:

1. `npm run dev`, open the editor, upload/keep a screenshot, and export a **free** (non-paid) asset.
2. Confirm the bottom-right badge shows: violet "S" tile + "Made with **Shot**Polish" (Shot in violet) + a `shotpolish.org/r/<id>` line, legible over both a light and a dark screenshot.
3. Confirm a **paid** export (watermark off) shows no badge.
4. Export at two very different sizes (e.g. a small card and a Story) and confirm the badge scales proportionally and stays inside the safe margin.

## Self-review notes (author)

- **Spec coverage:** mark tile (Task 1 Step 4), accented "Shot" wordmark (Step 4 + tests Step 1), remix link line (Step 4 + test), dark pill retained (Step 4), scale-off-`compW` (Step 4), free-only invariant (early return + test), crop-resistance non-goal (not implemented, per spec), test updates (Task 1 Step 1), docstring cleanup (Task 2). All spec sections mapped.
- **Type consistency:** `fillRoundRect` used identically in both call sites; `drawWatermark` signature unchanged (renamed unused `watermark`→`_watermark` param only); `RenderOptions`/`Rect` reused, not redefined.
- **No placeholders:** every code step shows complete code; every run step shows the exact command and expected result.
