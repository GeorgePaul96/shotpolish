import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 7V5M10 15v-2M7 10H5M15 10h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: 'AI Background Generation',
    desc: 'One click produces a perfectly tuned background — dark gradients, radial glows, and ambient color — matched to your content.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
        <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'Auto Padding & Spacing',
    desc: 'Intelligent margin calculation gives your screenshot breathing room — never cramped, never wasteful.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <rect x="4" y="5" width="12" height="10" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="3" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
      </svg>
    ),
    title: 'Depth & Shadow',
    desc: 'Layered drop shadows with color tinting make your screenshots float. Adjustable from subtle lift to dramatic depth.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Instant Export',
    desc: 'Your polished screenshot is ready as a high-resolution PNG in under a second. No cloud processing, no wait.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <path d="M4 7h12M4 10h8M4 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="15" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M15 11.5v1.5l1 0.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Callout Annotations',
    desc: 'Draw a focus box over any area. ShotPolish adds a spotlight, border accents, and a labeled callout arrow automatically.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <rect x="3" y="5" width="6" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'Social Format Presets',
    desc: 'One-click aspect ratios: 1:1 for Instagram, 16:9 for Twitter/X, 4:3 for LinkedIn, portrait for Stories.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
        <path d="M3 6h14M3 10h14M3 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="15" cy="14" r="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'Narrative Templates',
    desc: 'Pick an intent — Launch Product, Explain Feature, Share Update — and get suggested headlines and callouts automatically.',
  },
]

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc, index }: {
  icon: React.ReactNode; title: string; desc: string; index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: (index % 3) * 0.07, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ y: -2 }}
      className="group relative p-5 rounded-2xl border border-[#E5E7EC] bg-white
                 hover:bg-gray-50 hover:border-[#C5CAD8] hover:shadow-card transition-all duration-200 cursor-default"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center
                      text-accent mb-4 group-hover:bg-accent/15 transition-all duration-200">
        {icon}
      </div>

      {/* Content */}
      <h3 className="text-sm font-semibold text-[#111827] tracking-tight mb-1.5">{title}</h3>
      <p className="text-sm text-[#6B7280] leading-relaxed">{desc}</p>

      {/* Subtle top border highlight on hover */}
      <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-accent/20 to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </motion.div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

export function FeaturesSection() {
  const headerRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-80px' })

  return (
    <section id="features" className="py-24 px-4 relative">
      {/* Subtle separator line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#E5E7EC] to-transparent" />

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span className="section-tag mb-4 inline-flex">Everything you need</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] tracking-tight">
            The fastest path from
            <br />
            <span className="text-gradient">raw to remarkable</span>
          </h2>
          <p className="mt-4 text-[#374151] max-w-md mx-auto leading-relaxed">
            Every tool you need to make screenshots worth sharing — nothing more, nothing less.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} {...f} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
