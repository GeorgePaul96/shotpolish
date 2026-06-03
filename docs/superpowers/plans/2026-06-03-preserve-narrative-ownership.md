# Preserve User Narrative Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove automatic slide reordering so the user's upload sequence (or any manually arranged sequence) is always preserved; keep pixel-based role detection as metadata-only enrichment.

**Architecture:** Two edits to `StoryModePage.tsx`. Task 1 adds the `userDefinedPosition` guardrail field to `StorySlide` and removes the dead `confidence` field. Task 2 replaces `sequenceStory` with `applyRoleDetection`, which keeps the pixel analysis loop but deletes the sort and the text-overwrite block, then updates the call site.

**Tech Stack:** TypeScript, React 18, Vitest (existing), `src/pages/StoryModePage.tsx` only.

---

## File Map

| File | Change |
|---|---|
| `src/pages/StoryModePage.tsx` | Only file modified. Two tasks, two commits. |

---

## Task 1: Add `userDefinedPosition` guardrail, remove dead `confidence` field

**Files:**
- Modify: `src/pages/StoryModePage.tsx:35-45` (interface) and `:340-350` (handleContinue slide construction)

- [ ] **Step 1.1 — Add `userDefinedPosition` to `StorySlide` interface**

Find the `StorySlide` interface (line 35). It currently ends with `callouts?: Callout[]`. Add the guardrail field as the last property:

```typescript
export interface StorySlide {
  id: string
  assetId: string
  role: StoryRole
  roleLabel: string
  title: string
  callout: string
  selection: Selection | null
  spotlight?: SpotlightRegion
  callouts?: Callout[]
  // Immutable upload index — no automated process may change this.
  // User order is canonical: slides must always render in this sequence
  // unless the user explicitly reorders them via drag-and-drop or arrow controls.
  userDefinedPosition: number
}
```

- [ ] **Step 1.2 — Set `userDefinedPosition` and remove `confidence` in `handleContinue`**

In `handleContinue` (inside `UploadStep`), find the `uploadedItems.map` callback that constructs each `StorySlide`. It currently looks like:

```typescript
return {
  id: `slide-${i}-${Date.now()}`,
  assetId,
  role: mapTemplateRoleToStoryRole(template.role),
  roleLabel: template.label,
  confidence: 0,
  title: template.defaultTitle,
  callout: template.defaultCallout,
  selection: null,
}
```

Replace with (remove `confidence: 0`, add `userDefinedPosition: i`):

```typescript
return {
  id: `slide-${i}-${Date.now()}`,
  assetId,
  role: mapTemplateRoleToStoryRole(template.role),
  roleLabel: template.label,
  title: template.defaultTitle,
  callout: template.defaultCallout,
  selection: null,
  userDefinedPosition: i,
}
```

- [ ] **Step 1.3 — Fix any other slide construction sites that need `userDefinedPosition`**

Search for all places in `StoryModePage.tsx` that construct a `StorySlide` object literal (other than `handleContinue`) and add `userDefinedPosition` to each. Run:

```bash
cd "c:/Users/georg/OneDrive/Desktop/Projects/ShotPolish"
npx tsc --noEmit 2>&1 | grep -i "userDefinedPosition\|StorySlide"
```

TypeScript will report every construction site missing the new required field. Fix each one. Common sites to check:

- Bridge restore (restores slides from editor): look for `session.slides.map(s => ({` — add `userDefinedPosition: s.userDefinedPosition ?? 0`
- Workspace restore: look for `workspace.slides` being set into state — these come from persisted data so may already have the field if stored correctly; add fallback `?? 0`

- [ ] **Step 1.4 — TypeScript compile check**

```bash
cd "c:/Users/georg/OneDrive/Desktop/Projects/ShotPolish"
npx tsc --noEmit
```

Expected: only the pre-existing `gifenc` TS7016 warning. Zero new errors.

- [ ] **Step 1.5 — Run tests**

```bash
npm test
```

Expected: 9 tests pass. The `storyAnimationExport.test.ts` suite uses `AnimSlide` (a separate minimal interface) and is unaffected by changes to `StorySlide`.

- [ ] **Step 1.6 — Commit**

```bash
git add src/pages/StoryModePage.tsx
git commit -m "feat: add userDefinedPosition guardrail to StorySlide, remove dead confidence field"
```

---

## Task 2: Replace `sequenceStory` with `applyRoleDetection`

**Files:**
- Modify: `src/pages/StoryModePage.tsx:1671-1740` (function body) and `:1868` (useEffect call site)

