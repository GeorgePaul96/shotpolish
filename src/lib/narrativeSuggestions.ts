// Grounded Narrative Suggestions Engine — suggests possible narrative slide arrangements.
// Designed for assistance, not authority. Does not claim a "correct" layout.

import type { StoryRole } from './composition'
import type { PageType } from './ocr'
import type { ProductContext } from './contextEngine'

export type NarrativeStyle =
  | 'hook-first'
  | 'proof-first'
  | 'walkthrough'
  | 'transformation'

export interface NarrativeSuggestion {
  id: string
  style: NarrativeStyle
  label: string
  description: string
  rationale: string[]
  strengths: string[]
  weakSignals: string[]
  orderedSlideIds: string[]
}

interface SlideMeta {
  id: string
  role: StoryRole
  title: string
  ocrPageType?: PageType | null
  ocrConfidence?: number
  hasMetrics?: boolean
  hasCTA?: boolean
}

// ─── Suggested Sequencers ──────────────────────────────────────────────────────

export function generateNarrativeSuggestions(
  slides: SlideMeta[],
  context?: ProductContext | null
): NarrativeSuggestion[] {
  if (slides.length < 3) {
    return []
  }

  const suggestions: NarrativeSuggestion[] = []

  // 1. Hook-First Arrangement (Hook → Context/Problem → Features → Proof → CTA)
  const hookFirstOrder = [...slides].sort((a, b) => {
    const roleWeight: Record<StoryRole, number> = {
      intro: 0,
      context: 1,
      feature: 2,
      process: 3,
      output: 4,
      cta: 5,
      uncertain: 6
    }
    return roleWeight[a.role] - roleWeight[b.role]
  }).map(s => s.id)

  const hookFirstRationale: string[] = ['Begins with a strong opening visual block to set the stage.']
  const hookFirstStrengths = ['Creates a highly natural, logical sequence for general product announcements.', 'Increases curiosity before presenting solutions.']
  const hookFirstWeak: string[] = []

  if (!slides.some(s => s.role === 'intro')) {
    hookFirstWeak.push('No obvious intro or hook slide layout was detected in this set.')
  }

  suggestions.push({
    id: 'suggest-hook-first',
    style: 'hook-first',
    label: 'Hook-First Flow',
    description: 'Hook the reader with a high-level teaser before outlining features and closing with a CTA.',
    rationale: hookFirstRationale,
    strengths: hookFirstStrengths,
    weakSignals: hookFirstWeak,
    orderedSlideIds: hookFirstOrder
  })

  // 2. Proof-First Arrangement (Proof/Outcome → Hook → Features → Process → CTA)
  const proofFirstOrder = [...slides].sort((a, b) => {
    const roleWeight: Record<StoryRole, number> = {
      output: 0,
      intro: 1,
      context: 2,
      feature: 3,
      process: 4,
      cta: 5,
      uncertain: 6
    }
    return roleWeight[a.role] - roleWeight[b.role]
  }).map(s => s.id)

  const proofRationale = ['Places metric outcomes or charts as slide 1 to immediately grab professional buyers.']
  const proofStrengths = ['Perfect for data-heavy dashboard SaaS or fintech products.', 'Aligns strongly with busy managers who scan ROI first.']
  const proofWeak: string[] = []

  if (!slides.some(s => s.role === 'output' || s.hasMetrics)) {
    proofWeak.push('No slides containing prominent metrics or numbers were detected.')
  }

  suggestions.push({
    id: 'suggest-proof-first',
    style: 'proof-first',
    label: 'Proof-First Storytelling',
    description: 'Lead with your strongest metric or dashboard outcome to capture high-intent visual buyers immediately.',
    rationale: proofRationale,
    strengths: proofStrengths,
    weakSignals: proofWeak,
    orderedSlideIds: proofFirstOrder
  })

  // 3. Walkthrough Arrangement (Intro → Process Flow → Features → Output → CTA)
  const walkthroughOrder = [...slides].sort((a, b) => {
    const roleWeight: Record<StoryRole, number> = {
      intro: 0,
      process: 1,
      feature: 2,
      output: 3,
      cta: 4,
      uncertain: 5
    }
    return roleWeight[a.role] - roleWeight[b.role]
  }).map(s => s.id)

  const walkRationale = ['Guides builders through a step-by-step feature progression.']
  const walkStrengths = ['Provides great logical structure for technical and developer-tool utilities.', 'Highlights product ease of onboarding.']
  const walkWeak: string[] = []

  if (context?.tone === 'technical') {
    walkRationale.push('Highly recommended for your Technical product tone.')
  }

  suggestions.push({
    id: 'suggest-walkthrough',
    style: 'walkthrough',
    label: 'Workflow Walkthrough',
    description: 'Guide founders step-by-step through a feature flow or onboarding checklist.',
    rationale: walkRationale,
    strengths: walkStrengths,
    weakSignals: walkWeak,
    orderedSlideIds: walkthroughOrder
  })

  // 4. Transformation Arrangement (Before/Problem → Walkthrough → After/Solution → CTA)
  const transformOrder = [...slides].sort((a, b) => {
    const roleWeight: Record<StoryRole, number> = {
      context: 0,
      process: 1,
      feature: 2,
      output: 3,
      cta: 4,
      intro: 5,
      uncertain: 6
    }
    return roleWeight[a.role] - roleWeight[b.role]
  }).map(s => s.id)

  const transRationale = ['Highlights the operational transition and friction removal.']
  const transStrengths = ['Excellent for redesign announcements or beta upgrades.', 'Highlights the before-versus-after contrast clearly.']
  const transWeak: string[] = []

  if (context?.launchGoal === 'redesign') {
    transRationale.push('Matches your Redesign launch goal perfectly.')
  }

  suggestions.push({
    id: 'suggest-transformation',
    style: 'transformation',
    label: 'Before vs After Shift',
    description: 'Contrast the pain of the old way against the simplicity of your new workflow.',
    rationale: transRationale,
    strengths: transStrengths,
    weakSignals: transWeak,
    orderedSlideIds: transformOrder
  })

  // Prioritize suggestions based on context
  if (context) {
    if (context.launchGoal === 'redesign') {
      // Move transformation to first place
      const idx = suggestions.findIndex(s => s.style === 'transformation')
      if (idx > -1) {
        const [trans] = suggestions.splice(idx, 1)
        suggestions.unshift(trans)
      }
    } else if (context.productType === 'analytics' || context.productType === 'fintech') {
      // Move proof to first
      const idx = suggestions.findIndex(s => s.style === 'proof-first')
      if (idx > -1) {
        const [proof] = suggestions.splice(idx, 1)
        suggestions.unshift(proof)
      }
    } else if (context.productType === 'developer-tool') {
      // Move walkthrough to first
      const idx = suggestions.findIndex(s => s.style === 'walkthrough')
      if (idx > -1) {
        const [walk] = suggestions.splice(idx, 1)
        suggestions.unshift(walk)
      }
    }
  }

  return suggestions
}
