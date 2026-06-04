import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  THEMES,
  computeLayout,
  renderComposition,
  type Selection,
  type CompositionDocument,
  type FrameType,
  type StoryRole,
  type SpotlightRegion,
  type Callout,
} from '../lib/composition'
import { STORY_INTENTS, FORMAT_LABELS, type StoryIntent } from '../lib/storyTemplates'
import { SOCIAL_FORMATS } from '../lib/socialFormats'
import { track, Events } from '../lib/analytics'
import { saveBridgeToEditor, loadBridgeFromStory, loadReturnFromEditor, hasReturnData, clearReturn } from '../lib/compositionBridge'
import type { BridgeData, StorySessionSnapshot } from '../lib/compositionBridge'
import type { ProductContext } from '../lib/contextEngine'
import { saveWorkspaceToDB, loadWorkspaceFromDB, deleteWorkspaceFromDB, getLastActiveWorkspaceId, saveLastActiveWorkspaceId, clearLastActiveWorkspacePointer, type LaunchWorkspace } from '../lib/workspaceStore'
import {
  buildFrameSequence,
  renderStoryFrame,
  exportStoryAsVideo,
  type AnimSlide,
  type AnimAsset,
  type StoryAnimConfig,
} from '../lib/storyAnimationExport'
import type { ExportProgress, ExportResult } from '../lib/motionExport'


// ─── Types ───────────────────────────────────────────────────────────────────

export interface StorySlide {
  id: string
  assetId: string
  role: StoryRole
  roleLabel: string
  title: string
  callout: string
  selection: Selection | null
  spotlight?: SpotlightRegion
  callouts?: Callout[]
  // Records the user's original upload index. Never overwritten by automated processes.
  // Once automatic reordering is removed, this becomes the enforcement point for
  // "user order is canonical" — slides render in this order unless the user explicitly
  // reorders via drag-and-drop or arrow controls.
  userDefinedPosition: number
}

interface StoryAsset {
  id: string
  file: File
  objectUrl: string
  decodedImage: HTMLImageElement | null
  width: number
  height: number
  status: 'loading' | 'ready' | 'error'
}

type StoryStep = 'intent' | 'upload' | 'builder'

// ─── Off-screen export renderer ──────────────────────────────────────────────

function renderSlideOffscreen(
  slide: StorySlide,
  assets: Record<string, StoryAsset>,
  formatId: string,
  themeIndex: number,
  padding: number,
  shadowOpacity: number,
  frameType: FrameType,
): string | null {
  const asset = assets[slide.assetId]
  if (!asset || asset.status !== 'ready' || !asset.decodedImage) return null

  const img = asset.decodedImage
  const L = computeLayout(img.naturalWidth, img.naturalHeight, padding, slide.title, formatId, frameType)
  
  const off = document.createElement('canvas')
  off.width = L.compW
  off.height = L.compH
  
  const ctx = off.getContext('2d')
  if (!ctx) return null

  const doc: CompositionDocument = {
    id: slide.id,
    formatId,
    themeIndex,
    padding,
    shadowOpacity,
    frameType,
    role: slide.role,
    headline: { text: slide.title, visible: !!slide.title },
    screenshot: {
      imageUrl: asset.objectUrl,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      visible: true,
      selection: slide.selection,
      callout: { text: slide.callout, visible: !!slide.callout },
      callouts: slide.callouts ?? [],
    },
  }

  const theme = THEMES[themeIndex] ?? THEMES[0]
  renderComposition(ctx, img, theme, doc, L, 1.0)
  
  try {
    return off.toDataURL('image/png')
  } catch {
    return null
  }
}

function downloadUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ─── STEP 1: Intent Selection ─────────────────────────────────────────────────

function IntentCard({
  intent, selected, onClick,
}: {
  intent: StoryIntent; selected: boolean; onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`relative text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2.5 ${
        selected
          ? 'border-[#C5CAD8] bg-white ring-1 ring-inset'
          : 'border-[#E5E7EC] bg-gray-50 hover:border-[#C5CAD8] hover:bg-gray-50'
      }`}
      style={selected ? { boxShadow: `0 0 20px ${intent.color}18` } : {}}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: intent.color }}>
          <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <div className="text-2xl leading-none">{intent.icon}</div>

      <div>
        <p className="text-sm font-semibold text-[#111827] leading-snug">{intent.label}</p>
        <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">{intent.description}</p>
      </div>

      <div className="flex flex-wrap gap-1 mt-auto pt-1">
        {intent.formats.slice(0, 3).map(f => (
          <span key={f} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-[#DDE0E8] text-[#6B7280]">
            {FORMAT_LABELS[f] ?? f}
          </span>
        ))}
      </div>

      {selected && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: `inset 0 0 0 1px ${intent.color}40` }} />
      )}
    </motion.button>
  )
}

