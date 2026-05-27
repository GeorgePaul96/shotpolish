// Product-aware narrative sequencing
// Maps slide roles + OCR page types to a persuasive launch story arc
// Explains every decision — never silently reorders

import type { StoryRole } from './composition'
import type { PageType } from './ocr'
import type { StoryIntent } from './storyTemplates'

export type NarrativePosition = 'opening' | 'explanation' | 'proof' | 'conversion' | 'flexible'

export interface NarrativeArc {
  openingSlides: string[]
  explanationSlides: string[]
  proofSlides: string[]
  conversionSlides: string[]
  confidence: number
  arcType: 'problem-solution' | 'feature-showcase' | 'before-after' | 'milestone-journey'
  reasoning: string[]
}

export interface SlideArcScore {
  slideId: string
  position: NarrativePosition
  score: number
  reason: string
}

// ─── Mapping tables ───────────────────────────────────────────────────────────

const ROLE_TO_POSITION: Record<StoryRole, NarrativePosition> = {
  intro:     'opening',
  context:   'opening',
  feature:   'explanation',
  process:   'explanation',
  output:    'proof',
  cta:       'conversion',
  uncertain: 'flexible',
}

const PAGE_TYPE_TO_POSITION: Record<PageType, NarrativePosition | null> = {
  onboarding:   'opening',
  feature_demo: 'explanation',
  workflow:     'explanation',
  editor:       'explanation',
  settings:     'explanation',
  analytics:    'proof',
  dashboard:    'proof',
  pricing:      'conversion',
  auth:         'conversion',
  unknown:      null,
}

const INTENT_TO_ARC: Record<string, NarrativeArc['arcType']> = {
  'product-launch': 'problem-solution',
  'feature-update': 'feature-showcase',
  'before-after':   'before-after',
  'milestone':      'milestone-journey',
  'tutorial':       'feature-showcase',
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreSlide(
  slideId: string,
  role: StoryRole,
  title: string,
  pageType?: PageType | null,
): SlideArcScore {
  const roleBased = ROLE_TO_POSITION[role]
  const ocrBased = pageType ? PAGE_TYPE_TO_POSITION[pageType] : null

  // Agreement between role + OCR → high confidence
  if (ocrBased && ocrBased === roleBased && roleBased !== 'flexible') {
    return {
      slideId, position: ocrBased, score: 0.85,
      reason: `Visual role "${role}" and detected page type "${pageType}" both suggest ${ocrBased} position`,
    }
  }

  // OCR strongly overrides for unambiguous types (pricing, auth → conversion; analytics → proof)
  if (ocrBased && ['conversion', 'proof'].includes(ocrBased)) {
    return {
      slideId, position: ocrBased, score: 0.72,
      reason: `Detected page type "${pageType}" strongly suggests ${ocrBased} position`,
    }
  }

  // Role-based with moderate confidence
  if (roleBased !== 'flexible') {
    return {
      slideId, position: roleBased, score: 0.58,
      reason: `Visual role "${role}" suggests ${roleBased} position`,
    }
  }

  // Title keyword fallback for truly uncertain slides
  const tl = title.toLowerCase()
  if (/sign up|get started|try|free trial|start now/.test(tl))
    return { slideId, position: 'conversion', score: 0.42, reason: 'Title contains CTA language' }
  if (/result|increase|reduce|faster|%|saved|improved/.test(tl))
    return { slideId, position: 'proof', score: 0.42, reason: 'Title contains outcome or metric language' }
  if (/how|step|guide|learn|tutorial/.test(tl))
    return { slideId, position: 'explanation', score: 0.38, reason: 'Title suggests instructional content' }

  return {
    slideId, position: 'explanation', score: 0.28,
    reason: 'Insufficient signals — placed in explanation by default',
  }
}

// ─── Arc builder ──────────────────────────────────────────────────────────────

export interface SlideMeta {
  id: string
  role: StoryRole
  title: string
  ocrPageType?: PageType | null
}

export function buildNarrativeArc(
  slides: SlideMeta[],
  intent: StoryIntent,
): NarrativeArc {
  const scores = slides.map(s => scoreSlide(s.id, s.role, s.title, s.ocrPageType))

  const buckets: Record<NarrativePosition, string[]> = {
    opening: [], explanation: [], proof: [], conversion: [], flexible: [],
  }
  for (const s of scores) buckets[s.position].push(s.slideId)

  // Distribute flexible slides: fill under-represented buckets
  const flex = [...buckets.flexible]
  const fill = (bucket: string[], min: number) => {
    while (bucket.length < min && flex.length > 0) bucket.push(flex.shift()!)
  }
  fill(buckets.opening, 1)
  fill(buckets.explanation, 1)
  buckets.explanation.push(...flex) // remaining flex → explanation

  const arcType = INTENT_TO_ARC[intent.id] ?? 'feature-showcase'
  const avgScore = scores.reduce((s, c) => s + c.score, 0) / scores.length

  const reasoning: string[] = [
    `Arc type: ${arcType} (from "${intent.label}" intent)`,
  ]
  if (buckets.proof.length > 0) {
    reasoning.push(`${buckets.proof.length} proof slide${buckets.proof.length > 1 ? 's' : ''} (output/analytics) placed after features for maximum persuasion impact`)
  }
  if (buckets.conversion.length > 0) {
    reasoning.push(`${buckets.conversion.length} conversion slide${buckets.conversion.length > 1 ? 's' : ''} (CTA/pricing/auth) placed last for natural action flow`)
  }
  if (scores.some(s => s.score < 0.40)) {
    reasoning.push('Some slides had low signal confidence — check the slide list and reorder manually if needed')
  }

  return {
    openingSlides:     buckets.opening,
    explanationSlides: buckets.explanation,
    proofSlides:       buckets.proof,
    conversionSlides:  buckets.conversion,
    confidence: Math.min(0.82, avgScore),
    arcType,
    reasoning,
  }
}

// Returns slide IDs in narrative order (for apply-suggestion flow)
export function narrativeOrder(arc: NarrativeArc): string[] {
  return [
    ...arc.openingSlides,
    ...arc.explanationSlides,
    ...arc.proofSlides,
    ...arc.conversionSlides,
  ]
}

// Returns slide IDs that differ from current order (for "changes" display)
export function arcDiffersFromCurrent(currentIds: string[], arc: NarrativeArc): boolean {
  const arcIds = narrativeOrder(arc)
  if (arcIds.length !== currentIds.length) return true
  return arcIds.some((id, i) => id !== currentIds[i])
}

export const ARC_TYPE_LABELS: Record<NarrativeArc['arcType'], string> = {
  'problem-solution':  'Problem → Solution',
  'feature-showcase':  'Feature showcase',
  'before-after':      'Before / After',
  'milestone-journey': 'Journey & milestone',
}

export const POSITION_LABELS: Record<NarrativePosition, string> = {
  opening:     'Hook',
  explanation: 'Feature',
  proof:       'Proof',
  conversion:  'CTA',
  flexible:    '—',
}

export const POSITION_COLORS: Record<NarrativePosition, string> = {
  opening:     '#818cf8',
  explanation: '#34d399',
  proof:       '#fb923c',
  conversion:  '#f472b6',
  flexible:    '#52525b',
}
