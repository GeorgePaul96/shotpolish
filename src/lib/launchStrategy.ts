// Launch strategy generation — intent-aware, product-type-aware
// Generates actionable platform strategy with honest, explainable rationale
// Fully deterministic — no ML, no fabrication

import type { StoryRole } from './composition'
import type { StoryIntent } from './storyTemplates'
import type { PageType } from './ocr'

export interface PlatformStrategy {
  platform: string
  formatId: string
  platformColor: string
  objective: 'awareness' | 'engagement' | 'conversion' | 'education'
  recommendedFormat: string
  rationale: string
  slideCount: string
  postingWindow: string
}

export interface SequencingStep {
  order: number
  platform: string
  action: string
  emphasis: string
  timeFromLaunch: string
}

export interface RecommendedAsset {
  label: string
  slideRole: StoryRole
  reason: string
}

export interface LaunchStrategy {
  launchType: string
  productType: string
  productTypeRationale: string
  primaryPlatforms: PlatformStrategy[]
  sequencingPlan: SequencingStep[]
  messagingFocus: string[]
  recommendedAssets: RecommendedAsset[]
  confidence: number
}

interface SlideInfo {
  role: StoryRole
  title: string
}

export type ProductType =
  | 'analytics-saas'
  | 'workflow-tool'
  | 'consumer-app'
  | 'developer-tool'
  | 'commercial-product'
  | 'early-stage'
  | 'general-product'

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  'analytics-saas':     'Analytics / Data product',
  'workflow-tool':      'Workflow / Productivity tool',
  'consumer-app':       'Consumer application',
  'developer-tool':     'Developer tool',
  'commercial-product': 'Commercial product',
  'early-stage':        'Early-stage product',
  'general-product':    'General product',
}

const PLATFORM_COLORS: Record<string, string> = {
  'twitter-post':    '#e7e9ea',
  'linkedin-post':   '#0077b5',
  'product-hunt':    '#da552f',
  'instagram-post':  '#e1306c',
  'instagram-story': '#c13584',
  'og-image':        '#7c3aed',
  'reddit-post':     '#ff4500',
}

// ─── Product type inference ───────────────────────────────────────────────────

function inferProductType(
  pageTypes: PageType[],
  slides: SlideInfo[],
  intent: StoryIntent,
): { type: ProductType; rationale: string } {
  const counts: Partial<Record<PageType, number>> = {}
  for (const pt of pageTypes) counts[pt] = (counts[pt] ?? 0) + 1

  if ((counts['analytics'] ?? 0) + (counts['dashboard'] ?? 0) >= 2)
    return { type: 'analytics-saas', rationale: 'Multiple analytics or dashboard screens detected via OCR' }
  if ((counts['workflow'] ?? 0) + (counts['editor'] ?? 0) >= 2)
    return { type: 'workflow-tool', rationale: 'Multiple workflow or editor screens detected via OCR' }
  if (counts['pricing'])
    return { type: 'commercial-product', rationale: 'Pricing screen detected — commercial-intent product' }
  if ((counts['onboarding'] ?? 0) >= 2)
    return { type: 'early-stage', rationale: 'Onboarding-heavy screens — likely early-stage or pre-launch' }
  if (counts['auth'] && (counts['feature_demo'] ?? 0) >= 1)
    return { type: 'consumer-app', rationale: 'Auth + feature demo screens — likely consumer application' }

  // Intent-based fallbacks when OCR signals are weak
  if (intent.id === 'product-launch')
    return { type: 'early-stage', rationale: 'Product launch intent — defaulting to early-stage strategy (OCR signal weak)' }
  if (intent.id === 'tutorial')
    return { type: 'workflow-tool', rationale: 'Tutorial intent — likely workflow or education product' }

  return { type: 'general-product', rationale: 'Insufficient OCR signals for product type inference — using general strategy' }
}

// ─── Platform strategies per product type ────────────────────────────────────