function IntentStep({ onSelect }: { onSelect: (intent: StoryIntent) => void }) {
  const [selected, setSelected] = useState<string | null>(null)

  const handleContinue = () => {
    const intent = STORY_INTENTS.find(i => i.id === selected)
    if (intent) {
      track('story_intent_selected', { intent: selected ?? '' })
      onSelect(intent)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E7EC] flex-shrink-0">
        <Link to="/" className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] transition-colors text-xs">
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Home
        </Link>
        <span className="text-[#D1D5DB]">·</span>
        <span className="text-sm font-bold tracking-tight text-[#111827]"><span className="text-accent">Shot</span>Polish</span>
        <span className="text-[9px] text-[#6B7280] border border-[#E5E7EC] px-1.5 py-0.5 rounded-full ml-1">Launch Story</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-4xl">
          {/* Headline */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#DDE0E8] bg-gray-50 text-[11px] text-[#6B7280] mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Step 1 of 2 — Choose your story type
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111827]">
              What are you launching?
            </h1>
            <p className="mt-3 text-base text-[#6B7280] max-w-lg mx-auto leading-relaxed">
              Choose a story type. We'll suggest a slide structure and copy for that use case — you stay in control of the order and wording.
            </p>
          </div>

          {/* Intent grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STORY_INTENTS.map(intent => (
              <IntentCard
                key={intent.id}
                intent={intent}
                selected={selected === intent.id}
                onClick={() => setSelected(intent.id)}
              />
            ))}
          </div>

          {/* Continue */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <motion.button
              onClick={handleContinue}
              disabled={!selected}
              whileHover={selected ? { scale: 1.02 } : {}}
              whileTap={selected ? { scale: 0.98 } : {}}
              className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={selected ? {
                background: STORY_INTENTS.find(i => i.id === selected)?.color ?? '#818cf8',
                color: '#0f172a',
              } : {
                background: '#27272a',
                color: '#71717a',
              }}
            >
              Continue
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── STEP 2: Upload ───────────────────────────────────────────────────────────

function mapTemplateRoleToStoryRole(tplRole: string): StoryRole {
  const r = tplRole.toLowerCase()
  if (r.includes('hook') || r.includes('welcome') || r.includes('tease') || r.includes('intro') || r.includes('headline') || r.includes('hero')) {
    return 'intro'
  }
  if (r.includes('problem') || r.includes('pain') || r.includes('issue') || r.includes('before') || r.includes('context')) {
    return 'context'
  }
  if (r.includes('feature') || r.includes('change') || r.includes('action') || r.includes('announcement') || r.includes('approach')) {
    return 'feature'
  }
  if (r.includes('demo') || r.includes('step') || r.includes('works') || r.includes('process') || r.includes('transition') || r.includes('fix')) {
    return 'process'
  }
  if (r.includes('result') || r.includes('after') || r.includes('benefit') || r.includes('outcome') || r.includes('win') || r.includes('metric')) {
    return 'output'
  }
  if (r.includes('cta') || r.includes('try') || r.includes('action') || r.includes('next') || r.includes('upvote')) {
    return 'cta'
  }
  return 'uncertain'
}

function UploadStep({
  intent,
  onBack,
  onContinue,
  createSessionObjectUrl,
  initialItems,
}: {
  intent: StoryIntent
  onBack: () => void
  onContinue: (slides: StorySlide[], assets: Record<string, StoryAsset>, productContext: ProductContext) => void
  createSessionObjectUrl: (file: File) => string
  // Existing screenshots to rehydrate when re-entering upload from the builder,
  // so the user's uploads aren't hidden behind an empty dropzone.
  initialItems?: { file: File; url: string }[]
}) {
  const [uploadedItems, setUploadedItems] = useState<{ file: File; url: string }[]>(initialItems ?? [])
  const [dragging,      setDragging]      = useState(false)
  const [dragReorderIdx, setDragReorderIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: File[]) => {
    const images = newFiles.filter(f => f.type.startsWith('image/'))
    setUploadedItems(prev => {
      const currentFilesCount = prev.length
      const incoming = images.slice(0, 6 - currentFilesCount).map(file => {
        const url = createSessionObjectUrl(file)
        return { file, url }
      })
      return [...prev, ...incoming]
    })
  }, [createSessionObjectUrl])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const removeFile = (index: number) => {
    // Release the discarded file's object URL immediately rather than leaking it
    // until the whole page unmounts. (It's also in sessionObjectUrlsRef; the
    // unmount sweep double-revoke is a harmless no-op.)
    const removed = uploadedItems[index]
    if (removed) URL.revokeObjectURL(removed.url)
    setUploadedItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragStart = (index: number) => setDragReorderIdx(index)

  const handleDragOverItem = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragReorderIdx === null || dragReorderIdx === targetIdx) return
    setUploadedItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragReorderIdx, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
    setDragReorderIdx(targetIdx)
  }

  const handleContinue = () => {
    if (uploadedItems.length < 1) return
    
    const initialAssets: Record<string, StoryAsset> = {}
    const slides: StorySlide[] = uploadedItems.map((item, i) => {
      const assetId = `asset-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      initialAssets[assetId] = {
        id: assetId,
        file: item.file,
        objectUrl: item.url,
        decodedImage: null,
        width: 0,
        height: 0,
        status: 'loading'
      }
      
      const template = intent.slides[i] ?? intent.slides[intent.slides.length - 1]
      return {
        id: `slide-${i}-${Date.now()}`,
        assetId,
        role: mapTemplateRoleToStoryRole(template.role),
        roleLabel: template.label,
        title: template.defaultTitle,
        callout: template.defaultCallout,
        selection: null,
        userDefinedPosition: i,
      }
    })
    
    track('story_upload_complete', { count: uploadedItems.length, intent: intent.id })
    const ctx: ProductContext = {
      productName: '',
      shortDescription: '',
    }
    onContinue(slides, initialAssets, ctx)
  }

  const maxSlides = intent.slides.length
  const minReady = uploadedItems.length >= 2

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex flex-col">
      <header className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E7EC] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] transition-colors text-xs">
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>
        <span className="text-[#D1D5DB]">·</span>
        <span className="text-xs font-medium" style={{ color: intent.color }}>{intent.icon} {intent.label}</span>
        <span className="text-[#D1D5DB]">·</span>
        <span className="text-[9px] text-[#6B7280] border border-[#E5E7EC] px-1.5 py-0.5 rounded-full">Upload</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#DDE0E8] bg-gray-50 text-[11px] text-[#6B7280] mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Step 2 of 2 — Add your screenshots
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#111827]">Add your screenshots</h2>
            <p className="mt-2 text-sm text-[#6B7280]">
              Drop up to {maxSlides} screenshots. We'll suggest a slide order based on the story type.
            </p>
          </div>

          {/* Drop zone */}
          <div
            className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
              dragging
                ? 'border-accent/60 bg-accent/[0.05]'
                : 'border-[#DDE0E8] hover:border-[#C5CAD8] hover:bg-gray-50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
          >
            <input
              ref={inputRef} type="file" accept="image/*" multiple hidden
              onChange={e => addFiles(Array.from(e.target.files ?? []))}
            />
            <motion.div animate={dragging ? { scale: 1.04 } : { scale: 1 }} transition={{ duration: 0.15 }}>
              <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center border transition-all ${
                dragging ? 'bg-accent/20 border-accent/30' : 'bg-gray-50 border-[#DDE0E8]'
              }`}>
                <svg className={`w-6 h-6 ${dragging ? 'text-accent' : 'text-[#6B7280]'}`} viewBox="0 0 24 24" fill="none">
                  <path d="M12 4v12M12 4L9 7M12 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-[#111827]">{dragging ? 'Drop them!' : 'Drop screenshots here'}</p>
              <p className="text-xs text-[#6B7280] mt-1.5">or click to browse · PNG, JPG, WebP · Up to {maxSlides}</p>
            </motion.div>
          </div>

          {/* Story structure with uploaded images */}
          {intent.slides.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Story Structure</p>
                <span className="text-xs text-[#6B7280]">{uploadedItems.length} / {maxSlides} added</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {intent.slides.map((slide, i) => {
                  const item = uploadedItems[i]
                  const file = item?.file
                  const url  = item?.url
                  return (
                    <div
                      // Key by the file's identity (object URL), not the template slot.
                      // Slot-based keys never change position, so React can't see a
                      // reorder and the native drag source gets corrupted mid-drag.
                      key={item?.url ?? `slot-${slide.role}`}
                      draggable={!!file}
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={e => handleDragOverItem(e, i)}
                      onDragEnd={() => setDragReorderIdx(null)}
                      className="relative group"
                    >
                      <div className={`rounded-xl overflow-hidden aspect-video border transition-all duration-150 ${
                        file
                          ? 'border-[#C5CAD8] hover:border-accent/30 cursor-grab active:cursor-grabbing'
                          : 'border-dashed border-[#DDE0E8]'
                      }`}>
                        {file && url ? (
                          <>
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={e => { e.stopPropagation(); removeFile(i) }}
                              className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/40 text-[#111827] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[9px]"
                            >×</button>
                            {dragReorderIdx === i && (
                              <div className="absolute inset-0 bg-accent/20 border-2 border-accent/60 rounded-xl" />
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-50">
                            <span className="text-[9px] text-[#9CA3AF]">{i + 1}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-[#6B7280] mt-1 text-center leading-tight truncate">{slide.label}</p>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-[#9CA3AF] mt-2 text-center">Drag thumbnails to reorder</p>
            </div>
          )}

          {/* Continue */}
          <div className="mt-8 flex items-center justify-between">
            <button onClick={onBack} className="text-xs text-[#6B7280] hover:text-[#374151] transition-colors">← Back</button>
            <motion.button
              onClick={handleContinue}
              disabled={!minReady}
              whileHover={minReady ? { scale: 1.02 } : {}}
              whileTap={minReady ? { scale: 0.98 } : {}}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={minReady ? { background: intent.color, color: '#0f172a' } : { background: '#27272a', color: '#71717a' }}
            >
              Build Story
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </motion.button>
          </div>
          {!minReady && uploadedItems.length > 0 && (
            <p className="text-xs text-[#9CA3AF] mt-2 text-center">Add at least 2 screenshots to continue</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── STEP 3: Story Builder ────────────────────────────────────────────────────

function ExportModal({
  intent, slides, assets, themeIndex, padding, shadowOpacity, frameType, formatId, onClose,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
  formatId: string
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(intent.formats))
  const [status, setStatus]  = useState<'idle' | 'exporting' | 'done'>('idle')
  const [progress, setProgress] = useState({ slide: 0, format: 0 })
  const [animStatus,   setAnimStatus]   = useState<'idle' | 'exporting' | 'done' | 'error'>('idle')
  const [animProgress, setAnimProgress] = useState<ExportProgress | null>(null)
  const [animResult,   setAnimResult]   = useState<ExportResult | null>(null)
  const abortRef         = useRef<AbortController | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null) // wired to preview canvas in Task 4
  const previewRafRef    = useRef<number | null>(null)

  // Release the exported blob URL when it's replaced or the modal closes — tied to
  // the result's lifetime, not a wall-clock timer that used to kill the Save button
  // after 60s while it was still on screen.
  useEffect(() => {
    return () => { if (animResult) URL.revokeObjectURL(animResult.url) }
  }, [animResult])
  const animConfig: StoryAnimConfig = {
    formatId,
    themeIndex,
    padding,
    shadowOpacity,
    frameType,
  }

  const frameSeq    = useMemo(() => buildFrameSequence(slides.length), [slides.length])
  const frameSeqRef = useRef(frameSeq)
  useEffect(() => { frameSeqRef.current = frameSeq }, [frameSeq])

  const animConfigRef = useRef(animConfig)
  useEffect(() => { animConfigRef.current = animConfig })

  const slidesRef = useRef(slides)
  useEffect(() => { slidesRef.current = slides })

  const assetsRef = useRef(assets)
  useEffect(() => { assetsRef.current = assets })

  const fmt        = SOCIAL_FORMATS[formatId]
  const canAnimate = !!(fmt && fmt.width > 0) &&
    slides.every(s => assets[s.assetId]?.status === 'ready')

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const validSlides  = slides.filter(s => assets[s.assetId]?.status === 'ready')
  const totalExports = validSlides.length * selected.size

  const handleExport = async () => {
    if (status !== 'idle') return
    setStatus('exporting')
    track('story_export_started', { formats: selected.size, slides: validSlides.length })

    const formats = Array.from(selected)
    let slidesDone = 0

    for (const slide of validSlides) {
      let fmtDone = 0
      for (const fmt of formats) {
        setProgress({ slide: slidesDone + 1, format: fmtDone + 1 })
        const result = renderSlideOffscreen(slide, assets, fmt, themeIndex, padding, shadowOpacity, frameType)
        if (result) {
          const intentSlug = intent.id
          const slideNum   = String(slidesDone + 1).padStart(2, '0')
          const fmtLabel   = (FORMAT_LABELS[fmt] ?? fmt).replace(/[^a-z0-9]/gi, '-').toLowerCase()
          downloadUrl(result, `${intentSlug}-slide${slideNum}-${fmtLabel}.png`)
        }
        fmtDone++
        await new Promise(r => setTimeout(r, 150))
      }
      slidesDone++
    }

    setStatus('done')
  }

  const stopPreview = () => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current)
      previewRafRef.current = null
    }
  }

  useEffect(() => {
    if (!canAnimate || !previewCanvasRef.current) return
    const frames = frameSeqRef.current
    let startTime: number | null = null

    const loop = (ts: number) => {
      if (!previewCanvasRef.current) return
      if (startTime === null) startTime = ts
      const elapsedS  = (ts - startTime) / 1000
      const totalS    = frames.length / 30
      const t         = elapsedS % totalS
      const fi        = Math.min(Math.floor(t * 30), frames.length - 1)
      renderStoryFrame(
        frames[fi],
        slidesRef.current as AnimSlide[],
        assetsRef.current as Record<string, AnimAsset>,
        previewCanvasRef.current,
        animConfigRef.current,
      )
      previewRafRef.current = requestAnimationFrame(loop)
    }
    previewRafRef.current = requestAnimationFrame(loop)
    return stopPreview
  }, [canAnimate])

  const handleAnimExport = async () => {
    if (!canAnimate || animStatus !== 'idle') return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const { signal } = ctrl
    setAnimStatus('exporting')
    stopPreview()
    Events.storyAnimStarted(slides.length)
    try {
      const result = await exportStoryAsVideo(
        slides as AnimSlide[],
        assets as Record<string, AnimAsset>,
        animConfig,
        setAnimProgress,
        signal,
      )
      setAnimResult(result)
      setAnimStatus('done')
      Events.storyAnimComplete(slides.length, result.format)
    } catch {
      if (!signal.aborted) {
        setAnimStatus('error')
        Events.storyAnimError(slides.length)
      }
    }
  }

  const handleAnimDownload = () => {
    if (!animResult) return
    const a = document.createElement('a')
    a.href     = animResult.url
    a.download = `story.${animResult.format}`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    Events.storyAnimDownload(animResult.format)
    // Revocation is handled by the animResult cleanup effect (on close/replace),
    // so the Save button keeps working for as long as the modal is open.
  }

  const allFormats = Object.entries(SOCIAL_FORMATS)
    .filter(([id]) => id !== 'free')
    .map(([id, f]) => ({ id, label: f.platform, desc: f.description, color: f.color }))

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) { abortRef.current?.abort(); stopPreview(); onClose() } }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.2 }}
        className="bg-white border border-[#DDE0E8] rounded-2xl w-full max-w-md overflow-hidden shadow-float"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#E5E7EC]">
          <div>
            <h2 className="text-sm font-bold text-[#111827]">Export Images</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {validSlides.length} slide{validSlides.length !== 1 ? 's' : ''} · {totalExports} export{totalExports !== 1 ? 's' : ''} total
            </p>
          </div>
          <button onClick={() => { abortRef.current?.abort(); stopPreview(); onClose() }} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* ── Animated Story section ─────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 border-b border-[#E5E7EC]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
            Animated Story
          </p>

          {/* Preview canvas */}
          <div
            className="relative rounded-xl overflow-hidden bg-[#06080f]"
            style={{ aspectRatio: fmt?.width && fmt?.height ? `${fmt.width} / ${fmt.height}` : '16 / 9' }}
          >
            <canvas
              ref={previewCanvasRef}
              className="w-full h-full"
              style={{ display: 'block' }}
            />
            {canAnimate && (
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider text-white/70 bg-black/50 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] animate-pulse" />
                Preview
              </div>
            )}
          </div>

          {/* Export controls */}
          <div className="mt-2">
            {animStatus === 'idle' && (
              <>
                <button
                  onClick={handleAnimExport}
                  disabled={!canAnimate}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={canAnimate ? { background: intent.color, color: '#0f172a' } : { background: '#27272a', color: '#71717a' }}
                >
                  Export as Video →
                </button>
                {!canAnimate && (
                  <p className="text-[10px] text-[#9CA3AF] text-center mt-1">
                    {!fmt || fmt.width === 0
                      ? 'Select a social format to enable animated export'
                      : 'Waiting for screenshots to load…'}
                  </p>
                )}
              </>
            )}

            {animStatus === 'exporting' && (
              <div>
                <div className="flex items-center justify-between text-[10px] text-[#6B7280] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 border-2 border-[#818cf8] border-t-transparent rounded-full animate-spin inline-block" />
                    Rendering…
                  </span>
                  <span style={{ color: intent.color }}>{animProgress?.percent ?? 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#E5E7EC] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${animProgress?.percent ?? 0}%`, background: intent.color }}
                  />
                </div>
              </div>
            )}

            {animStatus === 'done' && animResult && (
              <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-[#34d399] flex items-center justify-center text-sm flex-shrink-0">✓</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#111827]">{animResult.format.toUpperCase()} ready</p>
                  <p className="text-[10px] text-[#6B7280]">
                    {(animResult.blob.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={handleAnimDownload}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#34d399] text-[#0f172a] flex-shrink-0"
                >
                  ↓ Save
                </button>
              </div>
            )}

            {animStatus === 'error' && (
              <div className="text-[11px] text-red-400 text-center py-1">
                Export failed.{' '}
                <button onClick={() => setAnimStatus('idle')} className="underline">Try again</button>
              </div>
            )}
          </div>
        </div>
        {/* ── End Animated Story section ──────────────────────────── */}

        {status === 'done' ? (
          <div className="p-5 flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${intent.color}20` }}>
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" style={{ color: intent.color }}>
                <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111827]">Done!</p>
              <p className="text-xs text-[#6B7280] mt-0.5">{totalExports} image{totalExports !== 1 ? 's' : ''} downloaded</p>
            </div>
            <button onClick={onClose} className="w-full py-2 rounded-lg text-xs font-semibold bg-gray-100 border border-[#DDE0E8] text-[#111827] hover:bg-gray-200 transition-all">Close</button>
          </div>
        ) : (
          <>
            <div
              className="px-5 py-4 max-h-64 overflow-y-auto scrollbar-none space-y-1"
              style={animStatus === 'exporting' ? { opacity: 0.4, pointerEvents: 'none' } : {}}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Static Slides</p>
              {allFormats.map(f => (
                <label key={f.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)}
                    className="w-3.5 h-3.5 rounded accent-violet-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-[#111827]">{f.label}</span>
                    <span className="text-[10px] text-[#6B7280] ml-1.5">{f.desc}</span>
                  </div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: f.color }} />
                </label>
              ))}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-[#E5E7EC]">
              {status === 'exporting' ? (
                <div className="text-center py-2">
                  <div className="flex items-center justify-center gap-2 text-xs text-[#374151]">
                    <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    Exporting slide {progress.slide}/{validSlides.length}, format {progress.format}/{selected.size}…
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        background: intent.color,
                        width: `${((progress.slide - 1) * selected.size + progress.format) / totalExports * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleExport}
                  disabled={!selected.size || status !== 'idle'}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: intent.color, color: '#0f172a' }}
                >
                  Download {totalExports} image{totalExports !== 1 ? 's' : ''} →
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

function SlideListItem({
  slide, index, total, isActive, accentColor,
  onClick, onMoveUp, onMoveDown,
}: {
  slide: StorySlide
  index: number
  total: number
  isActive: boolean
  accentColor: string
  onClick: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 group relative ${
        isActive
          ? 'bg-accent/[0.06] border border-accent/20'
          : 'border border-transparent hover:bg-gray-50 hover:border-[#E5E7EC]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`text-[10px] font-mono w-4 flex-shrink-0 ${isActive ? 'text-accent' : 'text-[#9CA3AF]'}`}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className={`text-[11px] font-semibold truncate ${isActive ? 'text-accent' : 'text-[#374151]'}`}>
              {slide.roleLabel}
            </p>
          </div>
          <p className="text-[9px] text-[#9CA3AF] truncate mt-0.5">{slide.title || 'No title'}</p>
        </div>
        <div className="flex-col gap-0.5 hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2">
          <button
            onClick={e => { e.stopPropagation(); onMoveUp() }}
            disabled={index === 0}
            className="w-4 h-4 flex items-center justify-center text-[#6B7280] hover:text-[#111827] disabled:opacity-20 transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M3 6l2-2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onMoveDown() }}
            disabled={index === total - 1}
            className="w-4 h-4 flex items-center justify-center text-[#6B7280] hover:text-[#111827] disabled:opacity-20 transition-colors"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full" style={{ background: accentColor }} />
      )}
    </button>
  )
}


function RightPanel({
  slide, slideIndex, totalSlides, theme, padding,
  onUpdateTitle, onUpdateCallout, onClearSelection, onPaddingChange,
  onUpdateCallouts,
}: {
  slide: StorySlide
  slideIndex: number
  totalSlides: number
  theme: typeof THEMES[number]
  padding: number
  onUpdateTitle: (v: string) => void
  onUpdateCallout: (v: string) => void
  onClearSelection: () => void
  onPaddingChange: (v: number) => void
  onUpdateCallouts: (callouts: Callout[]) => void
}) {
  return (
    <div className="h-full overflow-y-auto scrollbar-none p-3 pt-11 space-y-4">
      {/* Slide counter + role badge */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-[#9CA3AF]">{slideIndex + 1}/{totalSlides}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${theme.accent}20`, color: theme.accent }}>
          {slide.roleLabel}
        </span>
      </div>

      {/* Title */}
      <div>
        <label className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] block mb-1.5">Title</label>
        <textarea
          value={slide.title}
          onChange={e => onUpdateTitle(e.target.value)}
          placeholder="Slide title (shown on canvas)…"
          rows={2}
          className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] resize-none leading-relaxed transition-colors"
        />
      </div>

      {/* Spotlight callout */}
      <div>
        <label className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#6B7280] block mb-1.5">Spotlight callout</label>
        <input
          value={slide.callout}
          onChange={e => onUpdateCallout(e.target.value)}
          placeholder="Draw on image to position…"
          className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors"
        />
        {slide.selection ? (
          <button
            onClick={onClearSelection}
            className="mt-1.5 text-[10px] text-[#6B7280] hover:text-[#374151] transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Clear spotlight
          </button>
        ) : (
          <p className="text-[9px] text-[#9CA3AF] mt-1 leading-snug">Drag on the canvas to add a spotlight</p>
        )}
      </div>

      {/* Numbered callouts */}
      {(() => {
        const callouts = slide.callouts ?? []
        const canAdd = callouts.length < 3
        const removeCallout = (id: string) => onUpdateCallouts(callouts.filter(c => c.id !== id))
        const updateLabel = (id: string, label: string) => onUpdateCallouts(callouts.map(c => c.id === id ? { ...c, label } : c))
        return (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Callout markers</label>
              <span className="text-[9px] text-[#9CA3AF]">{callouts.length}/3</span>
            </div>
            {callouts.length === 0 ? (
              <p className="text-[9px] text-[#9CA3AF] leading-snug">
                Enable Annotate mode and click on the image to place numbered markers
              </p>
            ) : (
              <div className="space-y-1.5">
                {callouts.map(c => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black"
                      style={{ background: theme.accent }}>
                      {c.order}
                    </div>
                    <input
                      value={c.label}
                      onChange={e => updateLabel(c.id, e.target.value)}
                      placeholder={`Callout ${c.order}`}
                      className="flex-1 px-2 py-1 text-[10px] rounded-lg border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors min-w-0"
                    />
                    <button onClick={() => removeCallout(c.id)}
                      className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-[#9CA3AF] hover:text-[#374151] transition-colors">
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!canAdd && <p className="text-[9px] text-[#9CA3AF] mt-1">Max 3 callouts per slide</p>}
          </div>
        )
      })()}

      {/* Padding */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Padding</label>
          <span className="text-[10px] font-mono text-[#6B7280]">{padding}px</span>
        </div>
        <input
          type="range" min={40} max={180} step={4} value={padding}
          onChange={e => onPaddingChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  )
}

function ThumbnailCanvas({ decodedImage }: { decodedImage: HTMLImageElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = canvas.width = 104 * 2
    const ch = canvas.height = 64 * 2
    
    const iw = decodedImage.naturalWidth
    const ih = decodedImage.naturalHeight
    const aspect = iw / ih
    const targetAspect = cw / ch

    let sx = 0, sy = 0, sw = iw, sh = ih
    if (aspect > targetAspect) {
      sw = ih * targetAspect
      sx = (iw - sw) / 2
    } else {
      sh = iw / targetAspect
      sy = (ih - sh) / 2
    }

    ctx.drawImage(decodedImage, sx, sy, sw, sh, 0, 0, cw, ch)
  }, [decodedImage])

  return <canvas ref={canvasRef} className="w-full h-full object-cover" />
}

function BuilderStep({
  intent, slides, assets, onUpdateSlides, onBack, productContext,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  onUpdateSlides: React.Dispatch<React.SetStateAction<StorySlide[]>>
  onBack: () => void
  productContext: ProductContext | null
}) {
  const navigate = useNavigate()
  const [activeIndex,    setActiveIndex]    = useState(0)
  const [themeIndex,     setThemeIndex]     = useState(0)
  const [formatId,       setFormatId]       = useState(intent.formats[0] ?? 'twitter-post')
  const [frameType,      setFrameType]      = useState<FrameType>('browser')
  const [padding,        setPadding]        = useState(80)
  const [shadowOpacity]                     = useState(0.85)
  const [showExport,     setShowExport]     = useState(false)
  const [leftOpen,       setLeftOpen]       = useState(true)
  const [rightOpen,      setRightOpen]      = useState(true)
  const [isDrawing,      setIsDrawing]      = useState(false)
  const [dragBox,        setDragBox]        = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [annotateMode,   setAnnotateMode]   = useState(false)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)

  const [viewportSize,   setViewportSize]   = useState({ width: 0, height: 0 })

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const activeSlide = slides[activeIndex] ?? slides[0]
  const theme       = THEMES[themeIndex] ?? THEMES[0]

  const activeAsset = activeSlide ? assets[activeSlide.assetId] : null
  const imageDimensions = activeAsset && activeAsset.status === 'ready'
    ? { width: activeAsset.width, height: activeAsset.height }
    : null

  // Track viewport reactively to parent container resize events
  useEffect(() => {
    const el = viewportRef.current; if (!el) return
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      if (e) setViewportSize({ width: e.contentRect.width, height: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const compositionDoc = useMemo<CompositionDocument>(() => ({
    id: `story-${activeIndex}`,
    formatId,
    themeIndex,
    padding,
    shadowOpacity,
    frameType,
    role: activeSlide?.role,
    headline: { text: activeSlide?.title ?? '', visible: !!(activeSlide?.title) },
    screenshot: {
      imageUrl: activeAsset?.objectUrl ?? null,
      naturalWidth: imageDimensions?.width ?? 0,
      naturalHeight: imageDimensions?.height ?? 0,
      visible: !!(activeAsset?.objectUrl),
      selection: activeSlide?.selection ?? null,
      callout: { text: activeSlide?.callout ?? '', visible: !!(activeSlide?.callout) },
      callouts: activeSlide?.callouts ?? [],
    },
  }), [activeSlide, activeAsset, imageDimensions, formatId, themeIndex, padding, shadowOpacity, frameType, activeIndex])

  const L = useMemo(() => {
    if (!imageDimensions) return null
    return computeLayout(imageDimensions.width, imageDimensions.height, padding, activeSlide?.title ?? '', formatId, frameType)
  }, [imageDimensions, padding, activeSlide?.title, formatId, frameType, activeSlide?.role])

  const fitScale = useMemo(() => {
    if (!L || viewportSize.width === 0 || viewportSize.height === 0) return 1
    return Math.min((viewportSize.width - 80) / L.compW, (viewportSize.height - 80) / L.compH)
  }, [L, viewportSize])

  // Canvas container sizing — exact when L is ready, format-AR placeholder before that
  const fmtAR = (SOCIAL_FORMATS[formatId]?.width ?? 16) / (SOCIAL_FORMATS[formatId]?.height ?? 9)
  const vw = Math.max(viewportSize.width - 80, 320)
  const vh = Math.max(viewportSize.height - 80, 200)
  const placeholderW = viewportSize.width === 0 ? 400 : Math.round(Math.min(vw, vh * fmtAR))
  const placeholderH = Math.round(placeholderW / fmtAR)
  const canvasW = L ? Math.round(L.compW * fitScale) : placeholderW
  const canvasH = L ? Math.round(L.compH * fitScale) : placeholderH

  // Pure deterministic Canvas Render loop
  useEffect(() => {
    if (!canvasRef.current || !activeAsset || activeAsset.status !== 'ready' || !activeAsset.decodedImage || !L) return

    const canvas = canvasRef.current
    const img = activeAsset.decodedImage

    const dpr = window.devicePixelRatio || 1
    const pixW = Math.round(canvasW * dpr)
    const pixH = Math.round(canvasH * dpr)

    if (canvas.width !== pixW || canvas.height !== pixH) {
      canvas.width = pixW
      canvas.height = pixH
      canvas.style.width = `${canvasW}px`
      canvas.style.height = `${canvasH}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = canvasW / L.compW

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    renderComposition(ctx, img, theme, compositionDoc, L, 1.0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [activeAsset, compositionDoc, L, canvasW, canvasH, themeIndex])

  const updateSlide = useCallback((index: number, updates: Partial<StorySlide>) => {
    onUpdateSlides(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }, [onUpdateSlides])

  const moveSlide = (from: number, direction: 1 | -1) => {
    const to = from + direction
    if (to < 0 || to >= slides.length) return
    const next = [...slides]
    ;[next[from], next[to]] = [next[to], next[from]]
    onUpdateSlides(next)
    setActiveIndex(to)
  }

  const handleEditInEditor = useCallback(async () => {
    if (!activeSlide || !activeAsset || activeAsset.status !== 'ready' || !activeAsset.decodedImage) return

    // Convert the active slide's image to a stable data URL
    const imgCanvas = document.createElement('canvas')
    imgCanvas.width = activeAsset.width
    imgCanvas.height = activeAsset.height
    const imgCtx = imgCanvas.getContext('2d')
    if (!imgCtx) return
    imgCtx.drawImage(activeAsset.decodedImage, 0, 0)
    const imageDataUrl = imgCanvas.toDataURL('image/png')

    // Build asset data URLs and file map for the full session
    const assetFiles: Record<string, File> = {}
    const assetDataUrls: Record<string, string> = {}
    for (const [assetId, ast] of Object.entries(assets)) {
      if (ast.file) assetFiles[assetId] = ast.file
      if (ast.decodedImage) {
        const c = document.createElement('canvas')
        c.width = ast.width; c.height = ast.height
        const cx = c.getContext('2d')
        if (cx) { cx.drawImage(ast.decodedImage, 0, 0); assetDataUrls[assetId] = c.toDataURL('image/png') }
      }
    }

    const session: StorySessionSnapshot = {
      intentId: intent.id,
      themeIndex,
      frameType,
      padding,
      slides: slides.map(s => ({
        id: s.id,
        assetId: s.assetId,
        role: s.role,
        roleLabel: s.roleLabel,
        title: s.title,
        callout: s.callout,
        selection: s.selection,
      })),
      assetFiles,
      assetDataUrls,
    }

    const bridgePayload: BridgeData = {
      sourceSlide: {
        slideIndex: activeIndex,
        slideId: activeSlide.id,
        role: activeSlide.role,
        roleLabel: activeSlide.roleLabel,
        title: activeSlide.title,
        callout: activeSlide.callout,
        selection: activeSlide.selection,
        imageDataUrl,
      },
      session,
      timestamp: Date.now(),
    }

    saveBridgeToEditor(bridgePayload)
    navigate(`/editor?mode=bridge&slideIndex=${activeIndex}`)
  }, [activeSlide, activeAsset, assets, slides, intent, themeIndex, frameType, padding, activeIndex, navigate])

  // Spotlight drawing + annotate mode click handling
  const startDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!L) return
    const rect = e.currentTarget.getBoundingClientRect()
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    if (annotateMode) return
    setIsDrawing(true)
    setDragBox({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 })
  }
  const drawMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragBox || annotateMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragBox({ ...dragBox, w: e.clientX - rect.left - dragBox.x, h: e.clientY - rect.top - dragBox.y })
  }
  const endDrawing = (e: React.MouseEvent<HTMLDivElement>) => {
    const downPos = mouseDownPosRef.current
    mouseDownPosRef.current = null

    if (!L) return

    // Annotate mode: short clicks place callouts
    if (annotateMode) {
      const dx = Math.abs(e.clientX - (downPos?.x ?? e.clientX))
      const dy = Math.abs(e.clientY - (downPos?.y ?? e.clientY))
      if (dx < 6 && dy < 6) {
        const existingCallouts = activeSlide?.callouts ?? []
        if (existingCallouts.length >= 3) return
        const rect = e.currentTarget.getBoundingClientRect()
        const scale = rect.width / L.compW
        const compX = (e.clientX - rect.left) / scale
        const compY = (e.clientY - rect.top) / scale
        const normX = (compX - L.screenshot.x) / L.screenshot.w
        const normY = (compY - L.screenshot.y) / L.screenshot.h
        if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return
        const order = existingCallouts.length + 1
        const newCallout: Callout = {
          id: `callout-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          x: Math.max(0, Math.min(1, normX)),
          y: Math.max(0, Math.min(1, normY)),
          label: `Feature ${order}`,
          order,
        }
        updateSlide(activeIndex, { callouts: [...existingCallouts, newCallout] })
      }
      return
    }

    if (!dragBox) return
    setIsDrawing(false)
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = rect.width / L.compW
    const compX = (dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w) / scale
    const compY = (dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h) / scale
    const normX = (compX - L.screenshot.x) / L.screenshot.w
    const normY = (compY - L.screenshot.y) / L.screenshot.h
    const normW = Math.abs(dragBox.w) / scale / L.screenshot.w
    const normH = Math.abs(dragBox.h) / scale / L.screenshot.h
    if (normW > 0.02 && normH > 0.02) {
      updateSlide(activeIndex, {
        selection: {
          x: Math.max(0, Math.min(1, normX)),
          y: Math.max(0, Math.min(1, normY)),
          w: Math.max(0, Math.min(1 - normX, normW)),
          h: Math.max(0, Math.min(1 - normY, normH)),
        }
      })
    }
    setDragBox(null)
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F6F8] text-[#111827] overflow-hidden select-none">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-[#E5E7EC] bg-[#F5F6F8]/95 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] transition-colors text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Upload
          </button>
          <span className="text-[#D1D5DB]">·</span>
          <span className="text-sm font-bold tracking-tight text-[#111827]"><span className="text-accent">Shot</span>Polish</span>
          <span className="text-[10px] font-medium ml-1" style={{ color: intent.color }}>{intent.icon} {intent.label}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme selector */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E5E7EC] bg-gray-50">
            {THEMES.map((t, i) => (
              <button key={t.name} onClick={() => setThemeIndex(i)} title={t.name}
                className={`w-4 h-4 rounded-full transition-all ${i === themeIndex ? 'ring-1 ring-white/30 scale-110' : 'opacity-50 hover:opacity-80'}`}
                style={{ background: t.accent }} />
            ))}
          </div>

          {/* Frame type */}
          <select
            value={frameType}
            onChange={e => setFrameType(e.target.value as FrameType)}
            className="hidden sm:block text-xs bg-white border border-[#DDE0E8] text-[#111827] rounded-lg px-2 py-1 outline-none cursor-pointer"
          >
            {(['browser','iphone','android','ipad','none'] as FrameType[]).map(f => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>

          {/* Format */}
          <select
            value={formatId}
            onChange={e => setFormatId(e.target.value)}
            className="text-xs bg-white border border-[#DDE0E8] text-[#111827] rounded-lg px-2 py-1 outline-none cursor-pointer"
          >
            {Object.entries(SOCIAL_FORMATS).filter(([id]) => id !== 'free').map(([id, f]) => (
              <option key={id} value={id}>{f.platform} — {f.description}</option>
            ))}
          </select>

          {activeAsset?.status === 'ready' && (
            <button
              onClick={() => setAnnotateMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
                annotateMode
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-[#DDE0E8] text-[#374151] hover:text-[#111827] hover:border-[#C5CAD8] hover:bg-gray-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M5 1v1M5 9v1M1 5h1M9 5h1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              {annotateMode ? 'Annotating…' : 'Annotate'}
            </button>
          )}
          {activeAsset?.status === 'ready' && (
            <button
              onClick={handleEditInEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#DDE0E8] text-[#374151] hover:text-[#111827] hover:border-[#C5CAD8] hover:bg-gray-50 transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2.5L11.5 4.5L5.5 10.5H3.5V8.5L9.5 2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit Slide
            </button>
          )}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{ background: intent.color, color: '#0f172a' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <path d="M2 9l5 3 5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 6l5 3 5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 3l5 3 5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Generate Launch Kit
          </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — slide list */}
        <motion.aside
          animate={{ width: leftOpen ? 200 : 44 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-shrink-0 border-r border-[#E5E7EC] bg-[#F0F2F5] overflow-hidden relative z-10"
        >
          <button
            onClick={() => setLeftOpen(v => !v)}
            className="absolute top-2.5 right-2.5 z-10 w-6 h-6 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-[#374151] hover:bg-gray-100 transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <path d={leftOpen ? "M9 7H5M7 5l-2 2 2 2" : "M5 7h4M7 5l2 2-2 2"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <AnimatePresence>
            {leftOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}
                className="p-2 pt-11 space-y-1 overflow-y-auto h-full scrollbar-none">
                <div className="px-2 mb-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                    Story · {slides.length} slides
                  </p>
                  <p className="text-[8px] text-[#6B7280] mt-0.5 leading-snug">Drag arrows to reorder</p>
                </div>
                {slides.map((slide, i) => (
                  <SlideListItem
                    key={slide.id}
                    slide={slide}
                    index={i}
                    total={slides.length}
                    isActive={i === activeIndex}
                    accentColor={intent.color}
                    onClick={() => setActiveIndex(i)}
                    onMoveUp={() => moveSlide(i, -1)}
                    onMoveDown={() => moveSlide(i, 1)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {!leftOpen && (
            <div className="pt-12 flex flex-col items-center gap-3 px-2">
              {slides.map((_, i) => (
                <button
                  key={i} onClick={() => setActiveIndex(i)}
                  className={`w-5 h-5 rounded-full border transition-all text-[8px] flex items-center justify-center font-bold ${
                    i === activeIndex ? 'border-accent/40 bg-accent/15 text-accent' : 'border-[#DDE0E8] text-[#9CA3AF]'
                  }`}
                >{i + 1}</button>
              ))}
            </div>
          )}
        </motion.aside>

        {/* Center canvas */}
        <div
          className="flex-1 flex flex-col overflow-hidden editor-stage relative"
        >
          <div className="flex-1 overflow-hidden relative">
            {!activeSlide ? (
              <div className="flex-1 h-full flex items-center justify-center text-[#9CA3AF] text-sm">
                No active slide found
              </div>
            ) : activeAsset && activeAsset.status === 'loading' ? (
              <div className="flex-1 h-full flex items-center justify-center relative p-6 overflow-hidden">
                <div
                  className="relative rounded-2xl bg-gray-50 border border-[#E5E7EC] overflow-hidden flex flex-col items-center justify-center gap-3 shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
                  style={{
                    width: canvasW,
                    height: canvasH,
                  }}
                >
                  {/* Shimmer overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_1.8s_infinite]" />
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin relative z-10" />
                  <span className="text-[10px] font-bold text-accent uppercase tracking-widest animate-pulse relative z-10">Preparing screenshots…</span>
                </div>
              </div>
            ) : activeAsset && activeAsset.status === 'error' ? (
              <div className="flex-1 h-full flex flex-col items-center justify-center gap-2 text-red-400 text-xs select-none">
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 16 16" fill="none"><path d="M8 15A7 7 0 108 1a7 7 0 000 14zm0-10v4m0 2h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Failed to load screenshot
              </div>
            ) : (
              <div ref={viewportRef} className="flex-1 h-full flex items-center justify-center relative p-6 overflow-hidden">
                {/* Canvas is always mounted — hook paints as soon as image loads */}
                <div
                  className="relative rounded-2xl"
                  style={{
                    width: canvasW,
                    height: canvasH,
                    ...(L ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 24px 64px rgba(0,0,0,0.7), 0 0 48px ${theme.glow.replace('0.42', '0.06')}` } : {}),
                  }}
                >
                  <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 'inherit' }} />

                  {/* Spotlight drawing overlay (annotate mode changes cursor) */}
                  <div
                    className={`absolute inset-0 rounded-2xl overflow-hidden ${annotateMode ? 'cursor-cell' : 'cursor-crosshair'}`}
                    onMouseDown={startDrawing}
                    onMouseMove={drawMove}
                    onMouseUp={endDrawing}
                    onMouseLeave={endDrawing}
                  >
                    {dragBox && (
                      <div style={{
                        position: 'absolute', pointerEvents: 'none',
                        border: `1px solid ${theme.accent}60`,
                        background: `${theme.accent}0a`,
                        left: dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w,
                        top:  dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h,
                        width: Math.abs(dragBox.w), height: Math.abs(dragBox.h),
                      }} />
                    )}
                  </div>

                  {activeSlide.selection && (
                    <button
                      onClick={() => updateSlide(activeIndex, { selection: null })}
                      className="absolute top-3 right-3 z-30 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase border border-[#DDE0E8] bg-white/90 text-[#374151] hover:text-[#111827] hover:bg-black/80 backdrop-blur-md transition-all active:scale-95"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      Clear Spotlight
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right sidebar — text editing */}
        <motion.aside
          animate={{ width: rightOpen ? 240 : 44 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-shrink-0 border-l border-[#E5E7EC] bg-[#F0F2F5] overflow-hidden relative z-10"
        >
          <button
            onClick={() => setRightOpen(v => !v)}
            className="absolute top-2.5 left-2.5 z-10 w-6 h-6 flex items-center justify-center rounded-md text-[#9CA3AF] hover:text-[#374151] hover:bg-gray-100 transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
              <path d={rightOpen ? "M5 7h4M7 5l2 2-2 2" : "M9 7H5M7 5l-2 2 2 2"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <AnimatePresence>
            {rightOpen && activeSlide && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}
                className="h-full">
                <RightPanel
                  slide={activeSlide}
                  slideIndex={activeIndex}
                  totalSlides={slides.length}
                  theme={theme}
                  padding={padding}
                  onUpdateTitle={v => updateSlide(activeIndex, { title: v })}
                  onUpdateCallout={v => updateSlide(activeIndex, { callout: v })}
                  onClearSelection={() => updateSlide(activeIndex, { selection: null })}
                  onPaddingChange={setPadding}
                  onUpdateCallouts={callouts => updateSlide(activeIndex, { callouts })}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </div>

      {/* Export modal */}
      <AnimatePresence>
        {showExport && (
          <ExportModal
            intent={intent}
            slides={slides}
            assets={assets}
            themeIndex={themeIndex}
            padding={padding}
            shadowOpacity={shadowOpacity}
            frameType={frameType}
            formatId={formatId}
            onClose={() => setShowExport(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Pixel Signal Analyzer (heuristic) ───────────────────────────────────────
interface VisualSignals {
  uiComplexity: number
  textDensity: number
  hasMetrics: boolean
  hasCTA: boolean
  meanBrightness: number
}

function analyzeScreenshot(img: HTMLImageElement): VisualSignals {
  const canvas = document.createElement('canvas')
  canvas.width = 50
  canvas.height = 50
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { uiComplexity: 0.5, textDensity: 0.5, hasMetrics: false, hasCTA: false, meanBrightness: 128 }
  }

  ctx.drawImage(img, 0, 0, 50, 50)
  const imgData = ctx.getImageData(0, 0, 50, 50)
  const data = imgData.data

  let totalBrightness = 0
  let brightnessVariance = 0
  let edgeCount = 0
  let accentPixelCount = 0

  const brightnesses = new Float32Array(50 * 50)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const brightness = 0.299 * r + 0.587 * g + 0.114 * b
    brightnesses[i / 4] = brightness
    totalBrightness += brightness

    // Detect high-saturation brand colors (accent pixels)
    const maxVal = Math.max(r, g, b)
    const minVal = Math.min(r, g, b)
    const sat = maxVal > 0 ? (maxVal - minVal) / maxVal : 0
    if (sat > 0.35 && maxVal > 80) {
      accentPixelCount++
    }
  }

  const meanBrightness = totalBrightness / 2500

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const idx = y * 50 + x
      const b = brightnesses[idx]
      brightnessVariance += (b - meanBrightness) ** 2

      if (x > 0) {
        const prevB = brightnesses[idx - 1]
        if (Math.abs(b - prevB) > 30) {
          edgeCount++
        }
      }
    }
  }

  const uiComplexity = Math.min(1.0, edgeCount / 220)
  const textDensity = Math.min(1.0, brightnessVariance / 2500000)

  const hasMetrics = accentPixelCount > 45
  const hasCTA = accentPixelCount > 25 && meanBrightness < 185

  return {
    uiComplexity,
    textDensity,
    hasMetrics,
    hasCTA,
    meanBrightness,
  }
}

// ─── Role Detection — enriches slide metadata without altering order ──────────

// CRITICAL: User order is canonical.
// This function may update `role` metadata only.
// It must never reorder slides, reassign positions, or overwrite user-authored text.
// No automated process may change slide order unless explicitly initiated by the user.
function applyRoleDetection(
  slides: StorySlide[],
  assets: Record<string, StoryAsset>,
): StorySlide[] {
  return slides.map(slide => {
    const asset = assets[slide.assetId]
    if (!asset || asset.status !== 'ready' || !asset.decodedImage) return slide

    const analysis = analyzeScreenshot(asset.decodedImage)

    let score = 0
    if (analysis.hasCTA)             score += 3
    if (analysis.hasMetrics)         score += 3
    if (analysis.uiComplexity > 0.4) score += 2
    if (analysis.textDensity < 0.25) score += 1

    let bestFitRole: StoryRole = 'uncertain'
    if      (analysis.hasCTA     || score >= 5) bestFitRole = 'cta'
    else if (analysis.hasMetrics  || score >= 3) bestFitRole = 'output'
    else if (analysis.uiComplexity > 0.4)        bestFitRole = 'feature'
    else if (analysis.textDensity  > 0.35)        bestFitRole = 'process'
    else if (analysis.textDensity  < 0.25)        bestFitRole = 'intro'
    else                                          bestFitRole = 'context'

    return { ...slide, role: bestFitRole }
  })
}

// ─── Root page ────────────────────────────────────────────────────────────────

export function StoryModePage() {
  const [step,        setStep]        = useState<StoryStep>('intent')
  const [intent,      setIntent]      = useState<StoryIntent | null>(null)
  const [slides,      setSlides]      = useState<StorySlide[]>([])
  const [assets,      setAssets]      = useState<Record<string, StoryAsset>>({})
  const [productContext, setProductContext] = useState<ProductContext | null>(null)
  const [showRestoreBanner, setShowRestoreBanner] = useState(false)
  const [restoreWorkspaceId, setRestoreWorkspaceId] = useState<string | null>(null)

  // 1. IndexedDB Restore Workspace check on mount
  useEffect(() => {
    const lastWs = getLastActiveWorkspaceId()
    if (lastWs) {
      setRestoreWorkspaceId(lastWs)
      setShowRestoreBanner(true)
    }
  }, [])

  const handleRestoreWorkspace = async () => {
    if (!restoreWorkspaceId) return
    try {
      const restored = await loadWorkspaceFromDB(restoreWorkspaceId)
      if (restored) {
        const { workspace, assetFiles } = restored
        // Continue saving back to the same workspace we just restored.
        workspaceIdRef.current = workspace.id
        setProductContext(workspace.context)

        const restoredIntent = STORY_INTENTS.find(i => i.id === (workspace as any).intentId) || STORY_INTENTS[0]
        setIntent(restoredIntent)
        setSlides(workspace.slides.map((slide, index) => ({
          ...slide,
          userDefinedPosition: slide.userDefinedPosition ?? index,
        })))
        
        const initialAssets: Record<string, StoryAsset> = {}
        for (const [assetId, file] of Object.entries(assetFiles)) {
          const url = URL.createObjectURL(file)
          sessionObjectUrlsRef.current.push(url)
          initialAssets[assetId] = {
            id: assetId, file, objectUrl: url,
            decodedImage: null, width: 0, height: 0, status: 'loading',
          }
        }
        setAssets(initialAssets)
        setStep('builder')
        setShowRestoreBanner(false)

        // Kick off asset decoding
        for (const [assetId, asset] of Object.entries(initialAssets)) {
          loadAsset(asset.file, assetId, asset.objectUrl)
        }
      }
    } catch (e) {
      console.error('Failed to restore workspace', e)
    }
  }

  // Tracks which asset IDs have been persisted — avoids re-writing binary files on every text edit
  const savedAssetIdsRef = useRef<Set<string>>(new Set())

  // Stable per-session workspace id. Set once when a story begins (handleContinue),
  // is restored (handleRestoreWorkspace), or returns from the editor (bridge restore).
  // Replaces the old productName-derived key, which was always '' → every draft
  // collided on a single 'draft-workspace' record and silently overwrote prior work.
  const workspaceIdRef = useRef<string | null>(null)

  // 2a. Metadata-only autosave (3s debounce) — triggered by slide text edits, no binary writes
  useEffect(() => {
    if (step !== 'builder' || !productContext || slides.length === 0) return

    const wsId = workspaceIdRef.current
    if (!wsId) return
    const ws: LaunchWorkspace = {
      id: wsId, createdAt: Date.now(), updatedAt: Date.now(),
      context: productContext, slides, exports: [], versions: [],
      intentId: intent?.id || 'feature-launch',
    } as any

    const timer = setTimeout(() => {
      // Pass empty assets — IDB skips the asset transaction when there's nothing to write
      saveWorkspaceToDB(ws, {}).catch(err => console.warn('Workspace metadata autosave failed', err))
    }, 3000)

    return () => clearTimeout(timer)
  }, [slides, productContext, step, intent])

  // 2b. Asset-only save — fires immediately when a new ready asset appears, not on text edits
  useEffect(() => {
    if (step !== 'builder' || !productContext) return

    const newAssetFiles: Record<string, File> = {}
    for (const [assetId, asset] of Object.entries(assets)) {
      if (asset.status === 'ready' && asset.file && !savedAssetIdsRef.current.has(assetId)) {
        newAssetFiles[assetId] = asset.file
      }
    }
    if (Object.keys(newAssetFiles).length === 0) return

    const wsId = workspaceIdRef.current
    if (!wsId) return
    const ws: LaunchWorkspace = {
      id: wsId, createdAt: Date.now(), updatedAt: Date.now(),
      context: productContext, slides, exports: [], versions: [],
      intentId: intent?.id || 'feature-launch',
    } as any

    saveWorkspaceToDB(ws, newAssetFiles).then(() => {
      for (const id of Object.keys(newAssetFiles)) savedAssetIdsRef.current.add(id)
    }).catch(err => console.warn('Workspace asset save failed', err))
    // slides/productContext/intent are included so a newly-ready asset is persisted
    // alongside the *current* slide metadata, not a stale snapshot. savedAssetIdsRef
    // guards against re-writing binary files, so the extra runs on text edits are cheap.
  }, [assets, step, slides, productContext, intent])

  // Keep track of all object URLs created during the session to revoke them on unmount
  const sessionObjectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    const currentUrls = sessionObjectUrlsRef.current
    return () => {
      currentUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url)
        } catch (e) {
          console.warn('Failed to revoke object URL', url, e)
        }
      })
    }
  }, [])

  // Automatically sequence story slides once all assets are decoded and ready in memory
  const [sequenced, setSequenced] = useState(false)
  useEffect(() => {
    if (step !== 'builder' || !intent || slides.length === 0 || sequenced) return

    // A decode failure ('error') is terminal — treat it as "done" so one bad
    // screenshot can't wedge the builder by leaving the gate permanently unmet.
    // applyRoleDetection already skips non-ready assets, leaving their template role.
    const allReady = slides.every(slide => {
      const asset = assets[slide.assetId]
      return asset && (asset.status === 'ready' || asset.status === 'error')
    })

    if (allReady) {
      setSlides(prev => applyRoleDetection(prev, assets))
      setSequenced(true)
    }
    // intent is not passed to applyRoleDetection but guards against running before
    // the user has selected an intent. It must stay in the dep array.
  }, [assets, slides, step, intent, sequenced])

  // Bridge restore — runs once on mount when returning from editor
  useEffect(() => {
    if (!hasReturnData()) return
    const returnedSlide = loadReturnFromEditor()
    const bridgeState = loadBridgeFromStory()
    if (!bridgeState || !returnedSlide) return

    const { session } = bridgeState
    const restoredIntent = STORY_INTENTS.find(i => i.id === session.intentId)
    if (!restoredIntent) return

    // Returning from the editor remounts this page, clearing workspaceIdRef.
    // Adopt the workspace the autosave was already writing to, so edits keep
    // saving to the same record instead of spawning a new draft each round trip.
    workspaceIdRef.current = getLastActiveWorkspaceId() ?? crypto.randomUUID()

    const restoredSlides: StorySlide[] = session.slides.map((s, index) => {
      if (s.id === bridgeState.sourceSlide.slideId) {
        return {
          ...s,
          role: returnedSlide.role,
          roleLabel: returnedSlide.roleLabel,
          title: returnedSlide.title,
          callout: returnedSlide.callout,
          selection: returnedSlide.selection,
          // userDefinedPosition was added after some snapshots were taken;
          // fall back to current iteration order as the best available approximation.
          userDefinedPosition: s.userDefinedPosition ?? index,
        }
      }
      return {
        ...s,
        // userDefinedPosition was added after some snapshots were taken;
        // fall back to current iteration order as the best available approximation.
        userDefinedPosition: s.userDefinedPosition ?? index,
      }
    })

    const initialAssets: Record<string, StoryAsset> = {}
    for (const [assetId, file] of Object.entries(session.assetFiles)) {
      const url = URL.createObjectURL(file)
      sessionObjectUrlsRef.current.push(url)
      initialAssets[assetId] = {
        id: assetId, file, objectUrl: url,
        decodedImage: null, width: 0, height: 0, status: 'loading',
      }
    }

    setIntent(restoredIntent)
    setSlides(restoredSlides)
    setAssets(initialAssets)
    setStep('builder')
    clearReturn()
    window.history.replaceState({}, '', '/story')

    // Kick off asset decoding (same as handleContinue)
    for (const [assetId, asset] of Object.entries(initialAssets)) {
      loadAsset(asset.file, assetId, asset.objectUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createSessionObjectUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    sessionObjectUrlsRef.current.push(url)
    return url
  }, [])

  const loadAsset = async (file: File, assetId: string, url: string) => {
    try {
      const img = new Image()
      const decoded = await new Promise<{
        img: HTMLImageElement
        width: number
        height: number
      }>((resolve, reject) => {
        img.onload = async () => {
          try {
            if ('decode' in img) {
              await img.decode()
            }
            resolve({
              img,
              width: img.naturalWidth,
              height: img.naturalHeight
            })
          } catch (err) {
            reject(err)
          }
        }
        img.onerror = reject
        img.src = url
      })

      setAssets(prev => ({
        ...prev,
        [assetId]: {
          id: assetId,
          file,
          objectUrl: url,
          decodedImage: decoded.img,
          width: decoded.width,
          height: decoded.height,
          status: 'ready'
        }
      }))
    } catch (err) {
      console.error('[ASSET DECODE FAILED]', assetId, err)
      setAssets(prev => ({
        ...prev,
        [assetId]: {
          ...prev[assetId],
          status: 'error'
        }
      }))
    }
  }


  const handleContinue = (newSlides: StorySlide[], initialAssets: Record<string, StoryAsset>, ctx: ProductContext) => {
    // New story → new stable workspace id so this draft never overwrites a prior one.
    workspaceIdRef.current = crypto.randomUUID()
    setSlides(newSlides)
    setAssets(initialAssets)
    setProductContext(ctx)
    setSequenced(false)
    setStep('builder')

    // Start background decoding pipeline for all newly created assets
    Object.values(initialAssets).forEach(asset => {
      loadAsset(asset.file, asset.id, asset.objectUrl)
    })
  }

  if (step === 'intent') {
    return (
      <div className="relative">
        {showRestoreBanner && (
          <div className="bg-accent/[0.06] border-b border-accent/20 px-6 py-2.5 flex items-center justify-between text-xs text-[#111827] relative z-50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span>Continue editing your previous launch workspace?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreWorkspace}
                className="px-2.5 py-1 bg-accent text-white font-semibold rounded hover:brightness-110 transition-all text-[11px]"
              >
                Restore Workspace
              </button>
              <button
                onClick={() => {
                  setShowRestoreBanner(false)
                  if (restoreWorkspaceId) {
                    deleteWorkspaceFromDB(restoreWorkspaceId).catch(() => {})
                    clearLastActiveWorkspacePointer()
                  }
                }}
                className="px-2.5 py-1 bg-gray-50 text-[#374151] font-semibold rounded border border-[#DDE0E8] hover:text-[#111827] transition-all text-[11px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <IntentStep
          onSelect={i => { setIntent(i); setStep('upload') }}
        />
      </div>
    )
  }

  if (step === 'upload') {
    // Rebuild the upload list from existing slides/assets (in current order) so
    // returning to Upload from the builder shows the user's screenshots instead of
    // an empty dropzone. handleContinue reuses these URLs, so no new leak on rebuild.
    const uploadInitialItems = slides
      .map(s => assets[s.assetId])
      .filter((a): a is StoryAsset => !!a && !!a.file)
      .map(a => ({ file: a.file, url: a.objectUrl }))
    return (
      <UploadStep
        intent={intent!}
        onBack={() => setStep('intent')}
        onContinue={handleContinue}
        createSessionObjectUrl={createSessionObjectUrl}
        initialItems={uploadInitialItems}
      />
    )
  }

  return (
    <BuilderStep
      intent={intent!}
      slides={slides}
      assets={assets}
      onUpdateSlides={setSlides}
      onBack={() => setStep('upload')}
      productContext={productContext}
    />
  )
}
