export interface SocialFormat {
  id: string
  platform: string
  name: string
  width: number
  height: number
  color: string        // platform brand color
  description: string
  tag?: string
}

export const SOCIAL_FORMATS: Record<string, SocialFormat> = {
  free: {
    id: 'free', platform: 'Custom', name: 'Free',
    width: 0, height: 0, color: '#52525b',
    description: 'Auto-sized to your screenshot',
  },
  'twitter-post': {
    id: 'twitter-post', platform: 'X / Twitter', name: 'Post',
    width: 1200, height: 675, color: '#e7e9ea',
    description: '16:9 · 1200×675',
  },
  'instagram-post': {
    id: 'instagram-post', platform: 'Instagram', name: 'Square Post',
    width: 1080, height: 1080, color: '#e1306c',
    description: '1:1 · 1080×1080',
  },
  'instagram-portrait': {
    id: 'instagram-portrait', platform: 'Instagram', name: 'Portrait',
    width: 1080, height: 1350, color: '#e1306c',
    description: '4:5 · 1080×1350',
  },
  'instagram-story': {
    id: 'instagram-story', platform: 'Instagram', name: 'Story / Reel',
    width: 1080, height: 1920, color: '#e1306c',
    description: '9:16 · 1080×1920',
  },
  'linkedin-post': {
    id: 'linkedin-post', platform: 'LinkedIn', name: 'Post',
    width: 1200, height: 627, color: '#0077b5',
    description: '~1.91:1 · 1200×627',
  },
  'linkedin-carousel': {
    id: 'linkedin-carousel', platform: 'LinkedIn', name: 'Carousel',
    width: 1080, height: 1080, color: '#0077b5',
    description: '1:1 · 1080×1080 documents',
  },
  'product-hunt': {
    id: 'product-hunt', platform: 'Product Hunt', name: 'Gallery',
    width: 1270, height: 760, color: '#da552f',
    description: '5:3 · 1270×760', tag: 'Launch',
  },
  'youtube-thumb': {
    id: 'youtube-thumb', platform: 'YouTube', name: 'Thumbnail',
    width: 1280, height: 720, color: '#ff0000',
    description: '16:9 · 1280×720',
  },
  'tiktok-vertical': {
    id: 'tiktok-vertical', platform: 'TikTok', name: 'Vertical',
    width: 1080, height: 1920, color: '#ff0050',
    description: '9:16 · 1080×1920 video',
  },
  'reddit-post': {
    id: 'reddit-post', platform: 'Reddit', name: 'Post',
    width: 1200, height: 628, color: '#ff4500',
    description: '~1.91:1 · 1200×628',
  },
  'facebook-marketplace': {
    id: 'facebook-marketplace', platform: 'FB Marketplace', name: 'Marketplace',
    width: 1200, height: 1200, color: '#1877f2',
    description: '1:1 · 1200×1200 listing',
  },
  'og-image': {
    id: 'og-image', platform: 'Open Graph', name: 'OG / Link',
    width: 1200, height: 630, color: '#7c3aed',
    description: '1200×630 · Link previews', tag: 'Web',
  },
  'threads-post': {
    id: 'threads-post', platform: 'Threads', name: 'Post',
    width: 1080, height: 1080, color: '#e7e9ea',
    description: '1:1 · 1080×1080',
  },
}

// Ordered groups for the format bar — core launch platforms only
export const FORMAT_BAR: Array<{ label: string; id: string }> = [
  { label: 'Free',          id: 'free'             },
  { label: 'X / Twitter',   id: 'twitter-post'     },
  { label: 'IG Post',       id: 'instagram-post'   },
  { label: 'IG Story',      id: 'instagram-story'  },
  { label: 'LinkedIn',      id: 'linkedin-post'    },
  { label: 'Product Hunt',  id: 'product-hunt'     },
  { label: 'OG Image',      id: 'og-image'         },
]

// Multi-export checklist — common launch bundle
export const LAUNCH_BUNDLE: string[] = [
  'twitter-post',
  'instagram-post',
  'linkedin-post',
  'product-hunt',
  'og-image',
]
