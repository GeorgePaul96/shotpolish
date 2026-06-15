import type { Plan } from './entitlements'

/** True only when the typed value exactly matches the email (case/space-insensitive). */
export function isDeleteConfirmed(input: string, email: string): boolean {
  const a = input.trim().toLowerCase()
  const b = email.trim().toLowerCase()
  return a.length > 0 && a === b
}

export type PlanCta = 'upgrade' | 'manage' | 'none'

/** UI view-model for the account page's plan section. */
export function accountPlanView(plan: Plan, hasPortal: boolean): { badgeLabel: string; cta: PlanCta } {
  if (plan === 'free') return { badgeLabel: 'Free', cta: 'upgrade' }
  const badgeLabel = plan === 'ltd' ? 'Lifetime' : 'Pro'
  return { badgeLabel, cta: hasPortal ? 'manage' : 'none' }
}

/**
 * Permanently delete the signed-in user's account. Invokes the delete-account
 * Edge Function (which auto-receives the session JWT), then signs out locally.
 * Throws if the function call fails (the caller surfaces the error).
 */
export async function deleteAccount(): Promise<void> {
  // Imported lazily so the pure helpers above can be unit-tested in the Node
  // vitest env without eagerly constructing the Supabase realtime client
  // (which requires native WebSocket, unavailable on Node < 22).
  const { supabase } = await import('./supabase')
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  await supabase.auth.signOut()
}
