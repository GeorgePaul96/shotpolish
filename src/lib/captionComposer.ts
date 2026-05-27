// Grounded Caption Composer — reframes and structures copy variants instead of generic emoji slot-filling.
// Designed for assistance, not authority. Adheres to grounding fallbacks when signals are weak.

import type { StoryRole } from './composition'
import type { ProductContext } from './contextEngine'

export interface SlideInfo {
  role: StoryRole
  title: string
  callout: string
}

export interface PlatformVariants {
  twitter: string
  linkedin: string
  producthunt: string
}

export function composeGroundedCaptions(
  slides: SlideInfo[],
  context?: ProductContext | null,
  ocrReliability: 'strong' | 'partial' | 'weak' | 'unavailable' = 'partial'
): PlatformVariants {
  const intro = slides.find(s => s.role === 'intro') || slides[0]
  const contextSlide = slides.find(s => s.role === 'context') || slides.find(s => s.role === 'intro') || slides[0]
  const feature = slides.find(s => s.role === 'feature') || slides[1] || slides[0]
  const output = slides.find(s => s.role === 'output') || slides.find(s => s.role === 'feature') || slides[slides.length - 2] || slides[0]
  const cta = slides.find(s => s.role === 'cta') || slides[slides.length - 1]

  const pName = context?.productName || 'our product'
  const pDesc = context?.shortDescription || (feature?.title ? `a solution for ${feature.title.toLowerCase()}` : 'a new product update')
  const pAudience = context?.audience || 'product teams'
  const pOutcome = context?.primaryCTA || cta?.title || 'Try it free'

  const isLowConfidence = ocrReliability === 'weak' || ocrReliability === 'unavailable' || !context?.shortDescription

  // ─── X / TWITTER VARIANTS ────────────────────────────────────────────────────

  let twitter = ''
  if (isLowConfidence) {
    twitter = `🚀 We just released a new update for ${pName}.\n\n` +
      `Our focus is on making daily workflows simpler. Here is a walkthrough of what changed:\n` +
      `• ${feature?.title || 'Improved features layout'}\n` +
      `• ${output?.title || 'Optimized performance'}\n\n` +
      `👉 Details & feedback: ${pOutcome}`
  } else {
    // Variant 1: Contrarian Hook
    const v1 = `🔥 Most systems for ${pDesc.replace(/\.$/, '').toLowerCase()} are overloaded and complicated.\n\n` +
      `We built ${pName} to change that. No clutter, just direct results.\n\n` +
      `1. ${feature?.title || 'Core feature'}\n` +
      `2. ${output?.title || 'Outcome view'}\n\n` +
      `👉 Start free: ${pOutcome}`

    // Variant 2: Technical Breakdown
    const v2 = `🛠️ Technical overview of ${pName} — optimized for ${pAudience}:\n\n` +
      `• Focus: ${pDesc.replace(/\.$/, '')}\n` +
      `• Core: ${feature?.title || 'High reliability'}\n` +
      `• Output: ${output?.title || 'Visual proof'}\n\n` +
      `👉 Try the demo: ${pOutcome}`

    // Variant 3: Founder Journey
    const v3 = `🚀 We spent weeks watching ${pAudience} struggle with ${contextSlide?.title || 'painful setups'}.\n\n` +
      `Today we're launching ${pName} to make it simple.\n\n` +
      `• Solves: "${contextSlide?.title || 'inefficient workflows'}"\n` +
      `• Enables: "${output?.title || 'instant results'}"\n\n` +
      `We'd love your thoughts: ${pOutcome}`

    twitter = `💡 OPTION A (Contrarian Hook):\n${v1}\n\n` +
              `-----------------------------------------\n` +
              `💡 OPTION B (Technical Hook):\n${v2}\n\n` +
              `-----------------------------------------\n` +
              `💡 OPTION C (Founder Journey):\n${v3}`
  }

  // ─── LINKEDIN VARIANTS ───────────────────────────────────────────────────────

  let linkedin = ''
  if (isLowConfidence) {
    linkedin = `We just launched ${pName}.\n\n` +
      `Built to improve daily operations. We wanted a simpler way to view features without clutter.\n\n` +
      `The layout steps:\n` +
      `1. ${feature?.title || 'View core updates'}\n` +
      `2. ${output?.title || 'Verify results'}\n\n` +
      `Let us know your thoughts in the comments! 👇`
  } else {
    // Variant 1: Problem -> Insight -> Solution
    const l1 = `Let's talk about the friction in ${pDesc.replace(/\.$/, '').toLowerCase()}.\n\n` +
      `Many ${pAudience} face a common challenge: "${contextSlide?.title || 'inefficient workflows'}"\n\n` +
      `We took a different approach with ${pName}. Instead of adding more charts, we focused on clarity.\n\n` +
      `How it works:\n` +
      `• ${feature?.title || 'Simplified UI controls'}\n` +
      `• ${output?.title || 'Outcome metrics'}\n\n` +
      `👉 Learn more: ${pOutcome}`

    // Variant 2: Founder Journey
    const l2 = `Why did we build ${pName}?\n\n` +
      `It started with a simple observation: ${pAudience} spent too much time on manual setups. The existing tools felt too generic.\n\n` +
      `We designed ${pName} to automate the heavy lifting. The result? "${output?.title || '10x faster updates'}"\n\n` +
      `If you've run into this pain, we'd love for you to try it: ${pOutcome}`

    // Variant 3: Operational Insight (Metric focused)
    const l3 = `📈 Improving operational flow for ${pAudience}:\n\n` +
      `We analyzed how teams structure workflows. The primary bottleneck is often text density or UI complexity.\n\n` +
      `With ${pName}, we're enabling:\n` +
      `• "${feature?.title || 'Visual hierarchy clarity'}"\n` +
      `• "${output?.title || 'Direct measurable outcome'}"\n\n` +
      `👉 View the metrics and try it free: ${pOutcome}`

    linkedin = `💡 OPTION A (Problem-Insight-Solution):\n${l1}\n\n` +
               `-----------------------------------------\n` +
               `💡 OPTION B (Founder Story):\n${l2}\n\n` +
               `-----------------------------------------\n` +
               `💡 OPTION C (Operational Metrics):\n${l3}`
  }

  // ─── PRODUCT HUNT VARIANTS ───────────────────────────────────────────────────

  let producthunt = ''
  if (isLowConfidence) {
    producthunt = `Hi Product Hunt! 👋\n\n` +
      `We're launching ${pName} today to help simplify screenshot sharing.\n\n` +
      `• Core feature: ${feature?.title || 'Clean canvas layout'}\n` +
      `• Rationale: ${intro?.title || 'A better way to tell stories'}\n\n` +
      `Please check it out, we would love your support and upvotes!`
  } else {
    // Variant 1: Launch Framing
    const p1 = `Hi Product Hunt! 👋 We're excited to introduce ${pName} today.\n\n` +
      `We built this specifically for ${pAudience} to solve: "${contextSlide?.title || 'fragmented launch sharing'}"\n\n` +
      `Our goal is to make visual launch storytelling instant.\n\n` +
      `We'd love your support, upvotes, and honest feedback below! 👇`

    // Variant 2: Capability Summary
    const p2 = `Hello PH community! 🚀 Here is a quick summary of what ${pName} enables:\n\n` +
      `• ${feature?.title || 'Focus-constrained visual layouts'}\n` +
      `• ${output?.title || 'Metric outcome displays'}\n` +
      `• ${cta?.title || 'Direct social-ready assets'}\n\n` +
      `We'd love to hear how you plan to use this for your next launch!`

    // Variant 3: User Outcome
    const p3 = `Built to help ${pAudience} save hours during product launches.\n\n` +
      `Instead of manually designing templates or writing social copy from scratch, ${pName} structures your screenshot stories.\n\n` +
      `Outcome: "${output?.title || 'Launch assets ready in 60 seconds'}"\n\n` +
      `Check out the gallery and ask us anything below! ⚡`

    producthunt = `💡 OPTION A (Launch Announcement):\n${p1}\n\n` +
                  `-----------------------------------------\n` +
                  `💡 OPTION B (Capabilities Summary):\n${p2}\n\n` +
                  `-----------------------------------------\n` +
                  `💡 OPTION C (User Outcomes):\n${p3}`
  }

  return { twitter, linkedin, producthunt }
}
