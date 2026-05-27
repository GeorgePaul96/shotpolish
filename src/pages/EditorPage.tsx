import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCompositionCanvas } from '../hooks/useCompositionCanvas'
import {
  THEMES,
  computeLayout,
  type Selection,
  type CompositionDocument,
  type FrameType,
} from '../lib/composition'
import { FORMAT_BAR, SOCIAL_FORMATS } from '../lib/socialFormats'
import { TEMPLATES, TEMPLATE_CATEGORIES, Template } from '../lib/templates'
import { AI_SUGGESTIONS } from '../lib/aiSuggestions'
import { Events, track } from '../lib/analytics'
import { loadBridgeFromStory, saveReturnToStory, type BridgeSlideData } from '../lib/compositionBridge'
import { getSupportedVideoMimeType, exportMotionGIF as libExportMotionGIF, type ExportProgress } from '../lib/motionExport'

function suggestFrameType(w: number, h: number): FrameType | null {
  if (w === 0 || h === 0) return null
  const ratio = w / h
  if (ratio < 0.65) return 'iphone'    // tall portrait — phone
  if (ratio < 0.85) return 'android'   // portrait-ish — android
  if (ratio < 1.15) return 'ipad'      // near-square — tablet
  return 'browser'                      // landscape — browser
}

export const INTENT_MAP: Record<string, string> = {
  'Explain Feature':       'Check out this feature!',
  'Launch Product':        'We are officially live!',
  'Share Update':          "Here's what's new",
  'Highlight Improvement': 'We made it even better.',
  'Show Bug Fix':          'Fixed a frustrating bug.',
  'Promote Benefit':       'Save time with this.',
}

export const CALLOUT_MAP: Record<string, string> = {
  'Explain Feature':       'This is where the magic happens',
  'Launch Product':        'Now available',
  'Share Update':          'Just shipped',
  'Highlight Improvement': 'Faster than before',
  'Show Bug Fix':          'Issue resolved',
  'Promote Benefit':       'Saves hours of work',
}

// ─── Small reusable UI pieces ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] mb-2">
      {children}
    </div>
  )
}

