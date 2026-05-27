// Signal Engine — extracts visual, textual, layout, and user-grounded evidence from screenshots.
// Employs deterministic assistance, not authority. Exposes what signals exist and what assumptions are made.

import type { OCRAnalysis } from './ocr'
import type { VisualSignals } from './semanticAnalysis'
import type { ProductContext } from './contextEngine'
import type { StoryRole } from './composition'

export interface SignalEvidence {
  visualComplexity: 'high' | 'medium' | 'low'
  layoutAspect: 'desktop' | 'mobile' | 'square'
  textReliability: 'strong' | 'partial' | 'weak' | 'unavailable'
  hasMetricClues: boolean
  hasCTAClues: boolean
  groundedByUser: boolean
}

export interface SignalAssessment {
  slideId: string
  role: StoryRole
  evidence: SignalEvidence
  confidenceBadges: string[]
  reasoning: string[]
}

export function analyzeLayoutSignals(width: number, height: number): 'desktop' | 'mobile' | 'square' {
  if (width <= 0 || height <= 0) return 'desktop'
  const ratio = width / height
  if (ratio < 0.85) return 'mobile'
  if (ratio > 1.25) return 'desktop'
  return 'square'
}

export function buildSignalAssessment(
  slideId: string,
  visual: VisualSignals,
  ocr: OCRAnalysis | null,
  context?: ProductContext | null,
  width = 1200,
  height = 900
): SignalAssessment {
  const layout = analyzeLayoutSignals(width, height)
  
  const textual: 'strong' | 'partial' | 'weak' | 'unavailable' =
    !ocr ? 'unavailable' :
    ocr.error ? 'unavailable' :
    ocr.confidence > 0.70 && ocr.rawText.length > 50 ? 'strong' :
    ocr.confidence > 0.40 && ocr.rawText.length > 15 ? 'partial' : 'weak'

  const hasMetricClues = (ocr && ocr.metrics.length > 0) || visual.hasMetrics
  const hasCTAClues = (ocr && ocr.probableCTA) || visual.hasCTA
  const groundedByUser = !!(context && context.productName)

  const evidence: SignalEvidence = {
    visualComplexity: visual.uiComplexity > 0.6 ? 'high' : visual.uiComplexity > 0.25 ? 'medium' : 'low',
    layoutAspect: layout,
    textReliability: textual,
    hasMetricClues,
    hasCTAClues,
    groundedByUser
  }

  const confidenceBadges: string[] = []
  const reasoning: string[] = []

  // Visual layout signals
  if (layout === 'mobile') {
    confidenceBadges.push('Vertical mobile screen layout')
    reasoning.push('Screenshot matches a vertical portrait aspect ratio (mobile/native UI priority)')
  } else if (layout === 'desktop') {
    confidenceBadges.push('Desktop layout signals')
    reasoning.push('Screenshot matches a landscape aspect ratio (typical SaaS/web desktop dashboard)')
  } else {
    confidenceBadges.push('Square focus canvas layout')
    reasoning.push('Screenshot matches a square crop outline')
  }

  // Text signals
  if (textual === 'strong') {
    confidenceBadges.push('High-clarity text extracted')
    reasoning.push('OCR confidently scanned high-density text blocks containing key terms')
  } else if (textual === 'partial') {
    confidenceBadges.push('Moderate text detection')
    reasoning.push('OCR extracted basic textual blocks but details are partial or small')
  } else if (textual === 'weak') {
    confidenceBadges.push('Weak text signals')
    reasoning.push('OCR read low-density or fuzzy text candidates. Check visual elements first')
  } else {
    confidenceBadges.push('Text scan pending/unavailable')
    reasoning.push('No text analysis records available for this canvas')
  }

  // Context signals
  if (groundedByUser) {
    confidenceBadges.push('Grounded in user context')
    reasoning.push(`Context model exists for "${context?.productName}" — overriding guesses`)
  } else {
    confidenceBadges.push('Visual clues only')
    reasoning.push('No user onboarding context active — relying on raw pixel/text candidates')
  }

  // Deduce role
  let role: StoryRole = 'uncertain'
  if (hasCTAClues) {
    role = 'cta'
    reasoning.push('Detected prominent call-to-action indicators (highly saturated buttons or activation copy)')
  } else if (hasMetricClues) {
    role = 'output'
    reasoning.push('Detected analytics indicators (metrics, charts, numerical variance, or data panels)')
  } else if (visual.uiComplexity > 0.5) {
    role = 'feature'
    reasoning.push('Detected complex interactive boundaries — typical features showcase screenshot')
  } else if (visual.textDensity > 0.3) {
    role = 'process'
    reasoning.push('Detected high content-blocks density — standard flow process or walkthrough step')
  } else if (visual.textDensity < 0.2) {
    role = 'intro'
    reasoning.push('Detected clean, low-density layout — typical welcoming or hero presentation slide')
  } else {
    role = 'context'
    reasoning.push('General informational layout — assigned process context role')
  }

  return {
    slideId,
    role,
    evidence,
    confidenceBadges,
    reasoning
  }
}
