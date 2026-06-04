import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

// Real before/after screenshots live in public/ and are served at the site root.
// Replace these files to update the hero comparison.
const BEFORE_IMG = '/hero-before.png'
const AFTER_IMG  = '/hero-after.png'

// ─── Dropzone ────────────────────────────────────────────────────────────────

function UploadDropzone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) onFile(file)
  }

  return (
    <div
      className="relative group border border-dashed border-[#DDE0E8] rounded-2xl p-8 text-center cursor-pointer
                 hover:border-accent/40 hover:bg-accent/[0.03] transition-all duration-200"
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center
                        group-hover:bg-accent/20 transition-all duration-200">
          <svg className="w-5 h-5 text-accent" viewBox="0 0 20 20" fill="none">
            <path d="M10 3v10M10 3l-3 3M10 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[#374151]">Drop your screenshot here</p>
          <p className="text-xs text-[#6B7280] mt-1">or click to browse · PNG, JPG, WebP</p>
        </div>
      </div>
    </div>
  )
}

// ─── HeroSection ─────────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  }),
}

export function HeroSection() {
  const navigate = useNavigate()

  const handleFile = () => {
    navigate('/editor')
  }

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-4 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Badge */}
      <motion.div
        custom={0} variants={fadeUp} initial="hidden" animate="visible"
        className="mb-6"
      >
        <span className="section-tag">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-glow-pulse inline-block" />
          Now live — try it free
        </span>
      </motion.div>

      {/* Headline */}
      <motion.h1
        custom={1} variants={fadeUp} initial="hidden" animate="visible"
        className="max-w-3xl text-center text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-[#111827] leading-[1.08]"
      >
        Turn product screenshots into{' '}
        <span className="text-gradient">launch-ready stories.</span>
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        custom={2} variants={fadeUp} initial="hidden" animate="visible"
        className="mt-5 max-w-xl text-center text-base sm:text-lg text-[#374151] leading-relaxed"
      >
        Add spotlight focus, annotations, motion, and story-driven layouts in seconds.
      </motion.p>

      {/* CTAs */}
      <motion.div
        custom={3} variants={fadeUp} initial="hidden" animate="visible"
        className="mt-8 flex flex-col sm:flex-row items-center gap-3"
      >
        <button
          onClick={() => navigate('/story')}
          className="btn-primary px-6 py-3 text-sm gap-2 shadow-glow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Create Launch Story
        </button>
        <button
          onClick={() => navigate('/editor')}
          className="btn-ghost px-6 py-3 text-sm"
        >
          Polish a screenshot
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </motion.div>

      {/* Social proof */}
      <motion.p
        custom={4} variants={fadeUp} initial="hidden" animate="visible"
        className="mt-4 text-xs text-[#6B7280]"
      >
        No account required · Export in 1 click
      </motion.p>

      {/* Before / After comparison */}
      <motion.div
        custom={5} variants={fadeUp} initial="hidden" animate="visible"
        className="mt-16 w-full max-w-4xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Before */}
          <div className="group">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#9CA3AF]" />
              <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider">Before</span>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-[#E5E7EC] shadow-card bg-white">
              <img
                src={BEFORE_IMG}
                alt="Plain dashboard screenshot before ShotPolish"
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
            <p className="mt-2 text-xs text-[#6B7280] text-center">Plain, forgettable</p>
          </div>

          {/* Arrow (desktop) */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 mt-16 items-center justify-center z-10">
            <div className="w-8 h-8 rounded-full border border-[#E5E7EC] bg-white shadow-card flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* After */}
          <div className="group">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-accent animate-glow-pulse" />
              <span className="text-xs text-accent font-medium uppercase tracking-wider">After ShotPolish</span>
            </div>
            <motion.div
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl overflow-hidden shadow-float"
            >
              <img
                src={AFTER_IMG}
                alt="Polished dashboard after ShotPolish"
                className="w-full h-auto block"
                loading="lazy"
              />
            </motion.div>
            <p className="mt-2 text-xs text-[#6B7280] text-center">Polished, shareable, striking</p>
          </div>
        </div>

        {/* Upload nudge */}
        <motion.div
          custom={6} variants={fadeUp} initial="hidden" animate="visible"
          className="mt-8"
        >
          <UploadDropzone onFile={handleFile} />
        </motion.div>
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
      >
        <span className="text-xs text-[#9CA3AF]">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        >
          <svg className="w-4 h-4 text-[#9CA3AF]" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </motion.div>
    </section>
  )
}