function buildPlatforms(
  productType: ProductType,
  slides: SlideInfo[],
): PlatformStrategy[] {
  const n = slides.length
  const hasProof = slides.some(s => s.role === 'output')
  const hasCTA = slides.some(s => s.role === 'cta')

  switch (productType) {
    case 'analytics-saas':
      return [
        {
          platform: 'LinkedIn', formatId: 'linkedin-post', platformColor: PLATFORM_COLORS['linkedin-post'],
          objective: 'education',
          recommendedFormat: `Carousel (all ${n} slides)`,
          rationale: 'Analytics products resonate on LinkedIn — decision-makers value metrics stories, carousels get 3× reach of single posts',
          slideCount: `All ${n} slides`,
          postingWindow: 'Tuesday–Thursday, 8–10am local time',
        },
        {
          platform: 'Product Hunt', formatId: 'product-hunt', platformColor: PLATFORM_COLORS['product-hunt'],
          objective: 'conversion',
          recommendedFormat: 'Full story gallery',
          rationale: 'PH audience actively evaluates data tools — lead with your strongest dashboard or metric screenshot',
          slideCount: `All ${n} slides`,
          postingWindow: '12:01 AM PST on launch day',
        },
        {
          platform: 'X / Twitter', formatId: 'twitter-post', platformColor: PLATFORM_COLORS['twitter-post'],
          objective: 'awareness',
          recommendedFormat: 'Single most striking dashboard view',
          rationale: 'Twitter drives early velocity — post 1–2 hours before PH launch to seed discussion',
          slideCount: '1 slide (most striking metric or dashboard)',
          postingWindow: '1–2 hours before PH launch',
        },
      ]

    case 'workflow-tool':
    case 'developer-tool':
      return [
        {
          platform: 'X / Twitter', formatId: 'twitter-post', platformColor: PLATFORM_COLORS['twitter-post'],
          objective: 'awareness',
          recommendedFormat: '2–3 key workflow frames',
          rationale: 'Developer and productivity audiences are active on X — workflow demos and before/after comparisons drive strong engagement',
          slideCount: '2–3 slides (process flow)',
          postingWindow: 'At launch, 9–11am',
        },
        {
          platform: 'Product Hunt', formatId: 'product-hunt', platformColor: PLATFORM_COLORS['product-hunt'],
          objective: 'conversion',
          recommendedFormat: 'Full story gallery',
          rationale: 'PH is the primary conversion channel for dev/productivity tools — complete story beats highlight reels',
          slideCount: `All ${n} slides`,
          postingWindow: '12:01 AM PST on launch day',
        },
        {
          platform: 'LinkedIn', formatId: 'linkedin-post', platformColor: PLATFORM_COLORS['linkedin-post'],
          objective: 'education',
          recommendedFormat: hasProof ? 'Before/after carousel' : 'Process walkthrough',
          rationale: 'LinkedIn extends reach to managers and teams who approve workflow tooling purchases',
          slideCount: '3–4 slides',
          postingWindow: '2–4 hours after launch',
        },
      ]

    case 'consumer-app':
      return [
        {
          platform: 'Instagram Post', formatId: 'instagram-post', platformColor: PLATFORM_COLORS['instagram-post'],
          objective: 'awareness',
          recommendedFormat: 'Single most visual frame',
          rationale: 'Consumer apps need visual impact first — Instagram surfaces your most emotional or aspirational screenshot',
          slideCount: '1 slide (most striking or lifestyle)',
          postingWindow: 'At launch or same evening',
        },
        {
          platform: 'X / Twitter', formatId: 'twitter-post', platformColor: PLATFORM_COLORS['twitter-post'],
          objective: 'engagement',
          recommendedFormat: 'Product moment + curiosity hook',
          rationale: 'X drives early buzz and reshares for consumer products — keep caption punchy',
          slideCount: '1–2 slides',
          postingWindow: 'At launch',
        },
        ...(hasCTA ? [{
          platform: 'Instagram Story', formatId: 'instagram-story', platformColor: PLATFORM_COLORS['instagram-story'],
          objective: 'conversion' as const,
          recommendedFormat: 'Story with link sticker',
          rationale: 'Stories drive clicks from existing followers — most effective at launch time',
          slideCount: '2–3 slides (intro + CTA)',
          postingWindow: 'At launch time, or within 2 hours',
        }] : []),
      ]

    case 'commercial-product':
      return [
        {
          platform: 'LinkedIn', formatId: 'linkedin-post', platformColor: PLATFORM_COLORS['linkedin-post'],
          objective: 'conversion',
          recommendedFormat: 'Value-first carousel',
          rationale: 'Commercial products need buyer-aware distribution — LinkedIn reaches decision-makers who approve software budgets',
          slideCount: `3–${Math.min(n, 5)} slides`,
          postingWindow: 'Tuesday–Thursday, 8–10am',
        },
        {
          platform: 'Product Hunt', formatId: 'product-hunt', platformColor: PLATFORM_COLORS['product-hunt'],
          objective: 'conversion',
          recommendedFormat: 'Full gallery + value framing',
          rationale: 'PH buyers are price-sensitive — include value framing near pricing or outcome screens',
          slideCount: `All ${n} slides`,
          postingWindow: '12:01 AM PST on launch day',
        },
        {
          platform: 'X / Twitter', formatId: 'twitter-post', platformColor: PLATFORM_COLORS['twitter-post'],
          objective: 'awareness',
          recommendedFormat: 'Single strongest value frame',
          rationale: 'Pre-announce 24h before PH launch to build anticipation and upvote intent',
          slideCount: '1 slide (strongest outcome)',
          postingWindow: '24 hours before PH launch',
        },
      ]

    default: // early-stage + general-product
      return [
        {
          platform: 'X / Twitter', formatId: 'twitter-post', platformColor: PLATFORM_COLORS['twitter-post'],
          objective: 'awareness',
          recommendedFormat: 'Single most striking visual',
          rationale: 'X has the fastest distribution for launch announcements — reach builders and early adopters immediately',
          slideCount: '1 slide (most striking)',
          postingWindow: 'At launch, 9–11am',
        },
        {
          platform: 'Product Hunt', formatId: 'product-hunt', platformColor: PLATFORM_COLORS['product-hunt'],
          objective: 'conversion',
          recommendedFormat: 'Full story gallery',
          rationale: 'PH is your primary launch channel — complete story gives evaluators full context',
          slideCount: `All ${n} slides`,
          postingWindow: '12:01 AM PST on launch day',
        },
        {
          platform: 'LinkedIn', formatId: 'linkedin-post', platformColor: PLATFORM_COLORS['linkedin-post'],
          objective: 'education',
          recommendedFormat: '3–4 slide story',
          rationale: 'LinkedIn extends reach to professional audience post-launch — educational tone works best',
          slideCount: '3–4 slides',
          postingWindow: '2–4 hours after X post',
        },
      ]
  }
}

