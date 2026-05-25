import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'

export function CtaSection() {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="py-28 px-4 relative overflow-hidden">
      {/* Top separator */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(139,92,246,0.10) 0%, transparent 70%)' }}
      />

      <div className="relative max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tighter leading-tight mb-5">
            Your next screenshot
            <br />
            deserves better.
          </h2>
          <p className="text-zinc-400 text-lg mb-8 max-w-md mx-auto leading-relaxed">
            Open the editor, drop in your screenshot, and have a polished result in under a minute.
          </p>
          <motion.button
            onClick={() => navigate('/editor')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="btn-primary px-8 py-3.5 text-base shadow-glow-md"
          >
            Polish a screenshot now
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
          <p className="mt-4 text-xs text-zinc-700">Free · No signup · Works in your browser</p>
        </motion.div>
      </div>
    </section>
  )
}
