// Hybrid role scoring — combines OCR text signals (65%) with pixel heuristics (35%).
// Honest language: "suggested", "detected", "likely" — never "AI determined" or "AI knows".

import type { OCRAnalysis, PageType } from './ocr'
import type { StoryRole } from './composition'

export interface VisualSignals {
  uiComplexity: number    // 0–1 edge density
  textDensity: number     // 0–1 brightness variance
  hasMetrics: boolean     // accent-pixel pattern
  hasCTA: boolean         // accent pixels in dark context
  meanBrightness: number  // 0–255
}

export interface AutomationExplanation {
  assignedRole: StoryRole
  confidence: number         // 0–1
  reasons: string[]          // human-readable, shown in UI
  semanticSignals: string[]  // from OCR text analysis
  visualSignals: string[]    // from pixel heuristics
  probablePageType: PageType
  ocrPending: boolean        // true while OCR is still running
}

// Page type → role mapping (used when OCR detects a clear page type)
const PAGE_TYPE_ROLE: Record<PageType, StoryRole> = {
  onboarding:    'intro',
  dashboard:     'output',
  analytics:     'output',
  pricing:       'cta',
  auth:          'cta',
  settings:      'process',
  workflow:      'process',
  editor:        'feature',
  feature_demo:  'feature',
  devtools:      'feature',
  ai:            'feature',
  collaboration: 'process',
  fintech:       'output',
  automation:    'process',
  unknown:       'uncertain',
}


// ─── Visual signal extraction ─────────────────────────────────────────────────

function visualSignalStrings(v: VisualSignals): string[] {
  const out: string[] = []
  if (v.hasCTA) out.push('High-saturation accent pixels in dark context — likely a CTA button')
  if (v.hasMetrics) out.push('Color accent pattern suggests charts or number callouts')
  if (v.uiComplexity > 0.5) out.push('High edge density — dense, complex interface')
  if (v.textDensity > 0.4) out.push('High brightness variance — lots of text or content blocks')
  if (v.textDensity < 0.2) out.push('Low text density — sparse layout, likely a hero or intro frame')
  if (v.meanBrightness > 200) out.push('Very bright screenshot — possibly a light-mode context or landing page')
  if (out.length === 0) out.push('No strong visual signals detected')
  return out
}

function visualRoleScore(v: VisualSignals): { role: StoryRole; score: number } {
  const scores: Partial<Record<StoryRole, number>> = {}

  if (v.hasCTA)               scores.cta     = (scores.cta     ?? 0) + 0.60
  if (v.hasMetrics)           scores.output  = (scores.output  ?? 0) + 0.55
  if (v.uiComplexity > 0.5)  scores.feature = (scores.feature ?? 0) + 0.45
  if (v.textDensity > 0.4 && !v.hasCTA) scores.process = (scores.process ?? 0) + 0.40
  if (v.textDensity < 0.2 && !v.hasMetrics)  scores.intro = (scores.intro ?? 0) + 0.35
  if (v.meanBrightness > 200) scores.context = (scores.context ?? 0) + 0.28

  let best: StoryRole = 'uncertain'
  let bestScore = 0
  for (const [role, score] of Object.entries(scores) as [StoryRole, number][]) {
    if (score > bestScore) { bestScore = score; best = role }
  }
  return { role: best, score: bestScore }
}

// ─── Semantic (OCR) signal extraction ────────────────────────────────────────

function semanticRoleScore(ocr: OCRAnalysis): { role: StoryRole; score: number; signals: string[] } {
  const signals: string[] = []
  let role: StoryRole = 'uncertain'
  let score = 0

  if (ocr.probablePageType !== 'unknown' && ocr.confidence > 0.35) {
    role = PAGE_TYPE_ROLE[ocr.probablePageType]
    score = ocr.confidence * 0.75
    signals.push(`Page type detected: "${ocr.probablePageType}"`)
  }

  if (ocr.probableCTA && score < 0.70) {
    role = 'cta'
    score = Math.max(score, 0.65)
    signals.push('CTA-style language detected (e.g. "get started", "sign up")')
  }

  if (ocr.metrics.length >= 2 && role !== 'cta') {
    role = 'output'
    score = Math.max(score, 0.60)
    signals.push(`${ocr.metrics.length} metric-like values detected`)
  }

  if (ocr.headings.length === 0 && ocr.confidence < 0.25) {
    signals.push('Low OCR confidence — text signals unreliable on this image')
    score *= 0.5
  }

  return { role, score, signals }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildVisualOnlyExplanation(v: VisualSignals): AutomationExplanation {
  const { role, score } = visualRoleScore(v)
  const confidence = Math.min(0.72, score * 0.9)
  const vstrings = visualSignalStrings(v)

  const reasons: string[] = []
  if (confidence >= 0.55) {
    reasons.push(`Suggested role: "${role}" — based on visual signals.`)
  } else {
    reasons.push(`Uncertain — visual signals are weak or mixed.`)
  }
  reasons.push('Text analysis not yet run — confidence is limited to visual signals.')

  return {
    assignedRole: role,
    confidence,
    reasons,
    semanticSignals: [],
    visualSignals: vstrings,
    probablePageType: 'unknown',
    ocrPending: true,
  }
}

export function buildHybridExplanation(
  ocr: OCRAnalysis,
  v: VisualSignals,
): AutomationExplanation {
  const visual = visualRoleScore(v)
  const semantic = semanticRoleScore(ocr)

  // Hybrid: semantic weighted 65%, visual 35%
  const hybridScore = semantic.score * 0.65 + visual.score * 0.35
  const confidence = Math.min(0.92, Math.max(0, hybridScore))
  const hybridRole = semantic.score > visual.score ? semantic.role : visual.role

  const reasons: string[] = []
  if (confidence >= 0.70) {
    reasons.push(`Likely "${hybridRole}" — text and visual signals agree.`)
  } else if (confidence >= 0.55) {
    reasons.push(`Suggested "${hybridRole}" — moderate confidence. Check if it looks right.`)
  } else {
    reasons.push(`Uncertain — signals are weak or conflicting. Set the role manually.`)
  }

  if (ocr.probablePageType !== 'unknown') {
    reasons.push(`Page type appears to be "${ocr.probablePageType}".`)
  }

  return {
    assignedRole: hybridRole,
    confidence,
    reasons,
    semanticSignals: semantic.signals.length > 0 ? semantic.signals : ['No strong text signals detected'],
    visualSignals: visualSignalStrings(v),
    probablePageType: ocr.probablePageType,
    ocrPending: false,
  }
}