- [ ] **Step 2.1 — Replace the entire `sequenceStory` function**

Find this section (starting around line 1671):

```typescript
// ─── Suggested Sequencer — reorder slides by signal score, apply template copy ─
function sequenceStory(
  slides: StorySlide[],
  assets: Record<string, StoryAsset>,
  intent: StoryIntent
): StorySlide[] {
  const tplSlides = intent.slides
  const mappedSlides = slides.map((slide, i) => {
    ...
  })

  // Sort slides according to standard Story Graph order:
  const ROLE_ORDER: Record<StoryRole, number> = {
    intro: 0, context: 1, feature: 2, process: 3, output: 4, cta: 5, uncertain: 6
  }
  const sortedSlides = [...mappedSlides].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])

  // Apply titles & templates based on intent slides
  return sortedSlides.map((slide, i) => {
    const tpl = tplSlides[i] ?? tplSlides[tplSlides.length - 1] ?? { defaultTitle: '', defaultCallout: '', label: '' }
    return {
      ...slide,
      title: tpl.defaultTitle || 'Launch slide ' + (i + 1),
      callout: tpl.defaultCallout || 'Feature',
      roleLabel: tpl.label || 'Step ' + (i + 1),
    }
  })
}
```

Replace the **entire block** (section header comment + function) with:

```typescript
// ─── Role Detection — enriches slide metadata without altering order ──────────

// CRITICAL: User order is canonical.
// This function may update `role` metadata only.
// It must never reorder slides, reassign positions, or overwrite user-authored text.
// No automated process may change slide order unless explicitly initiated by the user.
function applyRoleDetection(
  slides: StorySlide[],
  assets: Record<string, StoryAsset>,
): StorySlide[] {
  return slides.map(slide => {
    const asset = assets[slide.assetId]
    if (!asset || asset.status !== 'ready' || !asset.decodedImage) return slide

    const analysis = analyzeScreenshot(asset.decodedImage)

    let score = 0
    if (analysis.hasCTA)          score += 3
    if (analysis.hasMetrics)       score += 3
    if (analysis.uiComplexity > 0.4) score += 2
    if (analysis.textDensity < 0.25) score += 1

    let bestFitRole: StoryRole = 'uncertain'
    if      (analysis.hasCTA    || score >= 5) bestFitRole = 'cta'
    else if (analysis.hasMetrics || score >= 3) bestFitRole = 'output'
    else if (analysis.uiComplexity > 0.4)       bestFitRole = 'feature'
    else if (analysis.textDensity > 0.35)        bestFitRole = 'process'
    else if (analysis.textDensity < 0.25)        bestFitRole = 'intro'
    else                                         bestFitRole = 'context'

    return { ...slide, role: bestFitRole }
  })
}
```

- [ ] **Step 2.2 — Update the `sequenced` useEffect call site**

Find the useEffect that calls `sequenceStory` (around line 1868):

```typescript
if (allReady) {
  setSlides(prev => sequenceStory(prev, assets, intent))
  setSequenced(true)
}
```

Replace with (remove `intent` argument, new function name):

```typescript
if (allReady) {
  setSlides(prev => applyRoleDetection(prev, assets))
  setSequenced(true)
}
```

- [ ] **Step 2.3 — TypeScript compile check**

```bash
cd "c:/Users/georg/OneDrive/Desktop/Projects/ShotPolish"
npx tsc --noEmit
```

Expected: only the pre-existing `gifenc` TS7016 warning. Zero new errors.

If you see `Cannot find name 'sequenceStory'`, you missed a call site — search with:

```bash
grep -n "sequenceStory" src/pages/StoryModePage.tsx
```

- [ ] **Step 2.4 — Run tests**

```bash
npm test
```

Expected: 9 tests pass.

- [ ] **Step 2.5 — Browser verification**

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173/story`. Upload 3–5 screenshots in a deliberate sequence (e.g., name them 1, 2, 3 visually). Proceed to the builder. Confirm:

1. The slide list in the left sidebar shows slides in **exact upload order**.
2. Wait ~2 seconds for assets to decode. The slide order must **not change** after decoding.
3. The slide titles and callouts must match the template slot text from upload — they must **not be overwritten**.
4. Open the export modal and confirm the preview animation plays in the correct upload order.

- [ ] **Step 2.6 — Commit**

```bash
git add src/pages/StoryModePage.tsx
git commit -m "feat: replace sequenceStory with applyRoleDetection — preserve user narrative order"
```
