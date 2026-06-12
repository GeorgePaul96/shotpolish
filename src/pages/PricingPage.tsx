import { useAuth } from '../components/AuthProvider'
import { Navbar } from '../components/Navbar'

interface Tier {
  id: 'monthly' | 'annual' | 'ltd'
  name: string
  priceLabel: string      // placeholder — real pricing deferred
  blurb: string
  envKey: string          // Vite env var holding the Stripe Payment Link URL
}

const TIERS: Tier[] = [
  { id: 'monthly', name: 'Pro Monthly', priceLabel: '$— / mo',  blurb: 'Everything in Pro, billed monthly.', envKey: 'VITE_STRIPE_PAYMENT_LINK_MONTHLY' },
  { id: 'annual',  name: 'Pro Annual',  priceLabel: '$— / yr',  blurb: 'Two months free, billed yearly.',     envKey: 'VITE_STRIPE_PAYMENT_LINK_ANNUAL'  },
  { id: 'ltd',     name: 'Lifetime',    priceLabel: '$— once',  blurb: 'Pay once, founders pricing.',          envKey: 'VITE_STRIPE_PAYMENT_LINK_LTD'     },
]

const FEATURES = [
  'Watermark-free exports',
  'Scheduled publishing (coming soon)',
  'Priority support',
]

function paymentUrl(tier: Tier, userId: string | null, email?: string): string | null {
  const base = import.meta.env[tier.envKey] as string | undefined
  if (!base) return null
  if (!userId) return base
  const sep = base.includes('?') ? '&' : '?'
  const params = new URLSearchParams({ client_reference_id: userId })
  if (email) params.set('prefilled_email', email)
  return `${base}${sep}${params.toString()}`
}

export function PricingPage() {
  const { user } = useAuth()

  return (
    <main className="min-h-screen bg-[#F5F6F8] text-[#111827]">
      <Navbar />
      <section className="mx-auto max-w-5xl px-4 pt-28 pb-20">
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Simple, founder-friendly pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[#6B7280]">
          Free forever for watermarked exports. Upgrade for clean exports and the publishing pipeline.
        </p>

        <ul className="mx-auto mt-8 flex max-w-md flex-col gap-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-[#374151]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {f}
            </li>
          ))}
        </ul>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map(tier => {
            const url = paymentUrl(tier, user?.id ?? null, user?.email ?? undefined)
            const configured = url !== null
            return (
              <div key={tier.id} className="flex flex-col rounded-2xl border border-[#E5E7EC] bg-white p-6 shadow-card">
                <h2 className="text-lg font-semibold">{tier.name}</h2>
                <p className="mt-1 text-2xl font-bold tracking-tight">{tier.priceLabel}</p>
                <p className="mt-2 text-sm text-[#6B7280]">{tier.blurb}</p>
                <div className="flex-1" />
                {!user ? (
                  <a href="/" className="btn-ghost mt-5 px-4 py-2 text-center text-sm">Sign in to upgrade</a>
                ) : configured ? (
                  <a href={url!} className="btn-primary mt-5 px-4 py-2 text-center text-sm">Choose {tier.name}</a>
                ) : (
                  <button disabled className="mt-5 cursor-not-allowed rounded-xl bg-[#F0F1F4] px-4 py-2 text-center text-sm text-[#9CA3AF]">
                    Billing not configured yet
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