function buildMessagingFocus(productType: ProductType, slides: SlideInfo[]): string[] {
  const focus: string[] = []

  if (productType === 'analytics-saas') {
    focus.push('Lead with the "before state" — what decision was hard or slow before your product')
    focus.push('Use specific numbers: "40% less time", "2× more accurate" — not vague claims')
    focus.push('Dashboard screenshots are social proof — show real data, not placeholder UI')
  } else if (productType === 'workflow-tool' || productType === 'developer-tool') {
    focus.push('Show the full workflow end-to-end — buyers need to see the complete picture')
    focus.push('Emphasize friction removed, not features added')
    focus.push('For developer tools: show the real output, not just the interface that produces it')
  } else if (productType === 'consumer-app') {
    focus.push('Lead with the feeling and outcome, not the feature list')
    focus.push('Simplify captions — mobile audience, shorter attention spans')
    focus.push('Make the hero screenshot aspirational: show someone succeeding, not just a UI')
  } else if (productType === 'commercial-product') {
    focus.push('Frame value before price — show ROI in slides before any pricing context')
    focus.push('Social proof in captions outperforms feature lists: "1,000+ teams use this to…"')
    focus.push('Make the CTA specific: "Start free trial" beats "Learn more"')
  } else {
    focus.push('Lead with the problem you solve, not the product you built')
    focus.push('Show at least one "wow" moment — the thing that surprises people')
    focus.push('One clear CTA per post — remove decision friction from first action')
  }

  if (slides.length <= 2) {
    focus.push(`Only ${slides.length} slides — keep each post to a single, clear benefit`)
  }

  return focus
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateLaunchStrategy(
  slides: SlideInfo[],
  intent: StoryIntent,
  productName: string,
  pageTypes: PageType[],
): LaunchStrategy {
  const { type: productType, rationale: productTypeRationale } = inferProductType(pageTypes, slides, intent)
  const platforms = buildPlatforms(productType, slides)
  const messaging = buildMessagingFocus(productType, slides)

  const sequencingPlan: SequencingStep[] = platforms.map((p, i) => ({
    order: i + 1,
    platform: p.platform,
    action: p.recommendedFormat,
    emphasis: p.objective === 'awareness' ? 'Hook and curiosity' :
              p.objective === 'education' ? 'Value and clarity' :
              p.objective === 'conversion' ? 'Call to action' : 'Story and engagement',
    timeFromLaunch: p.postingWindow,
  }))

  const recommendedAssets: RecommendedAsset[] = slides
    .filter(s => ['intro', 'feature', 'output', 'cta'].includes(s.role))
    .slice(0, 3)
    .map(s => ({
      label: s.title || `${s.role} slide`,
      slideRole: s.role,
      reason: s.role === 'intro' ? 'Opening visual — builds curiosity before features' :
              s.role === 'feature' ? 'Core feature moment — your strongest proof point' :
              s.role === 'output' ? 'Result/outcome — proves the value claim' :
              'Conversion driver — closes the story',
    }))

  // Confidence based on how much OCR signal we have
  const nonUnknown = pageTypes.filter(p => p !== 'unknown').length
  const confidence = nonUnknown >= 3 ? 0.74 : nonUnknown >= 1 ? 0.58 : 0.42

  return {
    launchType: intent.label,
    productType: PRODUCT_TYPE_LABELS[productType],
    productTypeRationale,
    primaryPlatforms: platforms,
    sequencingPlan,
    messagingFocus: messaging,
    recommendedAssets,
    confidence,
  }
}
