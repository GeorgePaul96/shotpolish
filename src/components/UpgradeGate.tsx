import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { hasFeature, type Feature } from '../lib/entitlements'

interface UpgradeGateProps {
  feature: Feature
  children: ReactNode
  /** Optional custom upsell; defaults to a small card linking to /pricing. */
  fallback?: ReactNode
}

/** Renders children when the current plan unlocks `feature`, else an upsell. */
export function UpgradeGate({ feature, children, fallback }: UpgradeGateProps) {
  const { plan } = useAuth()
  if (hasFeature(plan, feature)) return <>{children}</>
  if (fallback) return <>{fallback}</>
  return (
    <div className="rounded-2xl border border-[#E5E7EC] bg-white p-5 text-center shadow-card">
      <p className="text-sm font-medium text-[#374151]">This is a Pro feature</p>
      <p className="mt-1 text-xs text-[#6B7280]">Upgrade to unlock it.</p>
      <Link to="/pricing" className="btn-primary mt-3 inline-flex px-4 py-2 text-sm">
        See plans
      </Link>
    </div>
  )
}
