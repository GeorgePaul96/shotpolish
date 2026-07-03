import { describe, it, expect } from 'vitest'
import { STORY_INTENTS } from './storyTemplates'
import { SOCIAL_FORMATS } from './socialFormats'

// The role vocabulary established by the original intents. Story Mode maps
// template roles to StoryRole via substring matching (mapTemplateRoleToStoryRole
// in StoryModePage.tsx); novel role strings fall through to the degraded
// 'uncertain' bucket, so new intents must reuse these strings.
const ALLOWED_ROLES = [
  'hook', 'problem', 'feature', 'demo', 'result', 'cta',
  'intro', 'step-1', 'step-2', 'step-3',
  'before', 'pain-point', 'transition', 'after', 'benefit',
  'headline', 'what-changed', 'why-matters',
  'welcome', 'core', 'key-action', 'first-win',
  'tease', 'how-it-works', 'try-it',
  'approach', 'metric',
  'issue', 'fix',
  'hero', 'feature-1', 'feature-2', 'feature-3',
]

describe('STORY_INTENTS', () => {
  it('has unique intent ids', () => {
    const ids = STORY_INTENTS.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every intent has at least 3 slides with complete copy', () => {
    for (const intent of STORY_INTENTS) {
      expect(intent.slides.length, intent.id).toBeGreaterThanOrEqual(3)
      for (const s of intent.slides) {
        expect(s.role, intent.id).toBeTruthy()
        expect(s.label, intent.id).toBeTruthy()
        expect(s.defaultTitle, intent.id).toBeTruthy()
        expect(s.defaultSubtitle, intent.id).toBeTruthy()
        expect(s.defaultCallout, intent.id).toBeTruthy()
      }
    }
  })

  it('every advertised format exists in SOCIAL_FORMATS', () => {
    for (const intent of STORY_INTENTS) {
      for (const f of intent.formats) {
        expect(SOCIAL_FORMATS[f], `${intent.id} → ${f}`).toBeDefined()
      }
    }
  })

  it('includes the cadence ritual packs', () => {
    const ids = STORY_INTENTS.map(i => i.id)
    for (const id of ['feature-friday', 'week-in-review', 'launch-countdown', 'milestone']) {
      expect(ids).toContain(id)
    }
  })

  it('every slide role belongs to the established role vocabulary', () => {
    for (const intent of STORY_INTENTS) {
      for (const s of intent.slides) {
        expect(ALLOWED_ROLES, `${intent.id} → ${s.role}`).toContain(s.role)
      }
    }
  })
})
