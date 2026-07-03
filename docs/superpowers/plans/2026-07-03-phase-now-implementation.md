# Phase NOW Implementation Plan (Roadmap N1–N6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement roadmap Phase NOW (spec: `docs/superpowers/specs/2026-07-03-product-vision-roadmap-design.md`): cadence template packs, LinkedIn PDF carousel export, remaining funnel analytics, and the launch-carousel positioning rewrite.

**Architecture:** Everything stays 100% client-side. New pure logic goes in `src/lib/` with Vitest coverage; UI wiring goes into the existing Story Mode export modal and pricing/landing surfaces. One new dependency: `pdf-lib` (client-side PDF assembly, works in node for tests).

**Tech Stack:** React 18 + TS 5 + Vite 5, Vitest (node environment — **no jsdom, no DOM APIs in tests**), pdf-lib, Plausible via existing `src/lib/analytics.ts`.

## Scope corrections discovered against the codebase (do not re-add these)

- **N3 (WebM/MP4 export) already exists** — `src/lib/motionExport.ts` + `exportStoryAsVideo` in `src/lib/storyAnimationExport.ts`. No task for it.
- **N6 (LTD) code side already exists** — `src/pages/PricingPage.tsx` has an `ltd` tier driven by `VITE_STRIPE_PAYMENT_LINK_LTD`. Remaining work is Stripe dashboard config, which the founder deferred. No task for it.
- Analytics wrapper (Plausible) already exists with most funnel events; only the gaps in Task 4 are missing.

## Global Constraints

- Client-side only: no new network calls, no server-side rendering, no model calls.
- Free-tier renders keep the watermark path exactly as-is; do not touch watermark logic.
- Do not modify the `Plan` union (`src/lib/entitlements.ts` / `supabase/functions/_shared/mapStripeEvent.ts`) — out of scope for this phase.
- Tests run via `npm test` (Vitest, `environment: 'node'`). Tests must not reference `document`, real `window`, or canvas.
- New story intents must reuse the existing role vocabulary already used in `STORY_INTENTS` (e.g. `hook`, `feature`, `cta`, `step-1`) — `StoryRole` mapping downstream depends on familiar strings.
- Analytics calls go through `Events` in `src/lib/analytics.ts`; never call `window.plausible` directly.
- Copy rule from spec: never describe the deterministic engines as "AI"; the word "AI" must not appear in new marketing copy.

---

### Task 1: Cadence story template packs (N1)

**Files:**
- Modify: `src/lib/storyTemplates.ts` (append to `STORY_INTENTS`)
- Test: `src/lib/storyTemplates.test.ts` (new)

**Interfaces:**
- Consumes: existing `StoryIntent` / `SlideTemplate` interfaces in `storyTemplates.ts`, `SOCIAL_FORMATS` from `src/lib/socialFormats.ts`.
- Produces: four new intents with ids `feature-friday`, `week-in-review`, `launch-countdown`, `milestone` available in `STORY_INTENTS` (Story Mode picks them up automatically — the page renders whatever is in the array).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storyTemplates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { STORY_INTENTS } from './storyTemplates'
import { SOCIAL_FORMATS } from './socialFormats'

