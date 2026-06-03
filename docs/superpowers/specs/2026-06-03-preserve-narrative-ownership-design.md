# Preserve User Narrative Ownership — Design Spec
**Date:** 2026-06-03
**Status:** Approved for implementation

---

## Problem

The story builder silently reorders uploaded screenshots once all assets finish decoding. `sequenceStory` runs pixel analysis on every screenshot, assigns a narrative role (`intro`, `feature`, `output`, etc.) to each one, then sorts slides into a predefined role order (`intro → context → feature → process → output → cta`). It also overwrites every slide's title, callout, and label text with values from the intent's template slots, based on the new sorted positions.

The result: a user who uploads [Dashboard → Create Project → Add Team → Generate Report] receives the animation in whatever order the pixel heuristics prefer, with titles they didn't choose. This breaks narrative trust — the product is silently changing the message the user intends to communicate.

---

## Principle

**User order is canonical.** The upload sequence (or any order the user manually arranges) must be preserved unchanged throughout story generation. Role detection may label slides to enrich metadata; it must never alter their position or overwrite their assigned text.

---

## Scope

This spec covers one file: `src/pages/StoryModePage.tsx`.

No new UI is required. The existing drag-and-drop thumbnail strip in the upload step and the up/down arrows in the builder sidebar already satisfy the explicit-reordering requirement.

The optional "Suggested Story Structure" feature (show the AI's preferred order with Accept/Reject buttons) is explicitly out of scope for this sprint.

---

## Changes

### 1. Rename `sequenceStory` → `applyRoleDetection`

The function name must reflect what the function does. After this sprint, it no longer sequences anything.

### 2. Remove sorting

Delete:

```typescript
// Remove ROLE_ORDER constant
const ROLE_ORDER: Record<StoryRole, number> = {
  intro: 0, context: 1, feature: 2, process: 3, output: 4, cta: 5, uncertain: 6
}

// Remove sort
const sortedSlides = [...mappedSlides].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
```

### 3. Remove text and label overwrite

Delete the `sortedSlides.map(...)` block that re-assigns `title`, `callout`, and `roleLabel` from template slots based on sorted position:

```typescript
// Remove this entirely — handleContinue already assigned correct text at creation
return sortedSlides.map((slide, i) => {
  const tpl = tplSlides[i] ?? tplSlides[tplSlides.length - 1] ?? { ... }
  return {
    ...slide,
    title: tpl.defaultTitle || 'Launch slide ' + (i + 1),
    callout: tpl.defaultCallout || 'Feature',
    roleLabel: tpl.label || 'Step ' + (i + 1),
  }
})
```

### 4. Return mapped slides in original order

After role detection, return slides in original order with only `role` updated:

```typescript
// Keep
return mappedSlides  // same order as input, only role field updated
```

### 5. Remove `confidence` field from `StorySlide`

`confidence: 0` is set at slide creation but never read anywhere in active code. Remove it from the interface and from the `handleContinue` slide construction.

### 6. Add `userDefinedPosition: number` to `StorySlide`

Add a permanent architectural guardrail to the `StorySlide` interface:

```typescript
export interface StorySlide {
  // ...existing fields...
  userDefinedPosition: number  // upload index; immutable — no automated process may change this
}
```

Set it once in `handleContinue` from the map index `i`:

```typescript
userDefinedPosition: i,
```

`applyRoleDetection` must spread `...slide` and never overwrite `userDefinedPosition`. Add a mandatory comment on the function:

```typescript
// CRITICAL: User order is canonical.
// This function may update `role` metadata only.
// It must never reorder slides, reassign positions, or overwrite user-authored text.
// No automated process may change slide order unless explicitly initiated by the user.
function applyRoleDetection(...): StorySlide[] {
```

**Why `userDefinedPosition` beats a boolean flag:** a boolean at the session level can be silently ignored. A `number` field on each slide is a testable invariant — `slides.every((s, i) => s.userDefinedPosition === i)` should always hold unless the user reordered manually. It also drives the future role-badge feature: "Detected: Feature (slide 3 of 6)."

### 7. Update the `sequenced` useEffect call site

The useEffect calls `sequenceStory` — update to `applyRoleDetection`. No other change to the useEffect logic.

---

## What Is Preserved

- `analyzeScreenshot` — unchanged. Pixel analysis is retained as metadata enrichment.
- `VisualSignals` interface — unchanged.
- `mapTemplateRoleToStoryRole` — unchanged. Still used by `handleContinue` for initial role assignment from template slot.
- `sequenced` state and useEffect — logic unchanged. Still fires once per session after all assets decode.
- All manual reordering UI — unchanged.

---

## Post-Change Behaviour

When a user uploads screenshots A → B → C → D:

1. `handleContinue` creates slides [A, B, C, D] with template slot text for positions 1, 2, 3, 4.
2. Assets decode in the background.
3. `applyRoleDetection` fires once. Each slide's `role` field is updated based on pixel analysis. Order stays [A, B, C, D]. Title, callout, and roleLabel are untouched.
4. The animation exports slides in order: A → B → C → D.

---

## Out of Scope

- `narrativeSequencing.ts` — unused module, no change needed
- Suggested Story Structure UI (optional future feature)
- Changes to animation, export, or any other pipeline stage
