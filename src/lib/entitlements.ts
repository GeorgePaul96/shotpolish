// Pure entitlement logic — no React, no Supabase. Single source of the
// plan→feature mapping used by the hook, the upgrade gate, and the editor.

export type Plan = 'free' | 'pro' | 'ltd'
export type Feature = 'watermark_removal' | 'scheduled_publishing'

/** Paid plans get every gated feature. */
export function isPaid(plan: Plan): boolean {
  return plan === 'pro' || plan === 'ltd'
}

/** Currently every gated feature is unlocked by any paid plan. */
export function hasFeature(plan: Plan, _feature: Feature): boolean {
  return isPaid(plan)
}

/** RenderOptions for the canvas: free users get the watermark, paid users don't. */
export function renderOptionsFor(isPro: boolean): { watermark: boolean } {
  return { watermark: !isPro }
}
