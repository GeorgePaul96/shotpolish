# ShotPolish — Product Vision & Phased Roadmap

> What ShotPolish could be in 12–24 months, and the phased path there from
> today's codebase. Companion to `GROWTH_PLAN.md` (distribution tactics);
> this document is about the **product**. Constraints assumed: solo founder,
> ~10 hrs/wk, <$100/mo infra, building on the existing React/Vite/Supabase stack.
>
> Decisions locked during brainstorming (2026-07-03):
> - Frame: vision + phased path (now / next / later).
> - AI stance: **selective real AI** — narrow, cheap model calls only where they
>   clearly beat the deterministic engines; never a generative-image arms race.
> - Thesis: **A + slices of B/C** — weekly product-marketing OS as the spine,
>   light developer integrations in "next/later," template marketplace in "later."

---

## 1. The vision

**ShotPolish becomes the product-marketing visual OS for small software teams.**

Not a screenshot beautifier — that market is commodity, crowded (Shots.so,
Screely, Pika, BrandBird, Xnapper, Canva), and being eaten from below by free
tools and from above by AI image models. The tool ShotPolish becomes is the one
a founder, DevRel, or agency opens **every week**, because their product's
ongoing story — launches, feature drops, changelogs, milestones — needs to
become on-brand animated visuals, and they have no designer.

One sentence: *"Your product ships every week. ShotPolish turns every ship into
scroll-stopping, on-brand visuals — carousels, launch kits, changelog drops —
in minutes, without a designer, without your screenshots ever leaving your
browser."*

The category anchor is **launch carousels**. Story Mode (animated multi-slide
export) is the only genuinely differentiated capability in the codebase and the
only one no direct competitor has. The roadmap treats Story Mode as *the
product*, with the single-shot editor as the on-ramp.

### Why "weekly" is the whole strategy
The audit and growth plan both identified the same fatal flaw: launches are
episodic. A launch tool gets used 6 days per year. Every phase below exists to
convert episodic use into cadence use — templates named after recurring rituals
(changelog, feature Friday), imports that start from a release note, reminders
tied to shipping, and pricing that charges the people who post weekly.

---

## 2. How it stands out (the five pillars)

No single pillar is defensible alone; the *combination* is hard to copy.

1. **Animated launch carousels (Story Mode).** Every direct competitor exports
   a static PNG. ShotPolish exports an animated multi-slide story. Motion wins
   feeds; multi-slide wins LinkedIn. This is the category claim: own the phrase
   "launch carousel" the way Carrd owns "one-page site."

2. **Zero marginal cost → the most generous free tier in the category.**
   Rendering is 100% client-side (`src/lib/composition.ts`, canvas, gifenc
   worker). A free user costs ~$0. Competitors with server-side rendering or AI
   inference cannot match unlimited free exports without bleeding. That funds
   the remix watermark loop (already shipped) forever.

3. **Private by architecture.** Screenshots never leave the browser. For
   agencies handling client material and teams with unreleased features under
   NDA, "we physically cannot see your screenshots" is a real differentiator
   against every upload-based tool and every AI tool. This must be marketed,
   not just true.

4. **Brand Kit → consistency at cadence.** One-off beautifiers make a pretty
   image; ShotPolish makes *your* image — same palette, logo, style every week,
   across every client (once multi-kit ships). Consistency is what agencies and
   DevRel are actually paid for.

