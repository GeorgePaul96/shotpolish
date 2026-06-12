import { useAuth } from '../components/AuthProvider'
import { isPaid, type Plan } from '../lib/entitlements'

export interface Entitlement {
  plan: Plan
  isPro: boolean
  isLoading: boolean
  openPortal: () => void
}

/** Reads the current plan from AuthProvider and exposes entitlement helpers. */
export function useEntitlement(): Entitlement {
  const { plan, loading } = useAuth()
  const openPortal = () => {
    const url = import.meta.env.VITE_STRIPE_PORTAL_URL as string | undefined
    if (!url) {
      console.warn('[useEntitlement] VITE_STRIPE_PORTAL_URL is not set; cannot open portal.')
      return
    }
    window.open(url, '_blank', 'noopener')
  }
  return { plan, isPro: isPaid(plan), isLoading: loading, openPortal }
}