function Slider({
  label, value, min, max, step = 1, onChange, format,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-[#6B7280]">{label}</span>
        <span className="text-[11px] font-mono text-[#9CA3AF] tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

function SuggestionChips({
  suggestions, onSelect, current,
}: {
  suggestions: string[]; onSelect: (s: string) => void; current: string
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {suggestions.map(s => (
        <button
          key={s} onClick={() => onSelect(s)}
          className={`px-2 py-0.5 rounded-full text-[10px] border transition-all duration-150 text-left leading-snug ${
            s === current
              ? 'bg-accent/10 border-accent/25 text-accent'
              : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#374151] hover:border-[#C5CAD8] hover:bg-gray-50'
          }`}
        >{s}</button>
      ))}
    </div>
  )
}

// ─── Caption Card ──────────────────────────────────────────────────────────────

function CaptionCard({ caption, accentColor }: { caption: { type: string; text: string }; accentColor: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(caption.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    track('caption_copied', { type: caption.type })
  }

  return (
    <div className="p-4 rounded-xl border border-[#E5E7EC] bg-white hover:bg-gray-50 transition-colors relative group shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: accentColor }}>
          {caption.type}
        </span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all duration-150 ${
            copied
              ? 'border-emerald-500/30 bg-emerald-50 text-emerald-600'
              : 'border-[#DDE0E8] bg-white text-[#6B7280] hover:text-[#374151] hover:bg-gray-50 active:scale-95'
          }`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-[#4B5563] leading-relaxed whitespace-pre-wrap select-text">
        {caption.text}
      </p>
    </div>
  )
}

// ─── Template Gallery Modal ───────────────────────────────────────────────────

function TemplateGallery({
  onApply, onClose, activeId,
}: {
  onApply: (t: Template) => void; onClose: () => void; activeId?: string
}) {
  const [activeCat, setActiveCat] = useState<string>(TEMPLATE_CATEGORIES[0])
  const filtered = useMemo(() => TEMPLATES.filter(t => t.category === activeCat), [activeCat])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.2 }}
        className="bg-white border border-[#E5E7EC] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-elevated"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#E5E7EC]">
          <div>
            <h2 className="text-sm font-semibold text-[#111827]">Templates</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Apply a preset and start polishing immediately.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:text-[#374151] hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="px-5 pt-3 pb-2 flex gap-1 overflow-x-auto scrollbar-none border-b border-[#E5E7EC]">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                activeCat === cat
                  ? 'bg-accent/10 text-accent border border-accent/25'
                  : 'text-[#6B7280] hover:text-[#374151] border border-transparent hover:border-[#DDE0E8] hover:bg-gray-50'
              }`}
            >{cat}</button>
          ))}
        </div>
        <div className="overflow-y-auto p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 scrollbar-none">
          {filtered.map(t => (
            <motion.button key={t.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { onApply(t); onClose() }}
              className={`text-left rounded-xl overflow-hidden border transition-all duration-200 ${
                activeId === t.id ? 'border-accent/40 ring-2 ring-accent/10' : 'border-[#E5E7EC] hover:border-[#C5CAD8] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
              }`}
            >
              <div className="h-16 relative flex items-center justify-center overflow-hidden"
                style={{ background: THEMES[t.themeIndex]?.bg ?? '#06080f', backgroundImage: `radial-gradient(ellipse 110% 90% at 50% 20%, ${THEMES[t.themeIndex]?.glow ?? ''} 0%, transparent 80%)` }}>
                <div className="w-28 rounded-lg overflow-hidden border border-white/10" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                  <div className="flex items-center gap-0.5 px-1.5 py-1" style={{ background: 'linear-gradient(180deg, #f0f0f0 0%, #d5d5d5 100%)' }}>
                    {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />)}
                    <div className="flex-1 mx-1 h-1.5 rounded-full bg-black/[0.08]" />
                  </div>
                  <div className="h-6 bg-white/90 flex items-center px-1.5">
                    <div className="flex gap-0.5 w-full">
                      <div className="flex-1 h-1 bg-zinc-100 rounded-full" />
                      <div className="w-4 h-1 bg-zinc-200 rounded-full" />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full" style={{ background: t.accent ?? '#7C3AED', boxShadow: `0 0 6px ${t.accent ?? '#7C3AED'}80` }} />
              </div>
              <div className="px-3 py-2.5 bg-gray-50">
                <p className="text-xs font-semibold text-[#111827]">{t.name}</p>
                <p className="text-[10px] text-[#6B7280] mt-0.5 leading-snug">{t.description}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

function ExportMenu({
  canExport, exportImage, currentFormatId, theme, intent, onExported, onClose,
  isMotionEnabled, exportMotionVideo, isRecording, recordingProgress,
  exportMotionGIF, isExportingGIF, gifProgress,
}: {
  canExport:      boolean
  exportImage:    (formatId?: string) => Promise<string | null>
  currentFormatId: string
  theme:          typeof THEMES[number]
  intent:         string
  onExported:     (formats: string[]) => void
  onClose:        () => void
  isMotionEnabled: boolean
  exportMotionVideo: () => Promise<void>
  isRecording: boolean
  recordingProgress: number
  exportMotionGIF: () => Promise<void>
  isExportingGIF: boolean
  gifProgress: number
}) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [selected, setSelected]   = useState<Set<string>>(
    new Set(['twitter-post', 'instagram-post', 'linkedin-post', 'product-hunt'])
  )
  const { format: detectedFormat } = getSupportedVideoMimeType()

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const download = (dataUrl: string, filename: string) => {
    const a = document.createElement('a')
    a.href = dataUrl; a.download = filename; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const handleExportCurrent = async () => {
    if (!canExport || exporting || isRecording || isExportingGIF) return
    if (isMotionEnabled) {
      setExporting('motion')
      track('motion_export_started')
      await exportMotionVideo()
      setExporting(null)
      onExported(['Reveal Video']); onClose()
      return
    }
    setExporting('current')
    track('export_completed')
    Events.exportCompleted(intent, theme.name)
    const result = await exportImage()
    const fmtLabel = currentFormatId !== 'free' ? (SOCIAL_FORMATS[currentFormatId]?.platform ?? currentFormatId) : 'PNG'
    if (result) download(result, `shotpolish-${intent.replace(/\s+/g,'-').toLowerCase()}.png`)
    setExporting(null)
    onExported([fmtLabel]); onClose()
  }

  const handleExportAll = async () => {
    if (!selected.size || exporting || isRecording) return
    setExporting('all')
    for (const formatId of selected) {
      const fmt = SOCIAL_FORMATS[formatId]
      if (!fmt) continue
      const result = await exportImage(formatId)
      if (result) download(result, `shotpolish-${fmt.platform.replace(/[^a-z0-9]/gi,'-').toLowerCase()}.png`)
      await new Promise(r => setTimeout(r, 350))
    }
    const fmtNames = Array.from(selected).map(id => SOCIAL_FORMATS[id]?.platform ?? id)
    setExporting(null)
    onExported(fmtNames); onClose()
  }

  const exportFormats = FORMAT_BAR.filter(f => f.id !== 'free')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.15 }}
      className="absolute right-0 top-full mt-1.5 z-[100] w-64 bg-white border border-[#E5E7EC] rounded-xl shadow-elevated overflow-hidden"
    >
      <div className="p-2 border-b border-[#E5E7EC] space-y-1">
        <button onClick={handleExportCurrent} disabled={!canExport || !!exporting || isRecording || isExportingGIF}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
            canExport && !exporting && !isRecording && !isExportingGIF ? 'text-white hover:opacity-90 active:scale-98' : 'opacity-30 cursor-not-allowed'
          }`}
          style={canExport ? { background: theme.accent } : { background: '#27272a' }}
        >
          {isRecording ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Recording {recordingProgress}%
            </>
          ) : exporting === 'motion' ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Initializing...
            </>
          ) : exporting === 'current' ? (
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : isMotionEnabled ? (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                <path d="M3.5 2.5v9l7-4.5-7-4.5z" fill="currentColor"/>
              </svg>
              Export Reveal Video (.{detectedFormat})
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v7M7 9l-2.5-2.5M7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M2 11.5A1.5 1.5 0 003.5 13h7a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Export current format
            </>
          )}
        </button>
        {isMotionEnabled && (
          <button
            onClick={() => { exportMotionGIF(); onClose() }}
            disabled={isExportingGIF || isRecording || !canExport}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 ${
              !isExportingGIF && !isRecording && canExport
                ? 'border-[#DDE0E8] text-[#374151] hover:bg-gray-50 hover:text-[#111827]'
                : 'border-[#E5E7EC] text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            {isExportingGIF ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Encoding GIF {gifProgress}%
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
                  <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="currentColor" opacity="0.7"/>
                  <path d="M1.5 9l3-2.5 2.5 2 2-1.5L13 10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                Export as GIF (universal)
              </>
            )}
          </button>
        )}
      </div>
      {isMotionEnabled && (
        <div className="px-3 pb-2 pt-1">
          {detectedFormat === 'mp4'
            ? <p className="text-[9px] text-[#6B7280] leading-snug">MP4 — native playback on X, LinkedIn, Instagram &amp; Product Hunt.</p>
            : <p className="text-[9px] text-[#6B7280] leading-snug">WebM plays in Chrome &amp; Firefox. Convert to MP4 before uploading to most social platforms.</p>
          }
        </div>
      )}
      <div className="p-2">
        <p className="text-[10px] text-[#6B7280] px-1 mb-1.5">Export all selected formats</p>
        <div className="space-y-0.5 max-h-44 overflow-y-auto scrollbar-none">
          {exportFormats.map(f => {
            const fmt = SOCIAL_FORMATS[f.id]
            return (
              <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="w-3 h-3 rounded accent-violet-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#374151] leading-none">{f.label}</p>
                  <p className="text-[9px] text-[#9CA3AF] mt-0.5">{fmt?.description}</p>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fmt?.color ?? '#9CA3AF' }} />
              </label>
            )
          })}
        </div>
        <button onClick={handleExportAll} disabled={!selected.size || !!exporting}
          className="mt-2 w-full py-2 rounded-lg text-xs font-semibold border border-[#DDE0E8] text-[#374151] hover:bg-gray-50 hover:text-[#111827] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {exporting === 'all' ? (
            <><div className="w-3 h-3 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />Exporting {selected.size} formats…</>
          ) : (
            <>Export {selected.size} format{selected.size !== 1 ? 's' : ''}
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Feedback modal ───────────────────────────────────────────────────────────

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState('')
  const [willing, setWilling] = useState('')
  const [improve, setImprove] = useState('')
  const [status, setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle')

  const submit = async () => {
    if (!result) return
    setStatus('submitting')
    track('feedback_submitted')
    try {
      const res = await fetch('https://formspree.io/f/xvzyowzb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _type:'feedback', 'Did it work?':result, 'Would you pay?':willing, 'What would improve it?':improve }),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch { setStatus('error') }
  }

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:justify-start p-4 sm:p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:12 }} transition={{ duration:0.18 }}
        className="w-full max-w-sm bg-white border border-[#E5E7EC] rounded-2xl p-5 shadow-elevated"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-[#111827]">Quick feedback</span>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1 -mr-1">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        {status === 'success' ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🙏</div>
            <p className="text-sm text-[#6B7280]">Genuinely read by the founder. Thank you.</p>
            <button onClick={onClose} className="mt-4 btn-primary text-xs px-5 py-2">Close</button>
          </div>
        ) : status === 'error' ? (
          <div className="text-center py-4">
            <p className="text-sm text-[#6B7280]">Something went wrong. Please try again.</p>
            <button onClick={() => setStatus('idle')} className="mt-4 btn-primary text-xs px-5 py-2">Retry</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Did you get the result you wanted? *</label>
              <div className="flex gap-2 flex-wrap">
                {['Yes ✓','Almost','No'].map(opt => (
                  <button key={opt} onClick={() => setResult(opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 ${result === opt ? 'bg-accent text-white border-accent font-semibold' : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#374151] hover:bg-gray-50'}`}
                  >{opt}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Would you pay for Pro?</label>
              <div className="flex gap-2 flex-wrap">
                {['Yes','Maybe','No'].map(opt => (
                  <button key={opt} onClick={() => setWilling(opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 ${willing === opt ? 'bg-accent text-white border-accent font-semibold' : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#374151] hover:bg-gray-50'}`}
                  >{opt}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">What would make it better? <span className="normal-case font-normal text-[#9CA3AF]">(optional)</span></label>
              <textarea value={improve} onChange={e => setImprove(e.target.value)} placeholder="Any idea or complaint…" rows={3} className="input-field resize-none text-xs leading-relaxed" />
            </div>
            <button onClick={submit} disabled={!result || status === 'submitting'}
              className={`w-full btn-primary justify-center text-xs py-2.5 ${(!result || status === 'submitting') ? 'opacity-35 cursor-not-allowed' : ''}`}>
              {status === 'submitting' ? 'Sending…' : 'Send feedback →'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Waitlist banner ──────────────────────────────────────────────────────────

function ExportSuccessBanner({
  accentColor, exportedFormats, onDismiss,
}: {
  accentColor: string; exportedFormats: string[]; onDismiss: () => void
}) {
  const [email,    setEmail]    = useState('')
  const [sent,     setSent]     = useState(false)
  const [showJoin, setShowJoin] = useState(false)

  const submit = () => {
    if (!email.includes('@')) return
    Events.pricingInterestShown()
    fetch('https://formspree.io/f/mnjrqgpw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, source: 'post-export-banner' }),
    }).finally(() => setSent(true))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }} transition={{ duration: 0.22 }}
      className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-3rem)] max-w-md bg-white border border-[#E5E7EC] rounded-2xl shadow-elevated overflow-hidden"
    >
      <button onClick={onDismiss} className="absolute top-3 right-3 text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-1 z-10">
        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>

      {/* Success summary */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${accentColor}20` }}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: accentColor }}>
              <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">Export complete</p>
            {exportedFormats.length > 0 && (
              <p className="text-[10px] text-[#6B7280] mt-0.5">
                {exportedFormats.join(' · ')}
              </p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[#6B7280] leading-relaxed">
          Your image is ready to post. Paste it directly — no further editing needed.
        </p>
      </div>

      {/* Waitlist offer — secondary, opt-in */}
      <div className="border-t border-[#E5E7EC] px-4 py-3">
        {sent ? (
          <p className="text-[11px] text-[#6B7280]">You're on the list — we'll email when Pro launches.</p>
        ) : showJoin ? (
          <div className="flex gap-2">
            <input
              type="email" placeholder="your@email.com" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
              className="input-field flex-1 text-xs py-1.5"
            />
            <button onClick={submit} className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-opacity hover:opacity-90"
              style={{ background: accentColor, color: '#0f172a' }}>Join →</button>
          </div>
        ) : (
          <button onClick={() => setShowJoin(true)} className="text-[11px] text-[#6B7280] hover:text-[#374151] transition-colors">
            Want watermark-free exports? Join the Pro waitlist →
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Editor dropzone ──────────────────────────────────────────────────────────

function EditorDropzone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) onFile(file)
  }

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 min-h-[260px] select-none ${dragging ? 'border-accent/60 bg-accent/[0.05]' : 'border-[#DDE0E8] hover:border-[#C5CAD8] hover:bg-gray-50'}`}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
    >
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <motion.div animate={dragging ? { scale:1.06 } : { scale:1 }} transition={{ duration:0.15 }}
        className="flex flex-col items-center gap-3 text-center max-w-xs px-6"
      >
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-200 ${dragging ? 'bg-accent/20 border-accent/30' : 'bg-gray-50 border-[#E5E7EC]'}`}>
          <svg className={`w-6 h-6 ${dragging ? 'text-accent' : 'text-[#9CA3AF]'}`} viewBox="0 0 24 24" fill="none">
            <path d="M12 4v12M12 4L9 7M12 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[#374151]">{dragging ? 'Drop it!' : 'Drop your screenshot here'}</p>
          <p className="text-xs text-[#6B7280] mt-1">or click to browse · PNG, JPG, WebP, GIF</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {['Product UI','Code','Analytics','Design','App'].map(t => (
            <span key={t} className="text-[10px] text-[#6B7280] border border-[#E5E7EC] px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main EditorPage ──────────────────────────────────────────────────────────

const ASPECT_PRESETS = [
  { label: 'Free',     id: 'free'            },
  { label: '1:1',      id: 'instagram-post'  },
  { label: '16:9',     id: 'twitter-post'    },
  { label: '4:3',      id: 'reddit-post'     },
  { label: 'Portrait', id: 'instagram-story' },
] as const

export function EditorPage() {
  // ── Image state ──────────────────────────────────────────────────────────────
  const [imageUrl,  setImageUrl]  = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragBox,   setDragBox]   = useState<{ x:number; y:number; w:number; h:number } | null>(null)

  // ── Style state ──────────────────────────────────────────────────────────────
  const [themeIndex,    setThemeIndex]    = useState(0)
  const [padding,       setPadding]       = useState(100)
  const [shadowOpacity, setShadowOpacity] = useState(0.85)
  const [aspectRatio,   setAspectRatio]   = useState('free')
  const [frameType,     setFrameType]     = useState<FrameType>('browser')

  // ── Content state ────────────────────────────────────────────────────────────
  const [intent,   setIntent]   = useState('Explain Feature')
  const [headline, setHeadline] = useState(INTENT_MAP['Explain Feature'])
  const [callout,  setCallout]  = useState(CALLOUT_MAP['Explain Feature'])

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showTemplates,      setShowTemplates]      = useState(false)
  const [showFeedback,       setShowFeedback]        = useState(false)
  const [showExportSuccess,  setShowExportSuccess]   = useState(false)
  const [exportedFormats,    setExportedFormats]     = useState<string[]>([])
  const [hasExported,        setHasExported]         = useState(false)
  const [exportOpen,         setExportOpen]          = useState(false)
  const [leftOpen,      setLeftOpen]        = useState(true)
  const [rightOpen,     setRightOpen]       = useState(true)
  const [activeTemplate, setActiveTemplate] = useState<string | undefined>()

  // ── Bridge mode (arriving from Story editor) ─────────────────────────────────
  const [bridgeMode, setBridgeMode] = useState(false)
  const [bridgeSlideId, setBridgeSlideId] = useState('')
  const [bridgeSlideIndex, setBridgeSlideIndex] = useState(0)

  // ── Cinematic Motion states ──────────────────────────────────────────────────
  const [isMotionEnabled, setIsMotionEnabled] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [motionProgress, setMotionProgress] = useState(1.0)
  const [isExportingGIF, setIsExportingGIF] = useState(false)
  const [gifProgress, setGifProgress] = useState(0)

  // ── Product context & Caption states ─────────────────────────────────────────
  const [productContext,        setProductContext]        = useState('')
  const [showCaptionGenerator,  setShowCaptionGenerator]  = useState(false)
  const [isGeneratingCaptions,  setIsGeneratingCaptions]  = useState(false)
  const [generatedCaptions,     setGeneratedCaptions]     = useState<{ type: string; text: string }[]>([])

  const navigate = useNavigate()
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const exportRef     = useRef<HTMLDivElement>(null)

  // ── Viewport Sizing & Transformations ─────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  // Load natural dimensions when imageUrl changes
  useEffect(() => {
    if (!imageUrl) {
      setImageDimensions(null)
      return
    }
    const img = new Image()
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Bridge mode — restore slide state when arriving from Story editor
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') !== 'bridge') return
    const bridge = loadBridgeFromStory()
    if (!bridge) return

    setBridgeMode(true)
    setBridgeSlideId(bridge.sourceSlide.slideId)
    setBridgeSlideIndex(bridge.sourceSlide.slideIndex)
    setImageUrl(bridge.sourceSlide.imageDataUrl)
    setHeadline(bridge.sourceSlide.title)
    setCallout(bridge.sourceSlide.callout)
    setSelection(bridge.sourceSlide.selection)
    window.history.replaceState({}, '', '/editor')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track viewport container dimensions reactively
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [imageUrl]) // re-run when image gets uploaded and viewport renders

  // ── Composition document ──────────────────────────────────────────────────────
  const compositionDoc = useMemo<CompositionDocument>(() => {
    return {
      id: 'doc-1',
      formatId: aspectRatio,
      themeIndex,
      padding,
      shadowOpacity,
      frameType,
      headline: {
        text: headline,
        visible: !!headline
      },
      screenshot: {
        imageUrl,
        naturalWidth: imageDimensions?.width ?? 0,
        naturalHeight: imageDimensions?.height ?? 0,
        visible: !!imageUrl,
        selection: selection,
        callout: {
          text: callout,
          visible: !!callout
        }
      }
    }
  }, [imageUrl, imageDimensions, themeIndex, padding, shadowOpacity, aspectRatio, headline, selection, callout])

  // Central computed layout match
  const L = useMemo(() => {
    if (!imageDimensions) return null
    return computeLayout(
      imageDimensions.width,
      imageDimensions.height,
      padding,
      headline,
      aspectRatio,
      frameType,
    )
  }, [imageDimensions, padding, headline, aspectRatio, frameType])

  const fitScale = useMemo(() => {
    if (!L || viewportSize.width === 0 || viewportSize.height === 0) return 1
    // Keep a safe 48px padding (96px total gap) around composition
    const scaleX = (viewportSize.width - 96) / L.compW
    const scaleY = (viewportSize.height - 96) / L.compH
    return Math.min(scaleX, scaleY)
  }, [L, viewportSize])

  const { isRendering, exportImage } = useCompositionCanvas(compositionDoc, canvasRef, motionProgress)
  const theme = THEMES[themeIndex] ?? THEMES[0]

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(file))
    setSelection(null)
    Events.screenshotUploaded()
  }, [imageUrl])

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  // ── Close export dropdown on outside click ───────────────────────────────────
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // ── Bridge: save updated slide and return to Story ────────────────────────────
  const handleSaveAndReturn = () => {
    const bridge = loadBridgeFromStory()
    if (!bridge) { navigate('/story'); return }

    const updated: BridgeSlideData = {
      slideIndex: bridgeSlideIndex,
      slideId: bridgeSlideId,
      role: bridge.sourceSlide.role,
      roleLabel: bridge.sourceSlide.roleLabel,
      title: headline,
      callout,
      selection,
      imageDataUrl: bridge.sourceSlide.imageDataUrl,
    }
    saveReturnToStory(updated)
    navigate('/story?bridge=updated')
  }

  // ── Intent sync ──────────────────────────────────────────────────────────────
  const handleIntentChange = (v: string) => {
    setIntent(v); setHeadline(INTENT_MAP[v] ?? ''); setCallout(CALLOUT_MAP[v] ?? '')
    Events.intentChanged(v)
  }

  // ── Template apply ───────────────────────────────────────────────────────────
  const applyTemplate = (t: Template) => {
    setThemeIndex(t.themeIndex); setPadding(t.padding); setShadowOpacity(t.shadowOpacity)
    setAspectRatio(t.aspectRatio); setIntent(t.intent); setHeadline(t.headline); setCallout(t.callout)
    setFrameType('browser')
    setActiveTemplate(t.id); track('template_applied')
  }

  // ── Direct Interactive Composition Drawing ────────────────────────────────────
  const startDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!L) return
    const rect = e.currentTarget.getBoundingClientRect()
    setIsDrawing(true)
    setDragBox({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: 0,
      h: 0
    })
  }

  const drawMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragBox) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragBox({
      ...dragBox,
      w: e.clientX - rect.left - dragBox.x,
      h: e.clientY - rect.top - dragBox.y
    })
  }

  const endDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragBox || !L) return
    setIsDrawing(false)
    const rect = e.currentTarget.getBoundingClientRect()
    
    // Convert dragBox from CSS pixels to composition units
    const scale = rect.width / L.compW
    
    const compX = (dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w) / scale
    const compY = (dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h) / scale
    const compW = Math.abs(dragBox.w) / scale
    const compH = Math.abs(dragBox.h) / scale

    // Now map composition units to normalized [0, 1] relative to the screenshot bounds
    const normX = (compX - L.screenshot.x) / L.screenshot.w
    const normY = (compY - L.screenshot.y) / L.screenshot.h
    const normW = compW / L.screenshot.w
    const normH = compH / L.screenshot.h

    // Set selection only if it has a valid width and height and intersects with the screenshot
    if (normW > 0.02 && normH > 0.02) {
      setSelection({
        x: Math.max(0, Math.min(1, normX)),
        y: Math.max(0, Math.min(1, normY)),
        w: Math.max(0, Math.min(1 - normX, normW)),
        h: Math.max(0, Math.min(1 - normY, normH)),
      })
      Events.focusBoxDrawn()
    }
    setDragBox(null)
  }

  // ── Cinematic Motion Playback Loop ──────────────────────────────────────────
  useEffect(() => {
    if (!isMotionEnabled || isRecording) {
      setMotionProgress(1.0)
      return
    }

    let start = performance.now()
    const duration = 4000 // 4 seconds reveal sequence loop
    let active = true

    const tick = (now: number) => {
      if (!active) return
      const elapsed = now - start
      const p = (elapsed % duration) / duration
      setMotionProgress(p)
      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
    return () => {
      active = false
    }
  }, [isMotionEnabled, isRecording])

  // ── Video Recording Engine (H.264/MP4 preferred, WebM fallback) ─────────────
  const exportMotionVideo = async () => {
    if (!canvasRef.current || isRecording) return
    setIsRecording(true)
    setRecordingProgress(0)
    setMotionProgress(0)

    const canvas = canvasRef.current
    const stream = canvas.captureStream(30)

    const { mimeType, format } = getSupportedVideoMimeType()
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType })

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

    recorder.onstop = () => {
      const ext = format === 'mp4' ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `shotpolish-reveal-${intent.replace(/\s+/g,'-').toLowerCase()}.${ext}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setIsRecording(false)
      setRecordingProgress(0)
      setMotionProgress(1.0)
    }

    recorder.start()

    const totalFrames = 120
    const fps = 30
    const interval = 1000 / fps
    let frame = 0

    const renderNextFrame = () => {
      if (frame >= totalFrames) { recorder.stop(); return }
      const progress = frame / totalFrames
      setMotionProgress(progress)
      setRecordingProgress(Math.round(progress * 100))
      frame++
      setTimeout(renderNextFrame, interval)
    }

    setTimeout(renderNextFrame, 200)
  }

  // ── GIF Export ───────────────────────────────────────────────────────────────
  const exportMotionGIFAction = async () => {
    if (isExportingGIF || isRecording || !imageDimensions) return
    setIsExportingGIF(true)
    setGifProgress(0)

    const L = computeLayout(
      imageDimensions.width, imageDimensions.height,
      padding, headline, aspectRatio, frameType,
    )
    const scale = Math.min(1, 800 / L.compW)
    const gifW = Math.round(L.compW * scale)
    const gifH = Math.round(L.compH * scale)

    try {
      const result = await libExportMotionGIF(
        (progress) => exportImage(undefined, progress),
        60, gifW, gifH, 15,
        (p: ExportProgress) => setGifProgress(p.percent),
      )
      const a = document.createElement('a')
      a.href = result.url
      a.download = `shotpolish-reveal-${intent.replace(/\s+/g,'-').toLowerCase()}.gif`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(result.url)
    } finally {
      setIsExportingGIF(false)
      setGifProgress(0)
    }
  }

  // ── Caption Starters Generator ───────────────────────────────────────────────
  const generateAICaptions = () => {
    setIsGeneratingCaptions(true)
    setShowCaptionGenerator(true)

    setTimeout(() => {
      const cleanHeadline = headline ? headline.trim() : 'our product'
      const cleanCallout  = callout  ? callout.trim().toLowerCase()  : 'makes work easier'
      const product       = productContext.trim() || cleanHeadline
      const intentSugs    = AI_SUGGESTIONS[intent] ?? AI_SUGGESTIONS['Explain Feature']
      const snapCaption   = intentSugs.captions[0] ?? ''

      const results = [
        {
          type: 'X / Twitter',
          text: `${cleanHeadline}\n\n${snapCaption}\n\n${cleanCallout.charAt(0).toUpperCase() + cleanCallout.slice(1)}. ↓`,
        },
        {
          type: 'LinkedIn',
          text: `We just shipped something for ${product}.\n\n"${cleanHeadline}"\n\nThe core idea: ${cleanCallout}.\n\nIf you're building in public, this is worth 30 seconds of your time.`,
        },
        {
          type: 'Product Hunt',
          text: `Hi PH! We built ${product}.\n\n${cleanHeadline} — ${cleanCallout}.\n\nWe'd love your feedback and support. Ask us anything below! 👇`,
        },
        {
          type: 'Build in Public',
          text: `Shipped: "${cleanHeadline}"\n\n${cleanCallout.charAt(0).toUpperCase() + cleanCallout.slice(1)}.\n\nBuilt this because I kept running into the same friction. Curious what you all think.`,
        },
      ]
      setGeneratedCaptions(results)
      setIsGeneratingCaptions(false)
    }, 600)
  }

  const suggestions = AI_SUGGESTIONS[intent] ?? AI_SUGGESTIONS['Explain Feature']

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#F5F6F8] text-[#111827] overflow-hidden select-none">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-[#E5E7EC] bg-[#F5F6F8]/95 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2.5">
          <Link to="/" className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] transition-colors text-xs group">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Home
          </Link>
          <span className="text-[#9CA3AF]">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-[#111827]"><span className="text-accent">Shot</span>Polish</span>
            <span className="text-[9px] text-[#9CA3AF] border border-[#E5E7EC] px-1.5 py-0.5 rounded-full">Visual Engine</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[11px]">
          {aspectRatio !== 'free' && SOCIAL_FORMATS[aspectRatio] && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-[#E5E7EC]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: SOCIAL_FORMATS[aspectRatio]?.color ?? '#9CA3AF' }} />
              <span className="text-[#6B7280]">{SOCIAL_FORMATS[aspectRatio]?.platform}</span>
              <span className="text-[#D1D5DB]">·</span>
              <span className="text-[#9CA3AF]">{SOCIAL_FORMATS[aspectRatio]?.description}</span>
            </div>
          )}
          <AnimatePresence>
            {isRendering && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                className="flex items-center gap-1.5 text-[#9CA3AF]">
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
                Rendering…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1.5">
          {bridgeMode && (
            <button onClick={handleSaveAndReturn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#DDE0E8] text-[#374151] hover:text-[#111827] hover:border-[#C5CAD8] hover:bg-gray-50 transition-all duration-150">
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M5 7h7M5 7L8 4M5 7l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Save &amp; Return to Story
            </button>
          )}
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDE0E8] text-[#6B7280] hover:text-[#111827] hover:border-[#C5CAD8] hover:bg-gray-50 transition-all duration-150">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Templates
          </button>

          {imageUrl && (
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg text-xs text-[#6B7280] hover:text-[#374151] hover:bg-gray-50 border border-transparent hover:border-[#E5E7EC] transition-all duration-150">
              Replace
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          <div ref={exportRef} className="relative">
            <button onClick={() => setExportOpen(v => !v)} disabled={!imageUrl}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                imageUrl ? 'hover:opacity-90 active:scale-95 text-white' : 'opacity-30 cursor-not-allowed bg-gray-100 text-[#9CA3AF]'
              }`}
              style={imageUrl ? { background: theme.accent } : {}}
            >
              Export
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <AnimatePresence>
              {exportOpen && (
                <ExportMenu
                  canExport={!!imageUrl}
                  exportImage={exportImage}
                  currentFormatId={aspectRatio}
                  theme={theme}
                  intent={intent}
                  onExported={(formats: string[]) => { if (!hasExported) { setHasExported(true); setExportedFormats(formats); setShowExportSuccess(true) } }}
                  onClose={() => setExportOpen(false)}
                  isMotionEnabled={isMotionEnabled}
                  exportMotionVideo={exportMotionVideo}
                  isRecording={isRecording}
                  recordingProgress={recordingProgress}
                  exportMotionGIF={exportMotionGIFAction}
                  isExportingGIF={isExportingGIF}
                  gifProgress={gifProgress}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Workspace ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
        <motion.aside
          animate={{ width: leftOpen ? 216 : 44 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-shrink-0 border-r border-[#E5E7EC] bg-[#F0F2F5] overflow-hidden relative z-10"
        >
          <button onClick={() => setLeftOpen(v => !v)}
            className="absolute top-2.5 right-2.5 z-10 w-6 h-6 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-[#6B7280] hover:bg-gray-200 transition-all">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <path d={leftOpen ? "M9 7H5M7 5l-2 2 2 2" : "M5 7h4M7 5l2 2-2 2"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <AnimatePresence>
            {leftOpen && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.13 }}
                className="p-3 pt-11 space-y-5 overflow-y-auto h-full scrollbar-none">
                {/* Theme */}
                <div>
                  <SectionLabel>Theme</SectionLabel>
                  <div className="grid grid-cols-3 gap-1.5">
                    {THEMES.map((t, i) => (
                      <button key={t.name} onClick={() => { setThemeIndex(i); setActiveTemplate(undefined) }} title={t.name}
                        className={`relative h-10 rounded-xl overflow-hidden border transition-all duration-150 ${i === themeIndex ? 'border-accent/30 ring-1 ring-accent/20' : 'border-[#E5E7EC] hover:border-[#C5CAD8]'}`}
                        style={{ background: t.bg, backgroundImage: `radial-gradient(ellipse 100% 100% at 50% -10%, ${t.glow} 0%, transparent 100%)` }}>
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full shadow-sm" style={{ background: t.accent, boxShadow: `0 0 6px ${t.glow}` }} />
                        {i === themeIndex && <svg className="absolute top-1 right-1 w-2.5 h-2.5 text-white/50" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 text-center"><span className="text-[10px] font-medium" style={{ color: theme.accent }}>{theme.name}</span></div>
                </div>
                {/* Layout */}
                <div>
                  <SectionLabel>Layout</SectionLabel>
                  <div className="space-y-3">
                    <Slider label="Padding" min={40} max={200} step={4} value={padding}
                      onChange={v => { setPadding(v); setActiveTemplate(undefined) }} format={v => `${v}px`} />
                    <Slider label="Shadow depth" min={0} max={1} step={0.05} value={shadowOpacity}
                      onChange={v => { setShadowOpacity(v); setActiveTemplate(undefined) }} format={v => `${Math.round(v*100)}%`} />
                  </div>
                </div>
                {/* Format presets */}
                <div>
                  <SectionLabel>Format</SectionLabel>
                  <div className="grid grid-cols-2 gap-1">
                    {ASPECT_PRESETS.map(p => (
                      <button key={p.id} onClick={() => { setAspectRatio(p.id); setActiveTemplate(undefined) }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-all duration-150 ${aspectRatio === p.id ? 'bg-accent/10 border-accent/30 text-accent' : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#111827] hover:border-[#C5CAD8]'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Frame type */}
                <div>
                  <SectionLabel>Frame</SectionLabel>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      { id: 'browser', label: 'Browser', icon: '🖥' },
                      { id: 'iphone',  label: 'iPhone',  icon: '📱' },
                      { id: 'android', label: 'Android', icon: '🤖' },
                      { id: 'ipad',    label: 'iPad',    icon: '📐' },
                      { id: 'none',    label: 'Clean',   icon: '◻' },
                    ] as { id: FrameType; label: string; icon: string }[]).map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setFrameType(f.id); setActiveTemplate(undefined) }}
                        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-all duration-150 ${
                          frameType === f.id
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#111827] hover:border-[#C5CAD8]'
                        }`}
                      >
                        <span className="text-[10px] leading-none">{f.icon}</span>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Motion reveal preset */}
                <div>
                  <SectionLabel>Motion / Animation</SectionLabel>
                  <button 
                    onClick={() => {
                      setIsMotionEnabled(prev => !prev)
                      track('motion_toggle_clicked')
                    }}
                    className={`w-full py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-1.5 font-bold text-xs ${
                      isMotionEnabled 
                        ? 'border-accent/35 bg-accent/10 text-accent shadow-[0_0_8px_rgba(167,139,250,0.15)]'
                        : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#374151] hover:bg-gray-50 hover:border-[#C5CAD8]'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                      {isMotionEnabled ? (
                        <path d="M4 3.5l6 3.5-6 3.5v-7z" fill="currentColor" />
                      ) : (
                        <path d="M4 3.5l6 3.5-6 3.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                    {isMotionEnabled ? 'Reveal Preview Active' : 'Enable Reveal Motion'}
                  </button>
                  <p className="text-[9px] text-[#9CA3AF] mt-1.5 leading-snug">Cinematic spotlight reveal and scroll zoom built for social post conversions.</p>
                </div>
                {/* Frame suggestion */}
                {imageDimensions && (() => {
                  const suggested = suggestFrameType(imageDimensions.width, imageDimensions.height)
                  if (!suggested || suggested === frameType) return null
                  const labels: Record<FrameType, string> = { browser: 'Browser', iphone: 'iPhone', android: 'Android', ipad: 'iPad', none: 'Clean' }
                  return (
                    <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-white border border-[#E5E7EC]">
                      <p className="text-[9px] text-[#6B7280] leading-snug">Suggested frame for this image</p>
                      <button
                        onClick={() => setFrameType(suggested)}
                        className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all duration-150"
                        style={{ color: theme.accent, borderColor: `${theme.accent}35`, background: `${theme.accent}0a` }}
                      >
                        {labels[suggested]}
                      </button>
                    </div>
                  )
                })()}
                {/* Active template badge */}
                {activeTemplate && (
                  <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-accent/[0.08] border border-accent/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[#6B7280] leading-none">Template active</p>
                      <p className="text-[10px] font-semibold text-accent mt-0.5 truncate">{TEMPLATES.find(t => t.id === activeTemplate)?.name}</p>
                    </div>
                    <button onClick={() => setActiveTemplate(undefined)} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors flex-shrink-0">
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!leftOpen && (
            <div className="pt-12 flex flex-col items-center gap-4 px-2">
              <div className="w-4 h-4 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 10px ${theme.glow}` }} />
            </div>
          )}
        </motion.aside>

        {/* ── CENTER CANVAS ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden editor-stage relative">

          <div className="flex-1 overflow-hidden relative flex flex-col">
            {!imageUrl ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-lg"><EditorDropzone onFile={handleFile} /></div>
              </div>
            ) : (
              <div 
                ref={viewportRef} 
                className="flex-1 flex items-center justify-center relative p-8 overflow-hidden select-none"
              >
                {L && (
                  <div 
                    className="relative rounded-2xl transition-all duration-200"
                    style={{
                      width: L.compW * fitScale,
                      height: L.compH * fitScale,
                      boxShadow: `0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.15), 0 0 48px ${theme.glow.replace('0.42','0.06')}`
                    }}
                  >
                    {/* The Live Composition Canvas */}
                    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 'inherit' }} />

                    {/* Direct Interaction Transparent Overlay */}
                    <div
                      className="absolute inset-0 cursor-crosshair rounded-2xl overflow-hidden"
                      onMouseDown={startDrawing}
                      onMouseMove={drawMove}
                      onMouseUp={endDrawing}
                      onMouseLeave={endDrawing}
                    >
                      {/* Active Drag Box outline for real-time 60fps gesture rendering */}
                      {dragBox && (
                        <div 
                          style={{
                            position: 'absolute',
                            pointerEvents: 'none',
                            border: `2px solid ${theme.accent}`,
                            background: `${theme.accent}15`,
                            boxShadow: `0 0 8px ${theme.glow}`,
                            left: dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w,
                            top: dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h,
                            width: Math.abs(dragBox.w),
                            height: Math.abs(dragBox.h),
                          }} 
                        />
                      )}
                    </div>

                    {/* Spotlight guidance hint — shown when no spotlight is drawn */}
                    {!selection && !isDrawing && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 border border-[#E5E7EC] backdrop-blur-sm shadow-sm">
                        <svg className="w-3 h-3 text-[#6B7280]" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1"/><path d="M8.5 5v4M10.5 7H6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                        <span className="text-[10px] text-[#6B7280]">Drag on the image to spotlight a region</span>
                      </div>
                    )}
                    {/* Contextual Clear Spotlight button floating right on top of canvas container */}
                    {selection && (
                      <button 
                        onClick={() => setSelection(null)} 
                        className="absolute top-3 right-3 z-30 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide uppercase border border-[#E5E7EC] bg-white/90 text-[#6B7280] hover:text-[#111827] hover:bg-white backdrop-blur-md transition-all active:scale-95 shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        Clear Spotlight
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Format bar ─────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-[#E5E7EC] bg-[#F5F6F8]/90 backdrop-blur-sm px-3 py-1.5 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1 w-max min-w-full">
              {FORMAT_BAR.map(f => {
                const fmt = SOCIAL_FORMATS[f.id]
                const isActive = aspectRatio === f.id
                return (
                  <button key={f.id} onClick={() => { setAspectRatio(f.id); setActiveTemplate(undefined) }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${isActive ? 'bg-white text-[#111827] border border-[#DDE0E8] shadow-sm' : 'text-[#6B7280] hover:text-[#374151] border border-transparent hover:border-[#E5E7EC] hover:bg-white'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${isActive ? 'opacity-100' : 'opacity-50'}`} style={{ background: fmt?.color ?? '#52525b' }} />
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────────── */}
        <motion.aside
          animate={{ width: rightOpen ? 232 : 44 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-shrink-0 border-l border-[#E5E7EC] bg-[#F0F2F5] overflow-hidden relative z-10"
        >
          <button onClick={() => setRightOpen(v => !v)}
            className="absolute top-2.5 left-2.5 z-10 w-6 h-6 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-[#6B7280] hover:bg-gray-200 transition-all">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <path d={rightOpen ? "M5 7h4M7 5l2 2-2 2" : "M9 7H5M7 5l-2 2 2 2"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <AnimatePresence>
            {rightOpen && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.13 }}
                className="p-3 pt-11 space-y-5 overflow-y-auto h-full scrollbar-none">
                {/* Intent */}
                <div>
                  <SectionLabel>Intent</SectionLabel>
                  <select value={intent} onChange={e => handleIntentChange(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-[#DDE0E8] text-[#111827] bg-white outline-none cursor-pointer transition-all duration-150 hover:border-[#C5CAD8] appearance-auto">
                    {Object.keys(INTENT_MAP).map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                {/* Headline */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <SectionLabel>Headline</SectionLabel>
                    {headline !== INTENT_MAP[intent] && (
                      <button onClick={() => setHeadline(INTENT_MAP[intent])} className="text-[9px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors mb-2">Reset ↺</button>
                    )}
                  </div>
                  <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Your headline…" className="input-field text-xs" />
                  <SuggestionChips suggestions={suggestions.headlines} current={headline} onSelect={setHeadline} />
                </div>
                {/* Callout */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <SectionLabel>Callout</SectionLabel>
                    {callout !== CALLOUT_MAP[intent] && (
                      <button onClick={() => setCallout(CALLOUT_MAP[intent])} className="text-[9px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors mb-2">Reset ↺</button>
                    )}
                  </div>
                  <input value={callout} onChange={e => setCallout(e.target.value)} placeholder="Callout label…" className="input-field text-xs" />
                  <SuggestionChips suggestions={suggestions.callouts} current={callout} onSelect={setCallout} />
                  <p className="text-[9px] text-[#9CA3AF] mt-2 leading-snug">Drag over the image above to position the callout</p>
                </div>
                {/* Product context */}
                <div>
                  <SectionLabel>Product context</SectionLabel>
                  <input
                    value={productContext}
                    onChange={e => setProductContext(e.target.value)}
                    placeholder="e.g. Fiora — Figma QA plugin"
                    className="input-field text-xs"
                  />
                  <p className="text-[9px] text-[#9CA3AF] mt-1 leading-snug">Used to personalise caption starters below</p>
                </div>
                {/* Caption starters */}
                <div>
                  <SectionLabel>Caption starters</SectionLabel>
                  <button
                    onClick={generateAICaptions}
                    className="w-full py-2.5 rounded-xl border transition-all duration-150 hover:bg-accent/15 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-bold text-xs"
                    style={{
                      color: theme.accent,
                      borderColor: `${theme.accent}30`,
                      background: `${theme.accent}08`,
                    }}
                  >
                    ✦ Get caption starters
                  </button>
                  <p className="text-[9px] text-[#9CA3AF] mt-1.5 text-center">Edit before posting — these are starting points</p>
                </div>
                {/* Quick export */}
                {imageUrl && (
                  <div>
                    <SectionLabel>Export</SectionLabel>
                    <button onClick={() => setExportOpen(true)} className="w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-150 hover:opacity-90 active:scale-95"
                      style={{ background: theme.accent, color: '#0f172a' }}>Download PNG ↓</button>
                    <p className="text-[9px] text-[#9CA3AF] mt-1.5 text-center">Full resolution · All formats</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </div>

      {/* Sticky Feedback Pill */}
      <button 
        onClick={() => setShowFeedback(true)}
        className="fixed bottom-6 left-6 z-[100] flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[11px] font-bold backdrop-blur-md transition-all duration-200 active:scale-95 shadow-[0_0_12px_rgba(0,0,0,0.4)] cursor-pointer"
        style={{ 
          color: theme.accent, 
          borderColor: `${theme.accent}30`, 
          background: `${theme.accent}0a` 
        }}
      >
        <span className="text-[10px]">💬</span> Feedback
      </button>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTemplates      && <TemplateGallery onApply={applyTemplate} onClose={() => setShowTemplates(false)} activeId={activeTemplate} />}
        {showFeedback       && <FeedbackModal onClose={() => setShowFeedback(false)} />}
        {showExportSuccess  && <ExportSuccessBanner accentColor={theme.accent} exportedFormats={exportedFormats} onDismiss={() => setShowExportSuccess(false)} />}
        
        {/* ✨ Contextual Social Caption Generator Sliding Sheet */}
        {showCaptionGenerator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCaptionGenerator(false)}
            className="fixed inset-0 z-[190] bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-[#E5E7EC] shadow-elevated flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EC] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">✦</span>
                  <div>
                    <h3 className="text-sm font-bold text-[#111827]">Caption Starters</h3>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">Edit these before posting — they're starting points</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCaptionGenerator(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:text-[#6B7280] hover:bg-gray-100 transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-none">
                {isGeneratingCaptions ? (
                  <div className="space-y-4 py-8">
                    {[1, 2, 3].map(n => (
                      <div key={n} className="p-4 rounded-xl border border-[#E5E7EC] bg-gray-50 space-y-2.5 animate-pulse">
                        <div className="h-3.5 bg-gray-200 rounded-full w-24" />
                        <div className="space-y-2">
                          <div className="h-3 bg-gray-200/80 rounded-full w-full" />
                          <div className="h-3 bg-gray-200/80 rounded-full w-5/6" />
                          <div className="h-3 bg-gray-200/80 rounded-full w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generatedCaptions.map((cap, i) => (
                      <CaptionCard key={i} caption={cap} accentColor={theme.accent} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