5. **Grounded copy + selective AI: "never hallucinates your launch copy."**
   The deterministic engines (`aiSuggestions`, `narrativeSequencing`,
   `captionComposer`, etc.) stop masquerading as AI and become the honesty
   angle. Where a cheap LLM pass genuinely beats keyword logic (polishing
   headline variants from *the user's own release notes*), add it as an
   explicit, optional step. The user's text goes to a model only when they ask;
   images never do. Positioning writes itself in 2026's AI-slop fatigue:
   *founder-tested templates + your real words, not a hallucinated launch post.*

### Competitive posture in one line each
- **vs. static beautifiers (Shots.so, Screely, Pika…):** they end at a PNG;
  ShotPolish ends at a posted, animated, on-brand carousel.
- **vs. Canva:** Canva is a general editor with 400 decisions; ShotPolish is
  "paste screenshot + pick ritual → done in 2 minutes," locked to your brand.
- **vs. AI image models:** they invent pixels (risky for product UI — buttons
  that don't exist, garbled text); ShotPolish frames *real* pixels and never
  uploads them. Don't fight them on generation; win on truth, speed, brand.

---

## 3. Phase NOW (months 0–3): own the beachhead

Goal: make "animated launch/changelog carousels" undeniably the product, and
make the loop measurable. Mostly extends existing code.

| # | Feature | What it is | Builds on | Effort |
|---|---|---|---|---|
| N1 | **Cadence template packs** | Story Mode sequence presets named after rituals: "Changelog Drop," "Feature Friday," "Launch Countdown," "Week in Review," "Milestone" (users/MRR/stars). Each = slide structure + grounded copy prompts + brand-kit slots. | `narrativeSequencing`, Story Mode presets, `composition.ts` | Med |
| N2 | **PDF carousel export** | LinkedIn carousels are PDF document posts — the highest-value B2B surface, currently unreachable from ShotPolish. Render each slide to a PDF page client-side (pdf-lib/jsPDF). | export pipeline, slide renderer | Low-Med |
| N3 | **WebM/MP4 export** | GIF is heavy and caps quality; X/LinkedIn autoplay video. `canvas.captureStream()` + MediaRecorder gives WebM client-side for ~free; MP4 later if needed (wasm encoder). | `encode.worker.ts` pipeline | Med |
| N4 | **Funnel instrumentation** | PostHog events: export, badge impression, badge click, remix open, remix export, signup, upgrade. Without this every later decision is a guess. | `analytics.ts` (per growth plan) | Low |
| N5 | **Positioning rewrite** | Landing page, titles, OG tags rewritten around launch carousels + the five pillars; drop unqualified "AI" claims; add "private by architecture" section. | landing components | Low |
| N6 | **LTD offer live** | `ltd` plan exists in code — put it on sale (own audience first). Cash + first real customers. | pricing page, Stripe | Low |

**Exit criteria / metrics:** remix loop instrumented end-to-end (badge CTR,
remix→export rate known, not guessed); ≥1 cadence pack shipped and used in
public posts; PDF export live; first paying customers (LTD or Pro).
**Kill/pivot signal:** if badge CTR < 0.2% after redesign and 10k+ impressions,
the loop thesis needs rework before investing in "later" moats.

---

## 4. Phase NEXT (months 3–9): the recurring wedge + the revenue SKU

Goal: convert cadence positioning into cadence *behavior*, and ship the plan
the business model actually needs.

| # | Feature | What it is | Notes | Effort |
|---|---|---|---|---|
| X1 | **Team/Agency plan** | Seats, **multiple brand kits** (one per client), client folders for workspaces. The SKU $5–10k MRR requires (per GROWTH_PLAN Phase 9). | New `orgs`/`members` tables + RLS; extend `entitlements.ts` **and** `mapStripeEvent.ts` (Plan union is duplicated — keep in sync); new Stripe prices. | High |
| X2 | **Changelog import** | Paste release notes (markdown/URL) → `narrativeSequencing` + `captionComposer` auto-draft a slide sequence; user drops screenshots into slots. The single biggest "weekly habit" feature: the input is something they already wrote. | Deterministic first; grounded engines already exist. | Med |
| X3 | **Selective AI: copy polish (first real model call)** | Optional "polish headlines" button on drafted slides: one cheap LLM call (Haiku-class) via a new edge function, input = user's own text only. Explicit, opt-in, never images. Rename remaining fake-AI labels to "Smart"/"Grounded." | New edge fn + env key; ~$0.001/use, Pro-gated. | Med |
| X4 | **Cadence memory** | "Your last Changelog Drop was 12 days ago" nudge + optional weekly email ("ship anything? make the visual in 2 min"). Lightweight retention mechanic, not a full calendar. | `workspaces` timestamps, one cron/email | Low-Med |
| X5 | **Referral (give/get Pro)** | Standard loop from GROWTH_PLAN Phase 4; cheap once entitlements support granting time-boxed Pro. | `entitlements.ts` | Med |
| X6 | **Remix loop v2** | Remix links carry the full template (not just style); "remix this" on every gallery/showcase asset; seed 20 public templates as SEO pages. | shipped remix route | Med |

**Exit criteria / metrics:** Team plan live with ≥5 paying teams; W4 retention
for users who used a cadence pack vs. not (the thesis test); changelog-import
usage ≥25% of Story Mode sessions; MRR $1–3k (subs + amortized LTD).
**Kill/pivot signal:** if cadence-pack users retain no better than others at
W4, the weekly thesis is wrong — fall back to agency/multi-client value (X1)
as the primary wedge.

---

## 5. Phase LATER (months 9–24): moats

Only start these once the loop and the wedge show signal. Ordered by
(evidence required, ascending).

| # | Feature | What it is | Why it's a moat | Effort |
|---|---|---|---|---|
| L1 | **Template gallery → UGC marketplace** | Public gallery of user-published templates, each a remixable SEO page ("SaaS changelog carousel template"). Later: creator attribution, maybe rev-share. | Network effect + compounding SEO; cloneable product, uncloneable library. Needs the remix-loop traffic from NOW/NEXT to avoid cold-start. | High |
| L2 | **GitHub release integration (thin)** | A GitHub Action / webhook that turns a published release into a **pre-filled ShotPolish carousel link** (deep-link with release notes injected via X2). No server-side rendering — stays client-side, stays cheap. | Puts ShotPolish inside the shipping ritual itself; DevRel wedge from thesis B at ~10% of its cost. | Med |
| L3 | **Embeddable changelog visuals / simple API** | "Powered by ShotPolish" embeddable asset for changelog pages; a minimal API only if paying teams pull for it. | B2B lock-in; every embed is a badge. | High |
| L4 | **Selective AI, round 2** | Smart crop/subject detection for screenshots (**in-browser model only** — e.g. ONNX/wasm — never a cloud vision call, or pillar 3 dies), background palette from logo (mostly deterministic), copy variants per platform (X vs LinkedIn tone). Each individually justified, each optional. | Keeps "grounded" promise while closing the polish gap with AI tools. | Med each |
| L5 | **Team collaboration** | Shared template libraries, comments/approvals on carousels (agency→client review). | Seat expansion inside orgs; raises switching cost. | High |

**24-month picture if it works:** a few hundred teams/agencies at $40–80/mo +
a Pro long tail ≈ $10k+ MRR (GROWTH_PLAN Phase 9 math), a template library
competitors can't copy, distribution that funds itself via the watermark/remix
loop, and a brand that owns "launch carousel."

---

## 6. Pricing evolution

| Plan | Now | Next | Later |
|---|---|---|---|
| **Free** | Unlimited exports, watermark/remix badge. Stays generous forever — it *is* the growth engine. | + cadence packs (watermarked) | + gallery publishing |
| **Pro** ($12–15/mo) | No watermark, Brand Kit, all templates, HD/animated export | + PDF/video export, AI copy polish, cadence memory | + AI round 2 |
| **Team/Agency** ($39–79/mo) | — | **Ships in NEXT.** Seats, multi-brand-kit, client folders | + collaboration, embeds/API |
| **LTD** ($59–99 one-time) | On sale now (cash lever, capped seats) | Sunset for new buyers once MRR works | — |

Pricing specifics (exact tiers/labels, Customer Portal) were previously
deferred by the founder — finalize during NOW phase before the LTD goes live.

---

## 7. Kill list (unchanged from GROWTH_PLAN, restated because it's load-bearing)

- **No generative-image arms race.** No screenshot-to-scene, no style-transfer
  models, no diffusion anything. AI is text-polish and assist only.
- **No general design editor.** Every surface stays "pick ritual → 3 choices →
  export." The moment ShotPolish has an artboard, Canva wins.
- **No video editing.** Animated slide export ≠ a timeline editor.
- **No paid ads** until organic CAC/LTV is known.
- **No native/desktop apps, no server-side rendering** — the client-side
  architecture is pillar #2 and #3; don't trade it for convenience.

---

## 8. Sequencing logic (why this order)

1. NOW makes the differentiated thing (Story Mode) reach the surfaces that
   matter (LinkedIn PDF, video) and makes the loop measurable — cheap,
   additive, no schema changes.
2. NEXT spends the first real engineering budget on the two things the
   business model demands: a reason to return weekly (X2/X4) and a plan worth
   $50+/mo (X1). Real AI enters only here, only for text, only opt-in.
3. LATER builds moats that *require* traffic and revenue to work (marketplace
   cold-start, API pull from paying teams). Building them earlier is the
   classic solo-founder failure mode.

Every phase has an explicit kill/pivot signal so the roadmap self-corrects
instead of compounding a wrong bet.
