export interface SlideTemplate {
  role: string
  label: string
  defaultTitle: string
  defaultSubtitle: string
  defaultCallout: string
}

export interface StoryIntent {
  id: string
  label: string
  icon: string
  description: string
  formats: string[]
  color: string
  slides: SlideTemplate[]
}

export const STORY_INTENTS: StoryIntent[] = [
  {
    id: 'feature-launch',
    label: 'Feature Launch',
    icon: '🚀',
    description: 'Announce a new feature with context and real impact',
    formats: ['twitter-post', 'linkedin-post', 'product-hunt'],
    color: '#818cf8',
    slides: [
      { role: 'hook',    label: 'Hook',          defaultTitle: 'Something big just shipped.',     defaultSubtitle: "Here's why it matters to your workflow.",  defaultCallout: 'New' },
      { role: 'problem', label: 'The Problem',    defaultTitle: 'The old way was painful.',        defaultSubtitle: 'Most teams waste hours on this every week.', defaultCallout: 'Pain point' },
      { role: 'feature', label: 'The Feature',    defaultTitle: 'Introducing the new way.',        defaultSubtitle: 'Built exactly how you asked for it.',       defaultCallout: 'Just shipped' },
      { role: 'demo',    label: 'How It Works',   defaultTitle: "Here's how it works.",            defaultSubtitle: 'One click. Done. No setup required.',       defaultCallout: 'This is where the magic happens' },
      { role: 'result',  label: 'The Result',     defaultTitle: 'The outcome is clear.',           defaultSubtitle: 'Faster. Simpler. Works the way you think.', defaultCallout: 'Before → After' },
      { role: 'cta',     label: 'Call to Action', defaultTitle: 'Try it free today.',              defaultSubtitle: 'No account required. Up and running in 60s.', defaultCallout: 'Get started' },
    ],
  },
  {
    id: 'product-walkthrough',
    label: 'Product Walkthrough',
    icon: '🎯',
    description: 'Guide users through your product step by step',
    formats: ['linkedin-post', 'instagram-post', 'twitter-post'],
    color: '#38bdf8',
    slides: [
      { role: 'intro',  label: 'Introduction', defaultTitle: 'Let me show you something.',   defaultSubtitle: 'A 60-second walkthrough of the whole product.',  defaultCallout: 'Overview' },
      { role: 'step-1', label: 'Step 1',        defaultTitle: 'Start here.',                 defaultSubtitle: 'The first thing you do after signing up.',       defaultCallout: 'Step 1' },
      { role: 'step-2', label: 'Step 2',        defaultTitle: 'Then this.',                  defaultSubtitle: 'Now the system takes over the heavy lifting.',   defaultCallout: 'Step 2' },
      { role: 'step-3', label: 'Step 3',        defaultTitle: 'Finally.',                    defaultSubtitle: 'Your result is ready in seconds, not hours.',    defaultCallout: 'Step 3' },
      { role: 'result', label: 'The Result',    defaultTitle: "That's the whole workflow.",  defaultSubtitle: 'From scratch to done in under two minutes.',      defaultCallout: 'Done ✓' },
    ],
  },
  {
    id: 'before-after',
    label: 'Before vs After',
    icon: '⚡',
    description: 'Show the transformation your product enables',
    formats: ['twitter-post', 'instagram-post', 'linkedin-post'],
    color: '#fb7185',
    slides: [
      { role: 'before',     label: 'Before',     defaultTitle: 'This is the old way.',      defaultSubtitle: 'Slow. Manual. Painful. Everyone hates it.',        defaultCallout: 'Before' },
      { role: 'pain-point', label: 'Pain Point', defaultTitle: 'The frustration was real.', defaultSubtitle: 'Hours wasted. Every single week.',                 defaultCallout: 'The problem' },
      { role: 'transition', label: 'Transition', defaultTitle: 'Then we built something.',  defaultSubtitle: 'Designed to eliminate every point of friction.',   defaultCallout: 'The solution' },
      { role: 'after',      label: 'After',      defaultTitle: 'This is the new way.',      defaultSubtitle: 'Fast. Automated. Elegant. Works every time.',      defaultCallout: 'After' },
      { role: 'benefit',    label: 'The Benefit',defaultTitle: 'The difference is clear.',  defaultSubtitle: '10× faster. Hours saved every single week.',       defaultCallout: 'Measured result' },
    ],
  },
  {
    id: 'changelog',
    label: 'Changelog Update',
    icon: '📦',
    description: 'Document what shipped and build trust publicly',
    formats: ['twitter-post', 'linkedin-post', 'threads-post'],
    color: '#fcd34d',
    slides: [
      { role: 'headline',    label: 'Headline',      defaultTitle: 'What shipped this week.',    defaultSubtitle: 'Build in public. Ship in public.',               defaultCallout: 'v2.1 released' },
      { role: 'what-changed',label: 'What Changed',  defaultTitle: "Here's what's new.",         defaultSubtitle: 'Completely redesigned from the ground up.',      defaultCallout: 'Just shipped' },
      { role: 'why-matters', label: 'Why It Matters',defaultTitle: 'Why this matters.',          defaultSubtitle: 'You asked for it. We built it in a week.',       defaultCallout: 'Impact' },
      { role: 'cta',         label: 'What\'s Next',  defaultTitle: "What's coming next.",        defaultSubtitle: "Follow along — we build entirely in public.",   defaultCallout: 'Roadmap →' },
    ],
  },
  {
    id: 'tutorial',
    label: 'Tutorial',
    icon: '📚',
    description: 'Teach users to accomplish something valuable',
    formats: ['instagram-post', 'linkedin-post', 'youtube-thumb'],
    color: '#34d399',
    slides: [
      { role: 'intro',  label: 'Goal',    defaultTitle: 'How to do X in 3 steps.',     defaultSubtitle: 'No prior experience required.',                  defaultCallout: 'Tutorial' },
      { role: 'step-1', label: 'Step 1',  defaultTitle: 'Step 1: Start with this.',    defaultSubtitle: 'Open the dashboard and navigate to...',         defaultCallout: '1 of 3' },
      { role: 'step-2', label: 'Step 2',  defaultTitle: 'Step 2: Then do this.',       defaultSubtitle: 'Click here and configure your settings.',        defaultCallout: '2 of 3' },
      { role: 'step-3', label: 'Step 3',  defaultTitle: 'Step 3: Final step.',         defaultSubtitle: 'Hit submit and watch it go.',                    defaultCallout: '3 of 3' },
      { role: 'result', label: 'Result',  defaultTitle: "Done. That's the whole thing.", defaultSubtitle: 'Your [X] is live and ready to use.',           defaultCallout: 'Complete ✓' },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding Flow',
    icon: '👋',
    description: 'Help new users find their first win faster',
    formats: ['product-hunt', 'linkedin-post', 'twitter-post'],
    color: '#94a3b8',
    slides: [
      { role: 'welcome',   label: 'Welcome',      defaultTitle: 'Welcome to [Product].',          defaultSubtitle: "Here's everything you need to know to start.",  defaultCallout: 'Get started' },
      { role: 'core',      label: 'Core Feature', defaultTitle: 'The most important thing.',      defaultSubtitle: 'This is your main workspace. Spend time here.',  defaultCallout: 'Core feature' },
      { role: 'key-action',label: 'Key Action',   defaultTitle: 'Your first action.',             defaultSubtitle: 'Try this first. It takes under 10 seconds.',     defaultCallout: 'Do this first' },
      { role: 'first-win', label: 'First Win',    defaultTitle: 'Your first result.',             defaultSubtitle: 'Most users see value in their first session.',   defaultCallout: 'First win ✓' },
    ],
  },
  {
    id: 'feature-announcement',
    label: 'Feature Announcement',
    icon: '✨',
    description: 'Quick spotlight on one feature you just shipped',
    formats: ['twitter-post', 'threads-post', 'linkedin-post'],
    color: '#e879f9',
    slides: [
      { role: 'tease',        label: 'Teaser',       defaultTitle: "We just shipped something quietly.",  defaultSubtitle: "Most users haven't noticed it yet.",            defaultCallout: 'Psst...' },
      { role: 'feature',      label: 'The Feature',  defaultTitle: 'Introducing [feature name].',         defaultSubtitle: 'Built for the way you actually work.',           defaultCallout: 'New feature' },
      { role: 'how-it-works', label: 'How It Works', defaultTitle: "Here's how it works.",                defaultSubtitle: 'Click once. The system handles the rest.',       defaultCallout: 'The detail' },
      { role: 'try-it',       label: 'Try It',       defaultTitle: 'Try it right now.',                   defaultSubtitle: "It's already live in your account.",             defaultCallout: 'Available now' },
    ],
  },
  {
    id: 'case-study',
    label: 'Case Study / Results',
    icon: '📊',
    description: 'Show real outcomes your product created',
    formats: ['linkedin-post', 'product-hunt', 'twitter-post'],
    color: '#f97316',
    slides: [
      { role: 'problem',  label: 'The Problem', defaultTitle: 'They had a real problem.',      defaultSubtitle: 'Hours wasted. Every single week. For months.',     defaultCallout: 'The challenge' },
      { role: 'approach', label: 'The Approach',defaultTitle: "Here's what they tried.",        defaultSubtitle: 'Using [Product] to completely rethink the flow.',  defaultCallout: 'The solution' },
      { role: 'result',   label: 'The Result',  defaultTitle: 'The outcome was immediate.',    defaultSubtitle: 'In the very first week, everything changed.',       defaultCallout: 'Result' },
      { role: 'metric',   label: 'Key Metric',  defaultTitle: 'The number that mattered most.',defaultSubtitle: '10× faster. 8+ hours saved every week.',           defaultCallout: 'Measured impact' },
      { role: 'cta',      label: 'CTA',         defaultTitle: 'Your turn.',                    defaultSubtitle: 'Try it free. No card required. 60-second setup.',  defaultCallout: 'Get started' },
    ],
  },
  {
    id: 'bug-fix',
    label: 'Bug Fix / Improvement',
    icon: '🛠',
    description: 'Celebrate a quality win with your community',
    formats: ['twitter-post', 'linkedin-post', 'threads-post'],
    color: '#34d399',
    slides: [
      { role: 'issue',  label: 'The Issue',  defaultTitle: 'This bug frustrated us too.',       defaultSubtitle: 'Reported by 40+ users. Finally squashed.',         defaultCallout: 'The bug' },
      { role: 'fix',    label: 'The Fix',    defaultTitle: "Here's what we changed.",           defaultSubtitle: 'Rebuilt from scratch. Properly this time.',        defaultCallout: 'Fixed ✓' },
      { role: 'before', label: 'Before',     defaultTitle: 'Before: clunky and unreliable.',    defaultSubtitle: "You shouldn't have to deal with this. Ever.",     defaultCallout: 'Before' },
      { role: 'after',  label: 'After',      defaultTitle: 'After: clean and instant.',         defaultSubtitle: 'Smooth. Fast. Works every time.',                  defaultCallout: 'After' },
    ],
  },
  {
    id: 'product-hunt-launch',
    label: 'Product Hunt Launch',
    icon: '🏆',
    description: 'Build a complete Product Hunt gallery package',
    formats: ['product-hunt', 'twitter-post', 'linkedin-post'],
    color: '#da552f',
    slides: [
      { role: 'hero',      label: 'Hero Slide',  defaultTitle: 'Turn screenshots into launch stories.',  defaultSubtitle: 'The fastest way to launch visually.',          defaultCallout: 'Live on Product Hunt' },
      { role: 'feature-1', label: 'Feature 1',   defaultTitle: 'Headline for feature one.',              defaultSubtitle: 'Describe the core capability in one line.',   defaultCallout: 'Feature 1' },
      { role: 'feature-2', label: 'Feature 2',   defaultTitle: 'Headline for feature two.',              defaultSubtitle: 'Show the workflow that saves hours.',          defaultCallout: 'Feature 2' },
      { role: 'feature-3', label: 'Feature 3',   defaultTitle: 'Headline for feature three.',            defaultSubtitle: 'The final compelling reason to try it.',      defaultCallout: 'Feature 3' },
      { role: 'cta',       label: 'CTA Slide',   defaultTitle: 'Try it free today.',                     defaultSubtitle: "We'd love your upvote. It means the world.",  defaultCallout: 'Upvote ↑' },
    ],
  },
]

export const FORMAT_LABELS: Record<string, string> = {
  'twitter-post':    'Twitter / X',
  'linkedin-post':   'LinkedIn',
  'product-hunt':    'Product Hunt',
  'instagram-post':  'Instagram',
  'instagram-story': 'IG Story',
  'threads-post':    'Threads',
  'youtube-thumb':   'YouTube',
  'reddit-post':     'Reddit',
  'og-image':        'OG Image',
}
