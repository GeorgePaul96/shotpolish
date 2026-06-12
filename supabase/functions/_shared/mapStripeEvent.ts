// Pure Stripe-event → profile-update mapping. No SDK import so it runs under
// vitest. The Deno webhook shell verifies the signature then delegates here.

// NOTE: kept identical to `Plan` in src/lib/entitlements.ts. The two live in
// separate bundles (Deno edge vs Vite client) and can't share an import.
export type Plan = 'free' | 'pro' | 'ltd'

export interface StripeEventLike {
  id: string
  type: string
  data: { object: Record<string, any> }
}

export interface PlanUpdate {
  userId?: string            // present for checkout (we know the Supabase user)
  stripeCustomerId?: string  // present whenever Stripe gives us the customer id
  plan: Plan
  planRenewsAt?: string | null // ISO string, or null to clear
}

export function mapStripeEvent(event: StripeEventLike): PlanUpdate | null {
  const obj = event.data.object

  if (event.type === 'checkout.session.completed') {
    const userId = obj.client_reference_id
    const plan = obj.metadata?.plan
    if (!userId) return null
    if (plan !== 'pro' && plan !== 'ltd') return null
    return { userId, stripeCustomerId: obj.customer ?? undefined, plan }
  }

  if (event.type === 'customer.subscription.updated') {
    if (!obj.customer) return null
    const renews = typeof obj.current_period_end === 'number'
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null
    return { stripeCustomerId: obj.customer, plan: 'pro', planRenewsAt: renews }
  }

  if (event.type === 'customer.subscription.deleted') {
    if (!obj.customer) return null
    return { stripeCustomerId: obj.customer, plan: 'free', planRenewsAt: null }
  }

  return null
}
