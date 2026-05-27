// Launch posting guide — generates a platform-ordered launch plan from story intent + slides.
// Advice is intent-aware and role-aware. Never generic.

import type { StoryRole } from './composition'
import type { StoryIntent } from './storyTemplates'

export interface PostingStep {
  platform: string
  formatId: string
  platformColor: string
  slideIndices: number[]   // which slides to use (0-based)
  slideNote: string        // e.g. "Slide 1 only" or "Slides 1–4"
  caption: string          // pre-written, from compileCaptions
  purpose: string          // one sentence on why this platform matters
  timing: string           // when to post relative to launch
  order: number
}

export interface PostingPlan {
  steps: PostingStep[]
  intentLabel: string
  totalAssets: number
}

// Platform metadata
const PLATFORM_META: Record<string, { color: string; name: string; timing: string }> = {
  'twitter-post':    { color: '#e7e9ea', name: 'X / Twitter',   timing: 'Post first — highest real-time reach' },
  'linkedin-post':   { color: '#0077b5', name: 'LinkedIn',       timing: '2–4 hours after X post' },
  'product-hunt':    { color: '#da552f', name: 'Product Hunt',   timing: 'Submit at 12:01 AM PST on launch day' },
  'instagram-post':  { color: '#e1306c', name: 'Instagram Post', timing: 'Same day, evening' },
  'instagram-story': { color: '#e1306c', name: 'Instagram Story',timing: 'At launch time — drives story views' },
  'og-image':        { color: '#7c3aed', name: 'OG / Link',      timing: 'Live when your landing page goes up' },
  'reddit-post':     { color: '#ff4500', name: 'Reddit',         timing: '24–48 hours after launch' },
  'youtube-thumb':   { color: '#ff0000', name: 'YouTube',        timing: 'When uploading your demo video' },
}

// Intent → ordered platform priority
const INTENT_PLATFORM_ORDER: Record<string, string[]> = {
  'product-launch': ['twitter-post', 'product-hunt', 'linkedin-post', 'instagram-story', 'og-image'],
  'feature-update': ['twitter-post', 'linkedin-post', 'product-hunt', 'instagram-post'],
  'tutorial':       ['linkedin-post', 'twitter-post', 'instagram-story'],
  'before-after':   ['instagram-post', 'twitter-post', 'linkedin-post'],
  'milestone':      ['twitter-post', 'linkedin-post', 'product-hunt'],
}

// Platform → max slides + which roles to prefer
const PLATFORM_SLIDE_PREF: Record<string, { max: number; roles: StoryRole[] }> = {
  'twitter-post':    { max: 1, roles: ['intro', 'feature', 'output'] },
  'linkedin-post':   { max: 4, roles: ['intro', 'feature', 'process', 'output'] },
  'product-hunt':    { max: 99, roles: ['intro', 'feature', 'process', 'output', 'cta'] },
  'instagram-post':  { max: 1, roles: ['output', 'intro', 'feature'] },
  'instagram-story': { max: 4, roles: ['intro', 'feature', 'output', 'cta'] },
  'og-image':        { max: 1, roles: ['intro', 'feature'] },
  'reddit-post':     { max: 1, roles: ['feature', 'output', 'intro'] },
  'youtube-thumb':   { max: 1, roles: ['intro', 'feature'] },
}

// Platform → purpose descriptions (intent-aware fallbacks)
const PLATFORM_PURPOSE: Record<string, string> = {
  'twitter-post':    'Maximum initial reach — hooks new audience in the first 24 hours.',
  'linkedin-post':   'Educates buyers and builders — carousels get 3× more reach than single images.',
  'product-hunt':    'Launch conversion — your best shot at top-10 visibility on launch day.',
  'instagram-post':  'Visual credibility — single striking frame reaches warm audience.',
  'instagram-story': 'Drives swipe-ups and story views from your existing followers.',
  'og-image':        'Makes every shared link look launch-ready — zero-effort distribution.',
  'reddit-post':     'Reaches early adopters who want to see the real product.',
  'youtube-thumb':   'Drives click-through on demo or explainer videos.',
}

interface SlideInfo {
  role: StoryRole
  title: string
}

function pickSlides(
  slides: SlideInfo[],
  formatId: string,
): { indices: number[]; note: string } {
  const pref = PLATFORM_SLIDE_PREF[formatId]
  if (!pref) return { indices: [0], note: 'Slide 1' }

  // Sort by role preference, keep original order for ties
  const scored = slides.map((s, i) => ({ i, score: pref.roles.indexOf(s.role) }))
  const withRole = scored.filter(s => s.score >= 0).sort((a, b) => a.score - b.score)
  const withoutRole = scored.filter(s => s.score < 0)
  const ordered = [...withRole, ...withoutRole].map(s => s.i)

  const picked = ordered.slice(0, pref.max)
  picked.sort((a, b) => a - b) // restore narrative order for display

  const note = picked.length === 1
    ? `Slide ${picked[0] + 1}`
    : picked.length === slides.length
      ? 'All slides'
      : `Slides ${picked[0] + 1}–${picked[picked.length - 1] + 1}`

  return { indices: picked, note }
}

export function generatePostingPlan(
  slides: SlideInfo[],
  intent: StoryIntent,
  selectedFormats: string[],
  captions: { twitter: string; linkedin: string; producthunt: string },
): PostingPlan {
  const platformOrder = INTENT_PLATFORM_ORDER[intent.id] ?? [
    'twitter-post', 'linkedin-post', 'product-hunt', 'instagram-story',
  ]

  // Only include platforms the user actually exported
  const relevant = platformOrder.filter(id => selectedFormats.includes(id))
  // Append any selected formats not in the priority order
  const extras = selectedFormats.filter(id => !relevant.includes(id) && id !== 'free')
  const ordered = [...relevant, ...extras]

  const captionMap: Record<string, string> = {
    'twitter-post':    captions.twitter,
    'linkedin-post':   captions.linkedin,
    'product-hunt':    captions.producthunt,
    'instagram-post':  captions.twitter,
    'instagram-story': captions.twitter,
    'og-image':        '',
  }

  const steps: PostingStep[] = ordered.map((formatId, idx) => {
    const meta = PLATFORM_META[formatId] ?? { color: '#52525b', name: formatId, timing: 'Post when ready' }
    const { indices, note } = pickSlides(slides, formatId)
    return {
      platform:    meta.name,
      formatId,
      platformColor: meta.color,
      slideIndices: indices,
      slideNote:   note,
      caption:     captionMap[formatId] ?? captions.twitter,
      purpose:     PLATFORM_PURPOSE[formatId] ?? 'Expands your launch reach.',
      timing:      meta.timing,
      order:       idx + 1,
    }
  })

  return {
    steps,
    intentLabel: intent.label,
    totalAssets: selectedFormats.length * slides.length,
  }
}
