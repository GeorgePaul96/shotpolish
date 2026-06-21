# PROJECT_MAP.md — ShotPolish

One line per source file so you can locate code without scanning. Line counts
are approximate (token-cost signal). Read large files by range, not whole.

## Entry / config
| File | ~LOC | Purpose |
|------|-----:|---------|
| `index.html` | — | Vite HTML entry |
| `src/main.tsx` | — | React mount |
| `src/App.tsx` | 34 | Router; defines all routes |
| `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json` | — | Build/style/TS config |
| `vercel.json`, `public/_redirects`, `scripts/copy-spa-fallback.mjs` | — | SPA fallback / hosting |

## Routes (src/App.tsx)
`/` Home · `/editor` · `/story` · `/settings/brand` · `/pricing` · `/account`
· `/privacy` · `/terms` · `/r/:id` + `/remix/:id` (remix-loop entry → redirects to
`/editor?remix=<id>`, which pre-applies that template)

## Pages (`src/pages/`)
| File | ~LOC | Purpose |
|------|-----:|---------|
| `StoryModePage.tsx` | 2087 | Multi-slide "story" builder + animated export. **Largest file.** |
| `EditorPage.tsx` | 1543 | Single-shot editor screen wiring the tool + export. **Large.** |
| `BrandKitPage.tsx` | 182 | Brand kit CRUD (colors/typography/logo) against `brand_kits`. |
| `AccountPage.tsx` | 143 | Plan view, brand-kit link, sign out, two-step delete. |
| `HomePage.tsx` | — | Landing (composes the marketing sections). |
| `PricingPage.tsx` | 80 | Plans + Stripe checkout entry. |

## Components (`src/components/`)
| File | ~LOC | Purpose |
|------|-----:|---------|
| `ShotPolishTool.tsx` | 1199 | Core editor UI (upload, controls, live canvas). **Large.** |
| `FeedbackButton.tsx` | 291 | In-app feedback widget. |
| `LivePreviewSection.tsx` | 274 | Landing live-preview demo. |
| `HeroSection.tsx` | 227 | Landing hero (uses public/hero-*.png). |
| `AuthProvider.tsx` | 165 | Session context; loads plan + brand kit; auth state. |
| `FeaturesSection.tsx` | 155 | Landing features. |
| `Navbar.tsx` | 145 | Nav + account link. |
| `LegalPages.tsx` | 118 | Privacy / Terms content. |
| `AuthModal.tsx` | 86 | Email OTP + Google OAuth sign-in. |
| `UpgradeGate.tsx` | — | Wraps paid-only UI; prompts upgrade for free plan. |
| `CtaSection.tsx`, `FooterSection.tsx` | — | Landing sections. |

## Lib (`src/lib/`) — pure logic unless noted
| File | ~LOC | Purpose |
|------|-----:|---------|
| `composition.ts` | 1122 | Canvas render pipeline (layout, watermark, themes). **Large.** |
| `workspaceStore.ts` | 289 | Hybrid persistence: Supabase `workspaces` (auth) / local (anon). |
| `storyAnimationExport.ts` | 231 | Story → animated frames export. |
| `motionExport.ts` | 213 | MP4/WebM/GIF export pipeline (async, progress callbacks). |
| `templates.ts` | 205 | Single-shot layout templates. |
| `storyTemplates.ts` | 179 | Slide templates for story mode. |
| `narrativeSequencing.ts` | 171 | Orders slides into a launch arc (deterministic). |
| `captionComposer.ts` | 153 | Copy variant composer (deterministic). |
| `aiSuggestions.ts` | 153 | Hand-written copy suggestions by intent (no API). |
| `postingGuide.ts` | 146 | Platform-ordered launch plan (deterministic). |
| `launchTimeline.ts` | 128 | Slide-based rollout recommendations (deterministic). |
| `socialFormats.ts` | 103 | Platform format/aspect definitions. |
| `contextEngine.ts` | 102 | Stores product context; keyword preset inference. |
| `compositionBridge.ts` | 85 | Story↔Editor in-memory singleton across navigation. |
| `analytics.ts` | 61 | Lightweight analytics events. |
| `pendingUpload.ts` | — | Carries a dropped File from landing into the editor. |
| `entitlements.ts` | 27 | **Pure** plan→feature mapping (source of truth, client side). |
| `remix.ts` | — | **Pure** remix-loop URL helpers (watermark badge link + `/r/:id` path). |
| `account.ts` | — | `isDeleteConfirmed`, `accountPlanView`, `deleteAccount` call. |
| `gifEncoder.ts` | — | gifenc wrapper used by the worker. |
| `supabase.ts` | 6 | Supabase client (dummy fallback when env unset). |

## Hooks / workers
| File | ~LOC | Purpose |
|------|-----:|---------|
| `hooks/useCompositionCanvas.ts` | 161 | Drives canvas render from props/refs. |
| `hooks/useEntitlement.ts` | — | Resolves plan/features from AuthProvider. |
| `workers/encode.worker.ts` | — | Off-thread GIF encoding via gifEncoder. |

## Backend (`supabase/`)
| File | Purpose |
|------|---------|
| `schema.sql` | Canonical schema: profiles/workspaces/brand_kits/stripe_events + RLS + trigger. |
| `migrations/0001_profiles_plan.sql` | Adds plan columns + stripe_events. |
| `migrations/0002_profiles_cascade.sql` | profiles→auth.users ON DELETE CASCADE. |
| `functions/stripe-webhook/index.ts` | Signature verify, dedupe, apply plan update. |
| `functions/delete-account/index.ts` | Self-only account deletion (JWT-derived id). |
| `functions/_shared/mapStripeEvent.ts` | Pure Stripe-event → plan-update mapping. |

## Tests (Vitest)
`entitlements`, `account`, `composition.watermark`, `gifEncoder`,
`pendingUpload`, `storyAnimationExport`, `_shared/mapStripeEvent`.

## Historical (don't read unless doing archaeology)
`docs/superpowers/plans/*` and `docs/superpowers/specs/*` — milestone planning
docs (M0 billing, M1 client, M2 auth, story export, narrative ownership).
`audit_report.md` — earlier product/security assessment (partly stale).
