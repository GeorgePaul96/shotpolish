export interface Template {
  id: string
  name: string
  category: string
  description: string
  themeIndex: number     // index into THEMES array
  padding: number
  shadowOpacity: number
  aspectRatio: string
  intent: string
  headline: string
  callout: string
  accent?: string        // preview accent colour (matches theme)
}

export const TEMPLATE_CATEGORIES = [
  'Product Launch',
  'Feature Demo',
  'App Showcase',
  'AI Product',
  'Startup / Indie',
  'E-commerce',
] as const

export const TEMPLATES: Template[] = [
  // ── Product Launch ─────────────────────────────────────────────────────────
  {
    id: 'launch-indigo',
    name: 'Classic Launch',
    category: 'Product Launch',
    description: 'Deep indigo glow. Perfect for SaaS launches on X.',
    themeIndex: 0, padding: 120, shadowOpacity: 0.90,
    aspectRatio: 'twitter-post',
    intent: 'Launch Product',
    headline: 'We are officially live!',
    callout: 'Now available',
    accent: '#818cf8',
  },
  {
    id: 'launch-rose',
    name: 'Bold Launch',
    category: 'Product Launch',
    description: 'Warm rose. Stands out in any feed.',
    themeIndex: 2, padding: 100, shadowOpacity: 0.95,
    aspectRatio: 'product-hunt',
    intent: 'Launch Product',
    headline: 'Finally. It\'s here.',
    callout: 'Now available',
    accent: '#fb7185',
  },
  {
    id: 'launch-amber',
    name: 'Energy Launch',
    category: 'Product Launch',
    description: 'Golden amber for high-energy product moments.',
    themeIndex: 4, padding: 110, shadowOpacity: 0.85,
    aspectRatio: 'twitter-post',
    intent: 'Launch Product',
    headline: 'Say hello to something new.',
    callout: 'Live today',
    accent: '#fcd34d',
  },

  // ── Feature Demo ───────────────────────────────────────────────────────────
  {
    id: 'feature-indigo',
    name: 'Feature Spotlight',
    category: 'Feature Demo',
    description: 'Indigo focus box with annotation callout.',
    themeIndex: 0, padding: 90, shadowOpacity: 0.80,
    aspectRatio: 'twitter-post',
    intent: 'Explain Feature',
    headline: 'Check out this feature!',
    callout: 'This is where the magic happens',
    accent: '#818cf8',
  },
  {
    id: 'feature-emerald',
    name: 'Growth Feature',
    category: 'Feature Demo',
    description: 'Emerald green. Great for metrics and analytics.',
    themeIndex: 1, padding: 80, shadowOpacity: 0.85,
    aspectRatio: 'linkedin-post',
    intent: 'Highlight Improvement',
    headline: 'We made it even better.',
    callout: 'Faster than before',
    accent: '#34d399',
  },
  {
    id: 'feature-sky',
    name: 'Clean Feature',
    category: 'Feature Demo',
    description: 'Sky blue. Minimal and trustworthy.',
    themeIndex: 5, padding: 100, shadowOpacity: 0.75,
    aspectRatio: 'instagram-post',
    intent: 'Explain Feature',
    headline: 'The detail most users miss.',
    callout: 'Built exactly how you asked',
    accent: '#38bdf8',
  },

  // ── App Showcase ───────────────────────────────────────────────────────────
  {
    id: 'app-dark',
    name: 'Dark App',
    category: 'App Showcase',
    description: 'Slate neutral. Universal for any app.',
    themeIndex: 3, padding: 140, shadowOpacity: 0.95,
    aspectRatio: 'instagram-post',
    intent: 'Explain Feature',
    headline: 'Built for how you work.',
    callout: 'Available now',
    accent: '#94a3b8',
  },
  {
    id: 'app-vertical',
    name: 'Story Format',
    category: 'App Showcase',
    description: 'Portrait ratio for Stories and Reels.',
    themeIndex: 0, padding: 160, shadowOpacity: 0.90,
    aspectRatio: 'instagram-story',
    intent: 'Promote Benefit',
    headline: 'Save time with this.',
    callout: 'Saves hours of work',
    accent: '#818cf8',
  },

  // ── AI Product ─────────────────────────────────────────────────────────────
  {
    id: 'ai-violet',
    name: 'AI Glow',
    category: 'AI Product',
    description: 'Deep violet glow. Iconic for AI launches.',
    themeIndex: 0, padding: 130, shadowOpacity: 0.92,
    aspectRatio: 'product-hunt',
    intent: 'Launch Product',
    headline: 'AI that actually gets it.',
    callout: 'Powered by AI',
    accent: '#818cf8',
  },
  {
    id: 'ai-emerald',
    name: 'AI Growth',
    category: 'AI Product',
    description: 'Emerald accent for AI analytics tools.',
    themeIndex: 1, padding: 100, shadowOpacity: 0.85,
    aspectRatio: 'twitter-post',
    intent: 'Promote Benefit',
    headline: 'Let AI do the heavy lifting.',
    callout: 'Instant results',
    accent: '#34d399',
  },

  // ── Startup / Indie ────────────────────────────────────────────────────────
  {
    id: 'indie-update',
    name: 'Indie Update',
    category: 'Startup / Indie',
    description: 'Compact update format. Great for build-in-public.',
    themeIndex: 3, padding: 80, shadowOpacity: 0.70,
    aspectRatio: 'twitter-post',
    intent: 'Share Update',
    headline: 'Small ship. Big impact.',
    callout: 'Shipped today',
    accent: '#94a3b8',
  },
  {
    id: 'indie-fix',
    name: 'Bug Fix Ship',
    category: 'Startup / Indie',
    description: 'Show off a polish win.',
    themeIndex: 1, padding: 90, shadowOpacity: 0.80,
    aspectRatio: 'twitter-post',
    intent: 'Show Bug Fix',
    headline: 'Fixed a frustrating bug.',
    callout: 'Issue resolved',
    accent: '#34d399',
  },

  // ── E-commerce ─────────────────────────────────────────────────────────────
  {
    id: 'ecom-amber',
    name: 'Product Drop',
    category: 'E-commerce',
    description: 'Warm golden. Perfect for product announcements.',
    themeIndex: 4, padding: 100, shadowOpacity: 0.88,
    aspectRatio: 'instagram-post',
    intent: 'Launch Product',
    headline: 'New drop. Available now.',
    callout: 'Shop the look',
    accent: '#fcd34d',
  },
  {
    id: 'ecom-rose',
    name: 'Flash Deal',
    category: 'E-commerce',
    description: 'Rose red urgency. Drives clicks.',
    themeIndex: 2, padding: 90, shadowOpacity: 0.90,
    aspectRatio: 'facebook-post',
    intent: 'Promote Benefit',
    headline: 'Save time with this.',
    callout: 'Limited offer',
    accent: '#fb7185',
  },
]
