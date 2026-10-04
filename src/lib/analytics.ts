/**
 * ShotPolish Analytics
 *
 * Dual-sink: fans out each event to Plausible's and PostHog's custom event APIs.
 * All calls are fire-and-forget, they never throw or block the UI.
 *
 * Usage:
 *   track('screenshot_uploaded')
 *   track('export_clicked', { intent: 'Launch Product', theme: 'Indigo' })
 *   track('error', { context: 'canvas_render', message: err.message })
 */

import { phCapture } from './posthog'

type Props = Record<string, string | number | boolean>

export function track(eventName: string, props?: Props): void {
  // Plausible sink
  try {
    if (typeof window !== 'undefined' && (window as any).plausible) {
      (window as any).plausible(eventName, { props })
    }
    if (import.meta.env.DEV) {
      console.log('[Analytics]', eventName, props ?? '')
    }
  } catch {
    // Never let analytics crash the app
  }

  // PostHog sink (no-op unless configured; guarded internally, but wrap anyway)
  try {
    phCapture(eventName, props)
  } catch {
    // Never let analytics crash the app
  }
}

/**
 * Named events, keeps usage consistent across the codebase.
 * Add new events here as you build features.
 */
export const Events = {
  // Funnel
  screenshotUploaded:  ()                              => track('screenshot_uploaded'),
  focusBoxDrawn:       ()                              => track('focus_box_drawn'),
  exportClicked:       (intent: string, theme: string) => track('export_clicked',  { intent, theme }),
  exportCompleted:     (intent: string, theme: string) => track('export_completed', { intent, theme }),

  // Engagement
  intentChanged:       (intent: string)                => track('intent_changed',   { intent }),
  themeChanged:        (theme: string)                 => track('theme_changed',    { theme }),
  headlineEdited:      ()                              => track('headline_edited'),
  calloutEdited:       ()                              => track('callout_edited'),

  // Interest signals
  signupInterestShown: ()                              => track('signup_interest_shown'),
  pricingInterestShown:()                              => track('pricing_interest_shown'),

  // Remix viral loop
  remixLanded:         (templateId: string)            => track('remix_landed',           { templateId }),
  remixExported:       (templateId: string)            => track('remix_export_completed', { templateId }),

  // Monetization funnel
  pricingTierClicked:  (tier: string)                  => track('pricing_tier_clicked',   { tier }),

  // Errors
  renderError:         (message: string)               => track('render_error',     { message }),
  uploadError:         (message: string)               => track('upload_error',     { message }),

  // Story animation
  storyAnimStarted:    (slides: number)                => track('story_anim_started',  { slides }),
  storyAnimComplete:   (slides: number, format: string) => track('story_anim_complete', { slides, format }),
  storyAnimDownload:   (format: string)                 => track('story_anim_download', { format }),
  storyAnimError:      (slides: number)                 => track('story_anim_error',    { slides }),

  // Story PDF carousel (LinkedIn document posts)
  storyPdfStarted:     (slides: number)                => track('story_pdf_started',  { slides }),
  storyPdfComplete:    (slides: number)                => track('story_pdf_complete', { slides }),
  storyPdfError:       (slides: number)                => track('story_pdf_error',    { slides }),

  // Museum of You (never send names, captions, or photos)
  museumBuilderStarted:  ()                              => track('museum_builder_started'),
  museumExhibitAdded:    (count: number)                 => track('museum_exhibit_added',     { count }),
  museumPreviewOpened:   ()                              => track('museum_preview_opened'),
  museumPublishClicked:  (tier: string)                  => track('museum_publish_clicked',   { tier }),
  museumPublished:       (tier: string)                  => track('museum_published',         { tier }),
  museumCheckoutStarted: ()                              => track('museum_checkout_started'),
  museumPaidConfirmed:   ()                              => track('museum_paid_confirmed'),
  museumViewerOpened:    (state: string)                 => track('museum_viewer_opened',     { state }),
  museumEntered:         (mode: string)                  => track('museum_entered',           { mode }),
  museumFinalReveal:     (source: string, mode: string)  => track('museum_final_reveal',      { source, mode }),
  museumCardShared:      (method: string)                => track('museum_card_shared',       { method }),
  museumBuildOwnClicked: (from: string)                  => track('museum_build_own_clicked', { from }),
} as const
