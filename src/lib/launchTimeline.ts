// Grounded Launch Timeline Engine — generates slide-based launch rollout recommendations.
// No generic algorithm advice or canned "best time" rules. Grounded strictly in asset roles and narrative context.

import type { StoryRole } from './composition'
import type { ProductContext } from './contextEngine'

export interface TimelinePost {
  title: string
  platform: string
  purpose: string
  focusSlideIndices: number[]
  slideInstruction: string
  guidanceText: string
}

export interface LaunchTimeline {
  productTypeLabel: string
  primaryGoal: string
  sequencingGuide: string[]
  posts: TimelinePost[]
}

interface SlideMeta {
  role: StoryRole
  title: string
}

export function generateLaunchTimeline(
  slides: SlideMeta[],
  context?: ProductContext | null
): LaunchTimeline {
  const posts: TimelinePost[] = []

  const pName = context?.productName || 'Your Product'
  const pGoal = context?.launchGoal || 'product-launch'
  const pTone = context?.tone || 'founder'

  const hasIntro = slides.some(s => s.role === 'intro')
  const hasFeature = slides.some(s => s.role === 'feature')
  const hasOutput = slides.some(s => s.role === 'output')
  const hasCTA = slides.some(s => s.role === 'cta')

  // Find slide indices for precise asset guidance
  const introIdx = slides.findIndex(s => s.role === 'intro') >= 0 ? slides.findIndex(s => s.role === 'intro') : 0
  const featureIdx = slides.findIndex(s => s.role === 'feature') >= 0 ? slides.findIndex(s => s.role === 'feature') : 1
  const outputIdx = slides.findIndex(s => s.role === 'output') >= 0 ? slides.findIndex(s => s.role === 'output') : (slides.length - 2 >= 0 ? slides.length - 2 : 0)
  const ctaIdx = slides.findIndex(s => s.role === 'cta') >= 0 ? slides.findIndex(s => s.role === 'cta') : slides.length - 1

  // 1. Launch Post (The Hook Announcement)
  posts.push({
    title: 'The Announcement Post',
    platform: 'X / Twitter & Product Hunt',
    purpose: 'Deliver a high-level value hook that captures immediate interest from the feed.',
    focusSlideIndices: hasIntro ? [introIdx] : [0],
    slideInstruction: hasIntro ? `Focus on Slide ${introIdx + 1} (Intro/Hook)` : 'Focus on Slide 1',
    guidanceText: `Since your launch tone is "${pTone}", lead with your clear one-sentence description. Pair the hook with the most striking visual frame in your sequence. Keep the description free of jargon.`
  })

  // 2. Proof Post (The Operational Value Carousel)
  posts.push({
    title: 'The Operational Proof Carousel',
    platform: 'LinkedIn Carousel',
    purpose: 'Provide metric-driven operational proof to satisfy professional evaluators.',
    focusSlideIndices: hasOutput ? [outputIdx] : [introIdx, featureIdx],
    slideInstruction: hasOutput ? `Focus on Slide ${outputIdx + 1} (Proof/Output)` : 'Focus on Slides 1 & 2',
    guidanceText: 'Managers and professional buyers on LinkedIn scan for outcomes. Use your proof-based slide (which contains numbers, metrics, or dashboard tables) as the cover or the second slide in a multi-image carousel to multiply click-through rates.'
  })

  // 3. Follow-Up Post (The Workflow Deep-Dive)
  posts.push({
    title: 'The Workflow Deep-Dive',
    platform: 'X Thread or LinkedIn Article',
    purpose: 'Educate high-intent builders on how the product actually solves the core problem.',
    focusSlideIndices: hasFeature ? [featureIdx] : [0],
    slideInstruction: hasFeature ? `Focus on Slide ${featureIdx + 1} (Feature walkthrough)` : 'Focus on Slide 2',
    guidanceText: 'For users who want to see how it works under the hood. Share your feature/process screenshots as a thread or multi-image block to break down the friction you removed step-by-step.'
  })

  // 4. Momentum / Conversion Post (The Call-to-Action Closing)
  posts.push({
    title: 'The Conversion Closing',
    platform: 'Platform Launch Comments & IG/Threads Story',
    purpose: 'Direct warm prospects to the primary landing page or waitlist sign-up.',
    focusSlideIndices: hasCTA ? [ctaIdx] : [slides.length - 1],
    slideInstruction: hasCTA ? `Focus on Slide ${ctaIdx + 1} (Conversion CTA)` : `Focus on Slide ${slides.length}`,
    guidanceText: `Make the action friction-free. Match the text description precisely with your primary CTA: "${context?.primaryCTA || 'Try it free'}". Repeat this in the first comment of your main announcement thread.`
  })

  const sequencingGuide = [
    'Always use your highest contrast visual hooks on X/Twitter to secure initial feed priority.',
    'Group slides into a multi-image carousel on LinkedIn to maximize organic platform reach.',
    'Place your proof/outcome screenshots immediately following the hook to sustain engagement.'
  ]

  let productTypeLabel = 'Product Workspace'
  if (context?.productType) {
    const labels: Record<string, string> = {
      'developer-tool': 'Developer Tooling',
      'saas': 'SaaS Platform',
      'consumer-app': 'Consumer App',
      'ai-product': 'AI System',
      'fintech': 'FinTech Application',
      'design-tool': 'Design Engine',
      'analytics': 'Analytics / Data tool',
      'other': 'Launch Workspace'
    }
    productTypeLabel = labels[context.productType] || 'Launch Workspace'
  }

  let primaryGoal = 'Product Launch'
  if (context?.launchGoal) {
    const goals: Record<string, string> = {
      'feature-launch': 'New Feature Rollout',
      'beta': 'Beta Release Signup',
      'product-launch': 'Primary Product Launch',
      'redesign': 'UI Redesign Announcement',
      'growth-update': 'Traction Milestone Update'
    }
    primaryGoal = goals[context.launchGoal] || 'Product Launch'
  }

  return {
    productTypeLabel,
    primaryGoal,
    sequencingGuide,
    posts
  }
}