describe('STORY_INTENTS', () => {
  it('has unique intent ids', () => {
    const ids = STORY_INTENTS.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every intent has at least 3 slides with complete copy', () => {
    for (const intent of STORY_INTENTS) {
      expect(intent.slides.length, intent.id).toBeGreaterThanOrEqual(3)
      for (const s of intent.slides) {
        expect(s.role, intent.id).toBeTruthy()
        expect(s.label, intent.id).toBeTruthy()
        expect(s.defaultTitle, intent.id).toBeTruthy()
        expect(s.defaultSubtitle, intent.id).toBeTruthy()
        expect(s.defaultCallout, intent.id).toBeTruthy()
      }
    }
  })

  it('every advertised format exists in SOCIAL_FORMATS', () => {
    for (const intent of STORY_INTENTS) {
      for (const f of intent.formats) {
        expect(SOCIAL_FORMATS[f], `${intent.id} → ${f}`).toBeDefined()
      }
    }
  })

  it('includes the cadence ritual packs', () => {
    const ids = STORY_INTENTS.map(i => i.id)
    for (const id of ['feature-friday', 'week-in-review', 'launch-countdown', 'milestone']) {
      expect(ids).toContain(id)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storyTemplates.test.ts`
Expected: FAIL — "includes the cadence ritual packs" fails (existing intents pass the structural tests).

- [ ] **Step 3: Append the four cadence intents**

In `src/lib/storyTemplates.ts`, append these entries to the `STORY_INTENTS` array (after the `product-hunt-launch` entry, before the closing `]`):

```ts
  {
    id: 'feature-friday',
    label: 'Feature Friday',
    icon: '🗓️',
    description: 'Weekly spotlight on one feature — post it every Friday',
    formats: ['linkedin-carousel', 'twitter-post', 'linkedin-post'],
    color: '#818cf8',
    slides: [
      { role: 'hook',    label: 'Hook',        defaultTitle: 'Feature Friday, week 12.',        defaultSubtitle: 'One feature. One minute. Every Friday.',           defaultCallout: 'Feature Friday' },
      { role: 'feature', label: 'The Feature', defaultTitle: 'This week: [feature name].',      defaultSubtitle: 'The small thing that saves you the most time.',    defaultCallout: 'This week' },
      { role: 'demo',    label: 'In Action',   defaultTitle: "Here's what it looks like.",      defaultSubtitle: 'Straight from the product — no mockups.',          defaultCallout: 'Real screenshot' },
      { role: 'cta',     label: 'CTA',         defaultTitle: 'New feature every Friday.',       defaultSubtitle: 'Follow along so you never miss one.',              defaultCallout: 'See you next week' },
    ],
  },
  {
    id: 'week-in-review',
    label: 'Week in Review',
    icon: '📅',
    description: 'Everything you shipped this week, in one carousel',
    formats: ['linkedin-carousel', 'linkedin-post', 'twitter-post'],
    color: '#38bdf8',
    slides: [
      { role: 'headline', label: 'Headline',   defaultTitle: 'What we shipped this week.',      defaultSubtitle: 'A quick tour of everything new.',                  defaultCallout: 'Week in review' },
      { role: 'step-1',   label: 'Ship 1',     defaultTitle: 'Shipped: [first thing].',         defaultSubtitle: 'Why we built it and who asked for it.',            defaultCallout: 'Shipped ✓' },
      { role: 'step-2',   label: 'Ship 2',     defaultTitle: 'Shipped: [second thing].',        defaultSubtitle: 'A fix, an improvement, or a brand-new capability.', defaultCallout: 'Shipped ✓' },
      { role: 'result',   label: 'The Numbers',defaultTitle: 'The week by the numbers.',        defaultSubtitle: 'Commits, releases, users helped — your pick.',      defaultCallout: 'This week' },
      { role: 'cta',      label: 'CTA',        defaultTitle: 'Back next week.',                 defaultSubtitle: 'We ship every week and post it every week.',        defaultCallout: 'Follow along' },
    ],
  },
  {
    id: 'launch-countdown',
    label: 'Launch Countdown',
    icon: '⏳',
    description: 'Build anticipation in the days before a launch',
    formats: ['twitter-post', 'linkedin-post', 'instagram-post'],
    color: '#fb7185',
    slides: [
      { role: 'tease',      label: 'Teaser',     defaultTitle: 'Something new is coming.',      defaultSubtitle: "We've been building this for months.",             defaultCallout: 'Coming soon' },
      { role: 'sneak-peek', label: 'Sneak Peek', defaultTitle: 'A first look.',                 defaultSubtitle: 'One corner of what launches next week.',           defaultCallout: 'Sneak peek' },
      { role: 'date',       label: 'The Date',   defaultTitle: 'Launching [date].',             defaultSubtitle: 'Mark it. You saw it here first.',                  defaultCallout: 'Save the date' },
      { role: 'cta',        label: 'Reminder',   defaultTitle: "Don't miss it.",                defaultSubtitle: 'Follow now and catch the launch live.',            defaultCallout: 'Get notified' },
    ],
  },
  {
    id: 'milestone',
    label: 'Milestone',
    icon: '🎉',
    description: 'Celebrate users, revenue, stars — build in public',
    formats: ['twitter-post', 'linkedin-post', 'linkedin-carousel'],
    color: '#fcd34d',
    slides: [
      { role: 'headline', label: 'The Number',  defaultTitle: 'We just hit [milestone].',       defaultSubtitle: 'A number that felt impossible a year ago.',        defaultCallout: 'Milestone 🎉' },
      { role: 'journey',  label: 'The Journey', defaultTitle: 'How we got here.',               defaultSubtitle: 'Shipped weekly. Listened constantly. No shortcuts.', defaultCallout: 'The journey' },
      { role: 'thanks',   label: 'Thank You',   defaultTitle: 'This one is on you.',            defaultSubtitle: 'Every user, every bug report, every share. Thanks.', defaultCallout: 'Thank you' },
      { role: 'cta',      label: 'CTA',         defaultTitle: 'On to the next one.',            defaultSubtitle: 'Follow the journey — next milestone loading.',      defaultCallout: 'Next up →' },
    ],
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/storyTemplates.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Full test suite + commit**

Run: `npm test` — expected: all green.

```bash
git add src/lib/storyTemplates.ts src/lib/storyTemplates.test.ts
git commit -m "feat(now): cadence story packs — Feature Friday, Week in Review, Launch Countdown, Milestone"
```

---

### Task 2: PDF builder library (N2, pure logic)

**Files:**
- Create: `src/lib/pdfExport.ts`
- Test: `src/lib/pdfExport.test.ts`
- Modify: `package.json` (add `pdf-lib`)

**Interfaces:**
- Consumes: nothing from the app — pure module.
- Produces (used by Task 3):
  - `dataUrlToBytes(dataUrl: string): Uint8Array`
  - `buildPdfFromPngs(pngs: Uint8Array[]): Promise<Uint8Array>` — one PDF page per PNG, page sized to the image's own pixel dimensions, image drawn full-bleed. Throws `Error('Cannot build an empty PDF')` on `[]`.

- [ ] **Step 1: Install pdf-lib**

Run: `npm install pdf-lib`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/pdfExport.test.ts` (node-safe: `atob` is a Node ≥16 global; no DOM):

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildPdfFromPngs, dataUrlToBytes } from './pdfExport'

// 1×1 opaque PNG
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('dataUrlToBytes', () => {
  it('decodes a data URL into PNG bytes', () => {
    const bytes = dataUrlToBytes(PNG_1x1)
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]) // PNG magic
  })
})

describe('buildPdfFromPngs', () => {
  it('builds one page per PNG at the image dimensions', async () => {
    const png = dataUrlToBytes(PNG_1x1)
    const pdfBytes = await buildPdfFromPngs([png, png, png])
    const doc = await PDFDocument.load(pdfBytes)
    expect(doc.getPageCount()).toBe(3)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBe(1)
    expect(height).toBe(1)
  })

  it('rejects an empty page list', async () => {
    await expect(buildPdfFromPngs([])).rejects.toThrow('empty')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/pdfExport.test.ts`
Expected: FAIL — cannot resolve `./pdfExport`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/pdfExport.ts`:

```ts
// LinkedIn carousels are PDF "document" posts: one page per slide.
// Pure helpers — no DOM APIs, so they run in Vitest (node) and the browser.
import { PDFDocument } from 'pdf-lib'

/** Decode a base64 data URL (e.g. canvas.toDataURL output) into raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Assemble PNG slides into a multi-page PDF, one page per image, each page
 * sized to its image so slides render full-bleed with no margins.
 */
export async function buildPdfFromPngs(pngs: Uint8Array[]): Promise<Uint8Array> {
  if (pngs.length === 0) throw new Error('Cannot build an empty PDF')
  const doc = await PDFDocument.create()
  for (const png of pngs) {
    const image = await doc.embedPng(png)
    const page = doc.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  return doc.save()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/pdfExport.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdfExport.ts src/lib/pdfExport.test.ts package.json package-lock.json
git commit -m "feat(now): pdf-lib based PNG->PDF builder for LinkedIn carousel export"
```

---

### Task 3: Wire PDF carousel export into the Story export modal (N2, UI)

**Files:**
- Modify: `src/lib/analytics.ts` (add three `Events` entries)
- Modify: `src/pages/StoryModePage.tsx` (export modal component, ~lines 520–865)

**Interfaces:**
- Consumes: `buildPdfFromPngs` / `dataUrlToBytes` from Task 2; existing page-local `renderSlideOffscreen(slide, assets, formatId, themeIndex, padding, shadowOpacity, frameType, brandKit): string | null` (line ~67); existing `validSlides`, `intent`, `brandKit`, `Events` inside the modal component.
- Produces: a "LinkedIn Carousel (PDF)" section in the export modal; analytics events `story_pdf_started`, `story_pdf_complete`, `story_pdf_error`.

No unit test — this is DOM/canvas wiring, untestable in the node environment. Verification is manual (Step 5) plus the full suite staying green.

- [ ] **Step 1: Add the analytics events**

In `src/lib/analytics.ts`, inside the `Events` object after the `// Story animation` block, add:

```ts
  // Story PDF carousel (LinkedIn document posts)
  storyPdfStarted:     (slides: number)                => track('story_pdf_started',  { slides }),
  storyPdfComplete:    (slides: number)                => track('story_pdf_complete', { slides }),
  storyPdfError:       (slides: number)                => track('story_pdf_error',    { slides }),
```

- [ ] **Step 2: Add imports and state to the export modal**

In `src/pages/StoryModePage.tsx`:

Add to the imports at the top of the file:

```ts
import { buildPdfFromPngs, dataUrlToBytes } from '../lib/pdfExport'
```

Inside the export-modal component, next to the existing `animStatus` state (~line 534), add:

```ts
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
```

- [ ] **Step 3: Add the export handler**

Directly after `handleAnimDownload` (~line 678), add:

```ts
  const handlePdfExport = async () => {
    if (pdfStatus === 'exporting' || validSlides.length === 0) return
    setPdfStatus('exporting')
    Events.storyPdfStarted(validSlides.length)
    try {
      const pngs: Uint8Array[] = []
      for (const slide of validSlides) {
        // LinkedIn documents render best square — always export the carousel format.
        const dataUrl = renderSlideOffscreen(
          slide, assets, 'linkedin-carousel', themeIndex, padding, shadowOpacity, frameType, brandKit,
        )
        if (dataUrl) pngs.push(dataUrlToBytes(dataUrl))
        await new Promise(r => setTimeout(r, 0)) // keep the modal responsive
      }
      const pdfBytes = await buildPdfFromPngs(pngs)
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${intent.id}-carousel.pdf`; a.style.display = 'none'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setPdfStatus('done')
      Events.storyPdfComplete(validSlides.length)
    } catch {
      setPdfStatus('error')
      Events.storyPdfError(validSlides.length)
    }
  }
```

- [ ] **Step 4: Add the modal section**

In the modal JSX, immediately after the line `{/* ── End Animated Story section ──────────────────────────── */}` (~line 797) and before `{status === 'done' ? (`, insert:

```tsx
        {/* ── LinkedIn Carousel PDF section ───────────────────────── */}
        <div className="px-5 pt-4 pb-3 border-b border-[#E5E7EC]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
            LinkedIn Carousel (PDF)
          </p>
          {pdfStatus === 'exporting' ? (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#374151]">
              <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
              Building PDF…
            </div>
          ) : pdfStatus === 'error' ? (
            <div className="text-[11px] text-red-400 text-center py-1">
              PDF export failed.{' '}
              <button onClick={() => setPdfStatus('idle')} className="underline">Try again</button>
            </div>
          ) : (
            <>
              <button
                onClick={handlePdfExport}
                disabled={validSlides.length === 0}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-[#DDE0E8] bg-white text-[#111827] hover:bg-gray-50"
              >
                {pdfStatus === 'done' ? 'Download again ↓' : `Download ${validSlides.length}-page PDF ↓`}
              </button>
              <p className="text-[10px] text-[#9CA3AF] text-center mt-1">
                Upload as a LinkedIn document post — each slide becomes a swipeable page.
              </p>
            </>
          )}
        </div>
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev` → open the printed localhost URL → Build Story → pick any intent → add a screenshot → Export → in the modal, click "Download N-page PDF".
Expected: a PDF downloads; opening it shows one 1080×1080 page per slide, matching the slide previews. Console (dev) shows `[Analytics] story_pdf_started` and `story_pdf_complete`.

- [ ] **Step 6: Full suite + commit**

Run: `npm test` — expected: all green.

```bash
git add src/lib/analytics.ts src/pages/StoryModePage.tsx
git commit -m "feat(now): LinkedIn carousel PDF export in Story Mode export modal"
```

---

### Task 4: Close the analytics gaps — remix→export and pricing clicks (N4)

**Files:**
- Modify: `src/lib/analytics.ts` (two `Events` entries)
- Modify: `src/pages/EditorPage.tsx` (remix-landing effect ~line 707; `handleExportCurrent` ~line 254)
- Modify: `src/pages/PricingPage.tsx` (tier CTA click)
- Test: `src/lib/analytics.test.ts` (new)

**Interfaces:**
- Consumes: existing `track` / `Events` from `src/lib/analytics.ts`; `sessionStorage` key `sp_remix` (new, set on remix landing, read at export).
- Produces: events `remix_export_completed` (with `templateId`) and `pricing_tier_clicked` (with `tier`). Together with existing `remix_landed`, this makes the spec's remix→export rate measurable in Plausible.

- [ ] **Step 1: Write the failing test**

Create `src/lib/analytics.test.ts` (node-safe — installs a fake `window` on `globalThis`):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { track, Events } from './analytics'

afterEach(() => { delete (globalThis as any).window })

describe('track', () => {
  it('is a no-op when plausible is absent', () => {
    expect(() => track('test_event', { a: 1 })).not.toThrow()
  })

  it('forwards name and props to window.plausible when present', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    track('test_event', { a: 1 })
    expect(spy).toHaveBeenCalledWith('test_event', { props: { a: 1 } })
  })
})

describe('Events', () => {
  it('remixExported reports the template id', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.remixExported('launch-indigo')
    expect(spy).toHaveBeenCalledWith('remix_export_completed', { props: { templateId: 'launch-indigo' } })
  })

  it('pricingTierClicked reports the tier', () => {
    const spy = vi.fn()
    ;(globalThis as any).window = { plausible: spy }
    Events.pricingTierClicked('ltd')
    expect(spy).toHaveBeenCalledWith('pricing_tier_clicked', { props: { tier: 'ltd' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics.test.ts`
Expected: FAIL — `Events.remixExported` / `Events.pricingTierClicked` are not functions (the two `track` tests pass).

- [ ] **Step 3: Add the events**

In `src/lib/analytics.ts`, in the `Events` object under the existing `// Remix viral loop` comment, extend to:

```ts
  // Remix viral loop
  remixLanded:         (templateId: string)            => track('remix_landed',           { templateId }),
  remixExported:       (templateId: string)            => track('remix_export_completed', { templateId }),

  // Monetization funnel
  pricingTierClicked:  (tier: string)                  => track('pricing_tier_clicked',   { tier }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the remix session flag in EditorPage**

In `src/pages/EditorPage.tsx`, in the remix-landing effect (~line 712), after `Events.remixLanded(t.id)` add:

```ts
      sessionStorage.setItem('sp_remix', t.id)
```

In `handleExportCurrent` (~line 266), directly after `Events.exportCompleted(intent, theme.name)` add:

```ts
    const remixId = sessionStorage.getItem('sp_remix')
    if (remixId) Events.remixExported(remixId)
```

- [ ] **Step 6: Wire the pricing click in PricingPage**

In `src/pages/PricingPage.tsx`:

Add the import:

```ts
import { Events } from '../lib/analytics'
```

Change the configured-tier anchor (line ~67) from:

```tsx
                  <a href={url!} className="btn-primary mt-5 px-4 py-2 text-center text-sm">Choose {tier.name}</a>
```

to:

```tsx
                  <a href={url!} onClick={() => Events.pricingTierClicked(tier.id)} className="btn-primary mt-5 px-4 py-2 text-center text-sm">Choose {tier.name}</a>
```

- [ ] **Step 7: Full suite + commit**

Run: `npm test` — expected: all green.

```bash
git add src/lib/analytics.ts src/lib/analytics.test.ts src/pages/EditorPage.tsx src/pages/PricingPage.tsx
git commit -m "feat(now): remix->export and pricing-click funnel events"
```

---

### Task 5: Positioning rewrite — launch carousels, no "AI", privacy (N5)

**Files:**
- Modify: `index.html` (title, meta description, OG/Twitter tags)
- Modify: `src/components/HeroSection.tsx` (headline, subheadline, social-proof line)

**Interfaces:**
- Consumes: nothing.
- Produces: copy only — no API changes.

No unit test (copy change); verification is `npm run build` + visual check.

- [ ] **Step 1: Rewrite the head metadata**

In `index.html`, replace lines 6–21 (title through twitter:image) with:

```html
    <title>ShotPolish — Animated launch carousels from your screenshots</title>
    <meta name="description" content="Turn product screenshots into animated launch carousels, changelog drops, and feature announcements — on-brand, in minutes, and 100% in your browser. Your screenshots never leave your device." />

    <!-- Open Graph -->
    <meta property="og:title" content="ShotPolish — Animated launch carousels from your screenshots" />
    <meta property="og:description" content="Launch carousels, changelog drops, and feature announcements from your real screenshots — on-brand, in minutes, private by design." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://shotpolish.org" />
    <meta property="og:image" content="https://shotpolish.org/hero-after.png" />
    <meta property="og:image:alt" content="A product screenshot polished by ShotPolish" />
    <meta property="og:site_name" content="ShotPolish" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="ShotPolish — Animated launch carousels from your screenshots" />
    <meta name="twitter:description" content="Launch carousels, changelog drops, and feature announcements from your real screenshots — on-brand, in minutes, private by design." />
    <meta name="twitter:image" content="https://shotpolish.org/hero-after.png" />
```

- [ ] **Step 2: Rewrite the hero copy**

In `src/components/HeroSection.tsx`:

Replace the headline content (lines ~100–102, inside the `<motion.h1>`):

```tsx
        Turn screenshots into{' '}
        <span className="text-gradient">animated launch carousels.</span>
```

Replace the subheadline text (line ~109, inside the `<motion.p>`):

```tsx
        Launches, feature drops, changelogs — every week, on-brand, without a designer.
```

Replace the social-proof line (line ~142):

```tsx
        No account required · Your screenshots never leave your browser
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds. Then `npm run dev` and eyeball the hero: new headline, subheadline, and privacy line render correctly on desktop width.

- [ ] **Step 4: Full suite + commit**

Run: `npm test` — expected: all green.

```bash
git add index.html src/components/HeroSection.tsx
git commit -m "feat(now): reposition landing around animated launch carousels, drop AI claims, add privacy line"
```

---

## Post-plan verification (after all tasks)

- [ ] `npm test` — full suite green.
- [ ] `npm run build` — production build succeeds.
- [ ] Manual smoke: Story Mode shows the four new cadence intents; PDF export produces a multi-page PDF; hero shows new copy; pricing CTA fires `pricing_tier_clicked` in dev console.
