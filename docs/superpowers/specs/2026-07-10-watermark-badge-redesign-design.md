# Watermark Badge Redesign — On-brand "Branded Pill"

> Design spec. Date: 2026-07-10. Phase: sharpen the Remix viral loop.
> Status: approved, ready for implementation plan.

## Why

The Remix watermark loop is ShotPolish's primary growth engine: every free
export carries a badge with a `shotpolish.org/r/<template>` link that deep-loads
the exact style for a viewer ("make yours"). The loop's plumbing already works
end to end — the badge bakes in the link ([composition.ts](../../../src/lib/composition.ts)),
`/r/:id` redirects to the editor, and the editor pre-applies the template plus a
sample screenshot ([EditorPage.tsx:718-733](../../../src/pages/EditorPage.tsx)).

The one unambiguous gap: the badge itself is a generic white-on-grey translucent
pill — no logo mark, no brand accent. The growth plan flags this as make-or-break
("make the badge beautiful, or people crop it out"). This phase makes the badge
on-brand and recognizable so exports read as ShotPolish and the link earns clicks.

## Scope

**In scope:** rewrite `drawWatermark()` in `src/lib/composition.ts`. Extend the
existing watermark test. Fix stale docstrings in `src/lib/remix.ts`.

**Out of scope (already works or deliberately deferred):**
- `/r/:id` route and editor remix-landing pre-fill — already functional.
- Entitlement / free-vs-paid gating — unchanged.
- Anti-crop / frame-integration tricks — deliberately NOT this phase (see below).
- Any change to the remix link format or template ids.

## Brand reference (verified in code)

- Mark: rounded square tile with a bold white "S" — see `public/favicon.svg`
  (`rect rx=8`, white "S"). Product UI (`Navbar.tsx`) uses the same S-tile.
- Accent color: `--accent: #7C3AED` (violet), `--accent-soft: #a78bfa`
  (`src/index.css:26-27`).
- Wordmark: "**Shot**Polish" with "Shot" in accent, "Polish" near-black.

## Design

Bottom-right of every **free** export (unchanged position + safe margin):

```
 ╭─────────────────────────────────╮
 │  [S]  Made with ShotPolish      │   line 1: "Shot" violet, rest white ~92%
 │       shotpolish.org/r/launch   │   line 2: link, white ~60%, smaller
 ╰─────────────────────────────────╯
   [S] = violet rounded "S" tile, vertically centered, on the left
   translucent dark pill (rgba(15,17,26,0.55)) behind everything
```

### Layout mechanics
- **Mark tile:** rounded square drawn with canvas primitives (no SVG import).
  Fill `#7C3AED`; white bold "S" centered. Side length ≈ the two-line text block
  height. Placed left, vertically centered, with padding to the text.
- **Text block (left-aligned, to the right of the mark):**
  - Line 1 "Made with ShotPolish": drawn in two segments so "Shot" renders in
    `#a78bfa`/accent and "Polish" (plus "Made with ") in white ~92%. Use
    `textAlign = 'left'` and advance x by measured segment widths.
  - Line 2: the remix link string (`opts.remixUrl`), white ~60%, ~0.84× the
    line-1 font size.
- **Pill:** translucent dark rounded-rect (`rgba(15,17,26,0.55)`) sized to
  contain mark + text + padding; keeps text legible over any screenshot. Reuse
  the existing `roundRect`-with-`fillRect`-fallback pattern.
- **Scaling:** keep the current approach — derive a `unit` from `compW` (e.g.
  `Math.max(round(compW * 0.011), 11)`) and size padding, gaps, fonts, and the
  mark off it — so the badge reads consistently from a 1200px tweet card to a
  2160px story.

### Behavior (unchanged)
- Drawn only when `opts?.watermark !== false`. Paid users get no badge.
- No template id → `opts.remixUrl` is the bare host (`shotpolish.org`); the badge
  still renders mark + "Made with ShotPolish" + host. Same fallback as today.

### Crop-resistance — deliberate non-goal
We rely on the badge being attractive enough to leave in, and keep it
corner-placed. Anti-crop tricks (baking a subtle mark into the composition frame)
are a possible future phase, explicitly NOT built here.

## Testing

Extend `src/lib/composition.watermark.test.ts`:
- **Keep** the invariant: `watermark: false` ⇒ `drawWatermark` draws nothing
  (no `fillRect`/`roundRect`/`fillText` calls).
- **Add:** with `watermark` enabled and a `remixUrl`, assert (via a spied 2D
  context) that the pill is drawn, the mark tile is drawn, both text lines render,
  and the exact `remixUrl` string is passed to `fillText`.
- **Add:** the no-template fallback path renders the bare host string.

Run `npm test` (Vitest) and `npm run build` — both must pass before merge.

## Cleanup (in the same change)

`src/lib/remix.ts` docstrings reference `shotpolish.app`, but `RAW_BASE` and every
runtime path use `shotpolish.org`. Correct the stale comments to `shotpolish.org`
so the docs match behavior. No runtime change.

## Files touched

| File | Change |
|---|---|
| `src/lib/composition.ts` | Rewrite `drawWatermark()` (mark tile + branded two-line text + pill). |
| `src/lib/composition.watermark.test.ts` | Extend coverage per above. |
| `src/lib/remix.ts` | Fix stale `shotpolish.app` → `shotpolish.org` docstrings. |

## Success criteria

- Free exports show the on-brand badge: violet "S" tile + "**Shot**Polish"
  wordmark + readable `/r/<id>` link, legible over light and dark screenshots.
- Paid exports show no badge (unchanged).
- Badge scales correctly across export sizes.
- `npm test` and `npm run build` pass.
