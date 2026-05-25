import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'framer-motion'

// ─── Theme Data ───────────────────────────────────────────────────────────────

const PREVIEW_THEMES = [
  {
    id: 'indigo',
    name: 'Indigo',
    color: '#818cf8',
    bg: '#06080f',
    glow: 'rgba(99,102,241,0.40)',
    glowMid: 'rgba(99,102,241,0.10)',
    label: 'Deep indigo — perfect for dev tools and SaaS',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    color: '#34d399',
    bg: '#030a06',
    glow: 'rgba(16,185,129,0.36)',
    glowMid: 'rgba(16,185,129,0.08)',
    label: 'Fresh green — ideal for growth and finance apps',
  },
  {
    id: 'rose',
    name: 'Rose',
    color: '#fb7185',
    bg: '#0a0306',
    glow: 'rgba(244,63,94,0.36)',
    glowMid: 'rgba(244,63,94,0.08)',
    label: 'Warm rose — great for creative and lifestyle brands',
  },
  {
    id: 'slate',
    name: 'Slate',
    color: '#94a3b8',
    bg: '#060809',
    glow: 'rgba(148,163,184,0.24)',
    glowMid: 'rgba(148,163,184,0.06)',
    label: 'Neutral slate — universal and understated',
  },
  {
    id: 'amber',
    name: 'Amber',
    color: '#fcd34d',
    bg: '#080600',
    glow: 'rgba(251,191,36,0.36)',
    glowMid: 'rgba(251,191,36,0.08)',
    label: 'Golden amber — bold and energetic',
  },
  {
    id: 'sky',
    name: 'Sky',
    color: '#38bdf8',
    bg: '#02080d',
    glow: 'rgba(56,189,248,0.36)',
    glowMid: 'rgba(56,189,248,0.08)',
    label: 'Sky blue — clean and trustworthy',
  },
]

// ─── Fake Screenshot (mini version) ──────────────────────────────────────────

function MiniScreenshot() {
  return (
    <div className="w-full h-full bg-[#f8f9fa] p-2 flex flex-col gap-1.5">
      <div className="flex gap-1">
        <div className="w-12 h-1.5 bg-zinc-200 rounded-full" />
        <div className="flex-1" />
        <div className="w-6 h-1.5 bg-zinc-200 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[['2.8K', 'Users'], ['$12K', 'Rev'], ['94%', 'Up']].map(([v, l]) => (
          <div key={l} className="bg-white rounded p-1 border border-zinc-100">
            <div className="text-[7px] font-bold text-zinc-700">{v}</div>
            <div className="text-[5px] text-zinc-400">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 bg-white rounded border border-zinc-100 p-1.5 flex flex-col justify-end">
        <div className="flex items-end gap-0.5 h-8">
          {[40, 65, 45, 80, 60, 90, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{ height: `${h}%`, background: i === 5 ? '#818cf8' : '#e5e7eb' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Large Preview Card ───────────────────────────────────────────────────────

function PreviewCard({ theme }: { theme: typeof PREVIEW_THEMES[number] }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden p-6"
      style={{
        background: theme.bg,
        backgroundImage: `radial-gradient(ellipse 120% 80% at 50% 25%, ${theme.glow} 0%, ${theme.glowMid} 45%, transparent 80%)`,
        minHeight: 280,
      }}
    >
      {/* Headline */}
      <div className="text-center mb-5">
        <p className="text-white text-sm font-bold tracking-tight drop-shadow-sm">
          Check out this feature!
        </p>
      </div>

      {/* Browser mockup */}
      <div
        className="relative rounded-xl overflow-hidden mx-auto"
        style={{
          maxWidth: 380,
          boxShadow: `0 24px 60px rgba(0,0,0,0.75), 0 4px 16px ${theme.glow.replace('0.40', '0.20')}`,
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-3 py-2"
          style={{ background: 'linear-gradient(180deg, #ececec 0%, #d8d8d8 100%)' }}>
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <div className="flex-1 mx-3 h-3.5 rounded-full bg-black/8 flex items-center justify-center">
            <span className="text-[7px] text-zinc-400">app.dashboard.io</span>
          </div>
        </div>

        {/* Screenshot */}
        <div className="h-32 relative">
          <MiniScreenshot />
          {/* Spotlight dim */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 55% 45% at 62% 55%, transparent 28%, rgba(0,0,0,0.62) 100%)' }}
          />
        </div>
      </div>

      {/* Callout pill */}
      <div className="flex justify-end mt-3 pr-8">
        <div
          className="px-3 py-1 rounded-full text-[10px] font-bold"
          style={{ background: theme.color, color: '#0f172a' }}
        >
          This is where the magic happens
        </div>
      </div>

      {/* Corner accents */}
      <div className="absolute top-4 right-4 opacity-20">
        <div className="w-8 h-8 border-t-2 border-r-2 rounded-tr-sm" style={{ borderColor: theme.color }} />
      </div>

      {/* Watermark */}
      <div className="absolute bottom-3 right-3">
        <span className="text-[9px] text-white/20">shotpolish.com</span>
      </div>
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

export function LivePreviewSection() {
  const [activeTheme, setActiveTheme] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="preview" ref={ref} className="py-24 px-4 relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="section-tag mb-4 inline-flex">Style presets</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Six curated visual styles
          </h2>
          <p className="mt-3 text-zinc-400 max-w-md mx-auto">
            Pick the aesthetic that fits your brand. Switch instantly — no re-uploading required.
          </p>
        </motion.div>

        {/* Theme picker */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {PREVIEW_THEMES.map((theme, i) => (
            <button
              key={theme.id}
              onClick={() => setActiveTheme(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activeTheme === i
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/10'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: theme.color, boxShadow: activeTheme === i ? `0 0 8px ${theme.color}` : 'none' }}
              />
              {theme.name}
            </button>
          ))}
        </motion.div>

        {/* Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTheme}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <PreviewCard theme={PREVIEW_THEMES[activeTheme]} />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Theme label */}
        <motion.p
          key={activeTheme}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-center text-sm text-zinc-500"
        >
          {PREVIEW_THEMES[activeTheme].label}
        </motion.p>

        {/* Thumbnail strip */}
        <div className="mt-8 grid grid-cols-6 gap-2">
          {PREVIEW_THEMES.map((theme, i) => (
            <button
              key={theme.id}
              onClick={() => setActiveTheme(i)}
              className={`relative h-16 rounded-xl overflow-hidden transition-all duration-200 ${
                activeTheme === i ? 'ring-2 ring-offset-2 ring-offset-[#09090b]' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                background: theme.bg,
                backgroundImage: `radial-gradient(ellipse 100% 80% at 50% 0%, ${theme.glow} 0%, transparent 100%)`,
              }}
            >
              {activeTheme === i && (
                <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: theme.color }} />
              )}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                style={{ background: theme.color }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
