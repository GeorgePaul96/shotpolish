/**
 * ShotPolish Analytics
 *
 * Wraps Plausible's custom event API.
 * All calls are fire-and-forget — they never throw or block the UI.
 *
 * Usage:
 *   track('screenshot_uploaded')
 *   track('export_clicked', { intent: 'Launch Product', theme: 'Indigo' })
 *   track('error', { context: 'canvas_render', message: err.message })
 */

type Props = Record<string, string | number | boolean>

export function track(eventName: string, props?: Props): void {
  try {
    // Plausible custom events
    if (typeof window !== 'undefined' && (window as any).plausible) {
      (window as any).plausible(eventName, { props })
    }

    // Also log to console in development so you can verify events fire
    if (import.meta.env.DEV) {
      console.log('[Analytics]', eventName, props ?? '')
    }
  } catch {
    // Never let analytics crash the app
  }
}

/**
 * Named events — keeps usage consistent across the codebase.
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

  // Errors
  renderError:         (message: string)               => track('render_error',     { message }),
  uploadError:         (message: string)               => track('upload_error',     { message }),
} as const
