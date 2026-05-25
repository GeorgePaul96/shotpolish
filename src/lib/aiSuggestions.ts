// Pre-built copy suggestions keyed by intent.
// No API required — these are hand-crafted, founder-tested lines.

export interface Suggestions {
  headlines: string[]
  callouts: string[]
  captions: string[]   // social post copy snippets
}

export const AI_SUGGESTIONS: Record<string, Suggestions> = {
  'Explain Feature': {
    headlines: [
      'Check out this feature!',
      'The detail most users miss',
      'Built exactly how you asked',
      'This changes how you work',
      'One click away from better',
    ],
    callouts: [
      'This is where the magic happens',
      'Click here to try it',
      'The part everyone loves',
      'New in this release',
      'Your new favourite shortcut',
    ],
    captions: [
      'Shipping something I\'m really proud of 🚀',
      'A small change that makes a big difference.',
      'This feature alone saves 20 minutes a day.',
    ],
  },

  'Launch Product': {
    headlines: [
      'We are officially live!',
      'Say hello to something new.',
      'Finally. It\'s here.',
      'The wait is over.',
      '[Product] is now in public beta.',
    ],
    callouts: [
      'Now available',
      'Sign up free',
      'Try it today',
      'Live today',
      'Get early access',
    ],
    captions: [
      'We just launched. 🎉 Here\'s what we built and why it matters.',
      'After months of building in public, we\'re live. Thank you for following along.',
      '0 → live. It\'s shipping day.',
    ],
  },

  'Share Update': {
    headlines: [
      "Here's what's new",
      'We shipped something',
      'Small ship. Big impact.',
      'The changelog you actually want to read',
      'v2.0 is live',
    ],
    callouts: [
      'New addition',
      'Now available',
      'Just shipped',
      'Changelog drop',
      'Latest update',
    ],
    captions: [
      'Build-in-public update 🧵 Here\'s what shipped this week.',
      'Quiet ship Friday. Here\'s what\'s new.',
      'We listen. We build. Here\'s the proof.',
    ],
  },

  'Highlight Improvement': {
    headlines: [
      'We made it even better.',
      'You asked. We built.',
      'Faster, cleaner, smoother.',
      '10x better than before.',
      'The polished version is here.',
    ],
    callouts: [
      'Faster than before',
      'Much smoother now',
      '3× faster',
      'Redesigned for speed',
      'Completely rebuilt',
    ],
    captions: [
      'Spent the sprint on polish. Here\'s the before and after. 🧵',
      'Every interaction is smoother now. The details matter.',
      'User feedback → shipped improvement. 48 hours.',
    ],
  },

  'Show Bug Fix': {
    headlines: [
      'Fixed a frustrating bug.',
      'This one bugged us too.',
      'No more [issue]. Ever.',
      'Finally squashed it.',
      'Bug → fixed. Shipped.',
    ],
    callouts: [
      'Issue resolved',
      'Fixed in v2.1',
      'No more crashes',
      'Works now',
      'Patched today',
    ],
    captions: [
      'Bug squashed. Shipping it now. 🐛',
      'This one was sneaky. Here\'s how we found it and fixed it.',
      'Shout out to the user who reported this. Fixed same day.',
    ],
  },

  'Promote Benefit': {
    headlines: [
      'Save time with this.',
      'The fastest way to [result].',
      'One tool. Endless use cases.',
      'This is how [X] gets done.',
      'Work smarter. Not harder.',
    ],
    callouts: [
      'Saves hours of work',
      'Try it free',
      'No setup required',
      '5-minute setup',
      'ROI in day one',
    ],
    captions: [
      'The ROI on this is measurable. Here\'s how.',
      'This used to take us 2 hours. Now it\'s 10 minutes.',
      'If you\'re still doing [X] manually, read this 👇',
    ],
  },
}

// Platform-specific caption styles
export const PLATFORM_TONES: Record<string, string> = {
  'twitter-post':    'Short, punchy, scroll-stopping. Max 2 sentences.',
  'linkedin-post':   'Professional insight + clear value prop. 2-3 sentences.',
  'instagram-post':  'Visual-first. Use emojis. Hook in line one.',
  'instagram-story': 'Ultra short. 1 bold statement.',
  'product-hunt':    'Builder tone. What you made and why it matters.',
  'reddit-post':     'Authentic, no hype. Show the actual product.',
  'threads-post':    'Casual, conversational. Like a tweet but longer.',
}
