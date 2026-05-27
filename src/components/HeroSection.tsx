import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

// ─── Fake Screenshot Mockup ──────────────────────────────────────────────────

function FakeScreenshotContent() {
  return (
    <div className="w-full h-full bg-[#f8f9fa] p-3 flex flex-col gap-2">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-zinc-200 rounded-full" />
        <div className="flex-1" />
        <div className="w-8 h-2 bg-zinc-200 rounded-full" />
        <div className="w-8 h-2 bg-zinc-200 rounded-full" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-1">
        {[['2,841', 'Users'], ['$12.4K', 'Revenue'], ['94%', 'Uptime']].map(([val, lbl]) => (
          <div key={lbl} className="bg-white rounded-lg p-2 border border-zinc-100">
            <div className="text-xs font-bold text-zinc-800">{val}</div>
            <div className="text-[9px] text-zinc-400 mt-0.5">{lbl}</div>
          </div>
        ))}
      </div>
      {/* Chart bars */}
      <div className="flex-1 bg-white rounded-lg border border-zinc-100 p-2 flex flex-col justify-end">
        <div className="flex items-end gap-1 h-14">
          {[40, 65, 45, 80, 60, 90, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%`, background: i === 5 ? '#818cf8' : '#e5e7eb' }}
            />
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <div key={i} className="flex-1 text-center text-[7px] text-zinc-300">{d}</div>
          ))}
        </div>
      </div>
      {/* Table stub */}
      <div className="bg-white rounded-lg border border-zinc-100 p-2">
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-2 py-1 border-b border-zinc-50 last:border-0">
            <div className="w-3 h-3 rounded-full bg-zinc-100" />
            <div className="flex-1 h-2 bg-zinc-100 rounded-full mt-0.5" />
            <div className="w-8 h-2 bg-zinc-50 rounded-full mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Browser Chrome ───────────────────────────────────────────────────────────

function BrowserChrome({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`rounded-xl overflow-hidden border ${dark ? 'border-white/10' : 'border-zinc-200'} shadow-float`}>
      {/* Title bar */}
      <div className={`flex items-center gap-2 px-3 py-2.5 ${dark ? 'bg-[#1c1c1e]' : 'bg-[#ececec]'}`}>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className={`flex-1 mx-4 h-4 rounded-full text-center flex items-center justify-center ${dark ? 'bg-white/5' : 'bg-black/5'}`}>
          <span className={`text-[8px] ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>app.dashboard.io</span>
        </div>
      </div>
      {/* Content */}
      <div className="h-40">
        {children}
      </div>
    </div>
  )
}

// ─── Polished "After" Preview ─────────────────────────────────────────────────

function PolishedPreview() {
  return (
    <div className="relative rounded-2xl overflow-hidden p-5" style={{
      background: '#06080f',
      backgroundImage: 'radial-gradient(ellipse 120% 80% at 50% 30%, rgba(99,102,241,0.40) 0%, rgba(99,102,241,0.08) 50%, transparent 80%)',
    }}>
      {/* Headline */}
      <div className="text-center mb-4">
        <span className="text-white text-xs font-bold tracking-tight">Check out this feature!</span>
      </div>

      {/* Polished browser mockup */}
      <div className="relative">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            boxShadow: '0 24px 60px rgba(0,0,0,0.75), 0 8px 20px rgba(99,102,241,0.15)',
          }}
        >
          <BrowserChrome dark>
            <FakeScreenshotContent />
          </BrowserChrome>
        </div>

        {/* Spotlight overlay */}
        <div className="absolute inset-0 rounded-xl pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 40% at 65% 55%, transparent 30%, rgba(0,0,0,0.55) 100%)',
        }} />

        {/* Callout pill */}
        <div
          className="absolute bottom-6 right-3 px-2 py-1 rounded-full text-[8px] font-bold"
          style={{ background: '#818cf8', color: '#0f172a' }}
        >
          This is where the magic happens
        </div>
      </div>

      {/* Watermark */}
      <div className="text-right mt-2">
        <span className="text-[8px] text-white/20">shotpolish.org</span>
      </div>
    </div>
  )
}

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
            <div className="relative rounded-2xl overflow-hidden border border-[#E5E7EC] shadow-card">
              <BrowserChrome>
                <FakeScreenshotContent />
              </BrowserChrome>
              {/* Dull overlay */}
              <div className="absolute inset-0 bg-zinc-900/10 rounded-2xl pointer-events-none" />
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
            >
              <PolishedPreview />
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
