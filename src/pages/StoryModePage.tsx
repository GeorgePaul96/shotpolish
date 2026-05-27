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
import { generatePostingPlan, type PostingPlan } from '../lib/postingGuide'
import { detectSemanticFocus, type SemanticFocusCandidate, FOCUS_TYPE_LABELS } from '../lib/spotlightDetection'
import { generateLaunchStrategy, type LaunchStrategy } from '../lib/launchStrategy'
import {
  buildNarrativeArc, narrativeOrder, arcDiffersFromCurrent,
  type NarrativeArc, POSITION_LABELS, POSITION_COLORS, ARC_TYPE_LABELS,
  type NarrativePosition,
} from '../lib/narrativeSequencing'
import { SOCIAL_FORMATS } from '../lib/socialFormats'
import { track } from '../lib/analytics'
import { analyzeImageOCR, getOCRReliability, terminateAllWorkers } from '../lib/ocr'
import { buildVisualOnlyExplanation, buildHybridExplanation, type AutomationExplanation, type VisualSignals } from '../lib/semanticAnalysis'
import { saveBridgeToEditor, loadBridgeFromStory, loadReturnFromEditor, hasReturnData, clearReturn } from '../lib/compositionBridge'
import type { BridgeData, StorySessionSnapshot } from '../lib/compositionBridge'

// Grounded Grounding Engines (v3)
import { inferPresetsFromDescription, type ProductContext, type ProductTone, type LaunchGoal, type ProductType } from '../lib/contextEngine'
import { buildSignalAssessment, type SignalAssessment, type SignalEvidence } from '../lib/signalEngine'
import { composeGroundedCaptions } from '../lib/captionComposer'
import { generateNarrativeSuggestions, type NarrativeSuggestion } from '../lib/narrativeSuggestions'
import { generateLaunchTimeline, type LaunchTimeline, type TimelinePost } from '../lib/launchTimeline'
import { saveWorkspaceToDB, loadWorkspaceFromDB, deleteWorkspaceFromDB, getLastActiveWorkspaceId, saveLastActiveWorkspaceId, clearLastActiveWorkspacePointer, type LaunchWorkspace } from '../lib/workspaceStore'


// ─── Types ───────────────────────────────────────────────────────────────────

interface StorySlide {
  id: string
  assetId: string
  role: StoryRole
  roleLabel: string
  confidence: number
  title: string
  callout: string
  selection: Selection | null
  spotlight?: SpotlightRegion
  explanation?: AutomationExplanation
  callouts?: Callout[]
  spotlightCandidates?: SemanticFocusCandidate[]
  signalAssessment?: SignalAssessment
  userAdjustedSpotlight?: boolean
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

type StoryStep = 'intent' | 'context' | 'upload' | 'builder'

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
              Step 1 of 3 — Choose your story type
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
}: {
  intent: StoryIntent
  onBack: () => void
  onContinue: (slides: StorySlide[], assets: Record<string, StoryAsset>, productName: string) => void
  createSessionObjectUrl: (file: File) => string
}) {
  const [uploadedItems,  setUploadedItems]  = useState<{ file: File; url: string }[]>([])
  const [productName,    setProductName]    = useState('')
  const [dragging,       setDragging]       = useState(false)
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
        confidence: 0,
        title: template.defaultTitle,
        callout: template.defaultCallout,
        selection: null,
      }
    })
    
    track('story_upload_complete', { count: uploadedItems.length, intent: intent.id })
    onContinue(slides, initialAssets, productName.trim())
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
              Step 2 of 3 — Add your screenshots
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#111827]">Add your screenshots</h2>
            <p className="mt-2 text-sm text-[#6B7280]">
              Drop up to {maxSlides} screenshots. We'll suggest a slide order based on the story type.
            </p>
          </div>

          {/* Product name */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Product name <span className="font-normal text-[#9CA3AF]">(used in captions)</span></label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="e.g. Fiora, Notion, Linear…"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors"
            />
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
                      key={slide.role}
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

function compileCaptions(
  slides: StorySlide[],
  productName = '',
  productContext: ProductContext | null = null,
): { twitter: string; linkedin: string; producthunt: string } {
  const ocrDone = slides.filter(s => s.explanation && !s.explanation.ocrPending)
  const ocrReliability = ocrDone.length > 0 ? 'strong' as const : 'weak' as const

  return composeGroundedCaptions(
    slides.map(s => ({ role: s.role, title: s.title, callout: s.callout })),
    productContext || { productName: productName || 'our product', shortDescription: '' },
    ocrReliability
  )
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function PostingGuideRow({ step, caption }: { step: import('../lib/postingGuide').PostingStep; caption: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!caption) return
    navigator.clipboard.writeText(caption)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-start gap-2.5 px-2.5 py-2 rounded-xl bg-gray-50 border border-[#E5E7EC]">
      <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-black mt-0.5"
        style={{ background: step.platformColor }}>
        {step.order}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[11px] font-semibold text-[#111827] truncate">{step.platform}</p>
          {caption && (
            <button onClick={copy}
              className={`flex-shrink-0 text-[9px] px-2 py-0.5 rounded border transition-all ${copied ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-[#DDE0E8] text-[#6B7280] hover:text-[#111827]'}`}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
        </div>
        <p className="text-[9px] text-[#6B7280] mt-0.5 leading-snug">{step.timing}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] text-[#9CA3AF] border border-[#E5E7EC] px-1.5 py-0 rounded-full">{step.slideNote}</span>
        </div>
      </div>
    </div>
  )
}

function ExportModal({
  intent, slides, assets, themeIndex, padding, shadowOpacity, frameType, productName, onClose,
  launchStrategy,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
  productName: string
  onClose: () => void
  launchStrategy?: LaunchStrategy | null
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(intent.formats))
  const [activeTab, setActiveTab] = useState<'formats' | 'captions' | 'strategy'>('formats')
  const [status, setStatus]  = useState<'idle' | 'exporting' | 'done'>('idle')
  const [progress, setProgress] = useState({ slide: 0, format: 0 })
  const [postingPlan, setPostingPlan] = useState<PostingPlan | null>(null)

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

    // Download captions.txt
    const caps = compileCaptions(validSlides, productName, productContext)
    const plan = generatePostingPlan(
      validSlides.map(s => ({ role: s.role, title: s.title })),
      intent,
      Array.from(selected),
      caps,
    )
    const captionsContent = [
      `LAUNCH KIT — ${productName || intent.label}`,
      `Generated by ShotPolish · ${new Date().toLocaleDateString()}`,
      `Intent: ${intent.label} · ${validSlides.length} slides`,
      '',
      '=========================================',
      'X / TWITTER',
      '=========================================',
      caps.twitter,
      '',
      '=========================================',
      'LINKEDIN',
      '=========================================',
      caps.linkedin,
      '',
      '=========================================',
      'PRODUCT HUNT',
      '=========================================',
      caps.producthunt,
      '',
      '=========================================',
      'SLIDE TITLES (in order)',
      '=========================================',
      ...validSlides.map((s, i) => `${i + 1}. [${s.roleLabel}] ${s.title}`),
    ].join('\n')
    downloadTextFile(captionsContent, `${intent.id}-launch-captions.txt`)

    // Download metadata.json
    const metadataContent = JSON.stringify({
      intent: intent.id,
      themeIndex,
      padding,
      frameType,
      slides: validSlides.map(s => ({
        id: s.id,
        role: s.role,
        title: s.title,
        callout: s.callout,
        spotlight: s.spotlight
      }))
    }, null, 2)
    downloadTextFile(metadataContent, `${intent.id}-metadata.json`)

    setPostingPlan(plan)
    setStatus('done')
  }

  const allFormats = Object.entries(SOCIAL_FORMATS)
    .filter(([id]) => id !== 'free')
    .map(([id, f]) => ({ id, label: f.platform, desc: f.description, color: f.color }))

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.2 }}
        className="bg-white border border-[#DDE0E8] rounded-2xl w-full max-w-md overflow-hidden shadow-float"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#E5E7EC]">
          <div>
            <h2 className="text-sm font-bold text-[#111827]">Generate Launch Kit</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {validSlides.length} slide{validSlides.length !== 1 ? 's' : ''} · {totalExports} exports total
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-gray-100 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[#E5E7EC] px-2 bg-gray-50">
          {(['formats', 'captions', 'strategy'] as const).map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[10.5px] font-bold transition-all border-b-2 flex items-center justify-center gap-1 ${
                activeTab === tab ? 'border-accent text-[#111827]' : 'border-transparent text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {i + 1}.{' '}
              {tab === 'formats' ? `Formats (${selected.size})` :
               tab === 'captions' ? 'Captions' : (
                <span className="flex items-center gap-1">
                  Strategy
                  {launchStrategy && launchStrategy.confidence >= 0.6 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  )}
                </span>
               )}
            </button>
          ))}
        </div>

        {status === 'done' ? (
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${intent.color}20` }}>
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: intent.color }}>
                  <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">Your launch plan is ready</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{totalExports} image{totalExports !== 1 ? 's' : ''} + captions downloaded</p>
              </div>
            </div>
            {postingPlan && postingPlan.steps.length > 0 ? (
              <div className="space-y-1.5 mb-4 max-h-56 overflow-y-auto scrollbar-none">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Platform posting order</p>
                {postingPlan.steps.map(step => {
                  const captionMap: Record<string, string> = {
                    'twitter-post': compileCaptions(validSlides, productName, productContext).twitter,
                    'linkedin-post': compileCaptions(validSlides, productName, productContext).linkedin,
                    'product-hunt': compileCaptions(validSlides, productName, productContext).producthunt,
                  }
                  return (
                    <PostingGuideRow
                      key={step.formatId}
                      step={step}
                      caption={captionMap[step.formatId] ?? ''}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="space-y-1.5 mb-4">
                {Array.from(selected).slice(0, 3).map((fmt, i) => {
                  const fmtInfo = SOCIAL_FORMATS[fmt]
                  return (
                    <div key={fmt} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-[#E5E7EC]">
                      <span className="text-[10px] font-mono text-[#9CA3AF] w-3">{i + 1}</span>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: fmtInfo?.color ?? '#52525b' }} />
                      <span className="text-[11px] text-[#374151]">{fmtInfo?.platform ?? fmt}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-lg text-xs font-semibold bg-gray-100 border border-[#DDE0E8] text-[#111827] hover:text-[#111827] hover:bg-gray-100 transition-all">Done</button>
          </div>
        ) : (
          <>
            {activeTab === 'formats' ? (
              <div className="px-5 py-4 max-h-64 overflow-y-auto scrollbar-none space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Select formats</p>
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
            ) : activeTab === 'strategy' ? (
              <div className="px-5 py-4 max-h-64 overflow-y-auto scrollbar-none space-y-4">
                {launchTimeline ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] px-2 py-0.5 rounded border border-[#DDE0E8] text-[#374151] bg-gray-50">
                        {launchTimeline.productTypeLabel}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded border border-[#DDE0E8] text-[#374151] bg-gray-50">
                        Goal: {launchTimeline.primaryGoal}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {launchTimeline.posts.map((post, idx) => (
                        <div key={idx} className="px-3 py-2.5 rounded-xl bg-gray-50 border border-[#E5E7EC] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#111827]">{post.title}</span>
                            <span className="text-[9px] font-mono text-[#6B7280]">{post.platform}</span>
                          </div>
                          <p className="text-[9px] text-[#6B7280] leading-snug">{post.purpose}</p>
                          <div className="text-[8.5px] text-[#9CA3AF] bg-white border border-[#E5E7EC] p-1.5 rounded-lg font-mono">
                            Focus: {post.slideInstruction}
                          </div>
                          <p className="text-[9px] text-[#6B7280] leading-snug">{post.guidanceText}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#E5E7EC]">
                      <p className="text-[10px] font-bold text-[#374151]">Timeline Guidance</p>
                      {launchTimeline.sequencingGuide.map((guide, idx) => (
                        <p key={idx} className="text-[9px] text-[#6B7280] flex items-start gap-1 leading-relaxed">
                          <span className="text-[#9CA3AF] mt-0.5 flex-shrink-0">·</span>{guide}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-xs text-[#6B7280]">Strategy timeline loading...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-5 py-4 max-h-64 overflow-y-auto scrollbar-none space-y-4">
                {Object.entries(compileCaptions(slides, productName, productContext)).map(([network, text]) => (
                  <div key={network} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{network}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(text)
                          alert(`${network.toUpperCase()} caption copied!`)
                        }}
                        className="text-[9px] font-bold px-2 py-0.5 rounded border border-[#DDE0E8] text-[#374151] hover:text-[#111827] hover:bg-gray-100 transition-all"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-lg border border-[#E5E7EC] bg-white text-[10px] text-[#374151] whitespace-pre-wrap leading-relaxed select-text font-sans">
                      {text}
                    </pre>
                  </div>
                ))}
              </div>
            )}

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
                  Download {totalExports} item{totalExports !== 1 ? 's' : ''} Launch Kit →
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
  slide, index, total, isActive, accentColor, arcPosition,
  onClick, onMoveUp, onMoveDown,
}: {
  slide: StorySlide
  index: number
  total: number
  isActive: boolean
  accentColor: string
  arcPosition?: NarrativePosition | null
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
            {arcPosition && arcPosition !== 'flexible' && (
              <span
                className="flex-shrink-0 text-[7.5px] font-bold px-1 py-px rounded"
                style={{ background: `${POSITION_COLORS[arcPosition]}18`, color: POSITION_COLORS[arcPosition] }}
              >
                {POSITION_LABELS[arcPosition]}
              </span>
            )}
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

const ROLE_EXPLANATIONS: Record<StoryRole, string> = {
  intro:     'Opening frame — sets the scene before the product is revealed.',
  context:   'Problem or before-state — shows the pain or the old way.',
  feature:   'Hero feature — the main capability being presented.',
  process:   'How it works — a step, workflow, or mechanism.',
  output:    'Result or after-state — the outcome the user achieves.',
  cta:       'Call to action — drives the viewer to sign up or try it.',
  uncertain: 'Role not yet assigned — drag to reorder or set manually.',
}

function RightPanel({
  slide, slideIndex, totalSlides, theme, padding,
  onUpdateTitle, onUpdateCallout, onClearSelection, onPaddingChange,
  onUpdateCallouts, productContext,
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
  onApplySuggestion: (c: SemanticFocusCandidate) => void
  onDismissSuggestion: () => void
  productContext: ProductContext | null
}) {
  const [showWhy, setShowWhy] = useState(false)
  const explanation = slide.explanation
  
  const visualSignals: VisualSignals = useMemo(() => ({
    uiComplexity: slide.explanation?.visualSignals?.some(s => s.includes('complex')) ? 0.6 : 0.3,
    textDensity: slide.explanation?.visualSignals?.some(s => s.includes('text')) ? 0.5 : 0.2,
    hasMetrics: !!(slide.explanation?.visualSignals?.some(s => s.includes('metrics')) || slide.explanation?.semanticSignals?.some(s => s.includes('metric'))),
    hasCTA: !!(slide.explanation?.visualSignals?.some(s => s.includes('CTA')) || slide.explanation?.semanticSignals?.some(s => s.includes('CTA'))),
    meanBrightness: 150
  }), [slide.explanation])

  const ocrDone = slide.explanation && !slide.explanation.ocrPending
  const ocrDummy = useMemo(() => ({
    rawText: slide.explanation?.semanticSignals?.join(' ') || '',
    headings: slide.explanation?.semanticSignals?.filter(s => s.includes('heading')) || [],
    buttons: slide.explanation?.semanticSignals?.filter(s => s.includes('button')) || [],
    metrics: slide.explanation?.semanticSignals?.filter(s => s.includes('metric')) || [],
    labels: [],
    probableCTA: !!slide.explanation?.semanticSignals?.some(s => s.includes('CTA')),
    probablePageType: slide.explanation?.probablePageType || 'unknown',
    confidence: slide.explanation?.confidence || 0
  }), [slide.explanation])

  const signalAssessment = useMemo(() => {
    return buildSignalAssessment(slide.id, visualSignals, ocrDone ? ocrDummy : null, productContext)
  }, [slide.id, visualSignals, ocrDone, ocrDummy, productContext])

  return (
    <div className="h-full overflow-y-auto scrollbar-none p-3 pt-11 space-y-4">
      {/* Slide badge + role */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-[#9CA3AF]">{slideIndex + 1}/{totalSlides}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${theme.accent}20`, color: theme.accent }}>
            {slide.roleLabel}
          </span>
        </div>
        {slide.userAdjustedSpotlight && (
          <span className="text-[8px] bg-gray-50 border border-[#DDE0E8] text-[#6B7280] px-1.5 py-0.5 rounded-full">
            Focus customized
          </span>
        )}
      </div>

      {/* Role explanation */}
      <div className="px-2.5 py-2 rounded-xl bg-gray-50 border border-[#E5E7EC]">
        <p className="text-[9px] text-[#6B7280] leading-relaxed">{ROLE_EXPLANATIONS[slide.role] ?? ROLE_EXPLANATIONS.uncertain}</p>
      </div>

      {/* Why this role — expandable explainability */}
      {explanation && (
        <div className="rounded-xl border border-[#E5E7EC] overflow-hidden">
          <button
            onClick={() => setShowWhy(v => !v)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-[9.5px] font-semibold text-[#6B7280]">Why this role?</span>
            <div className="flex items-center gap-1.5">
              {explanation.ocrPending && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-pulse" />
              )}
              <span className="text-[9.5px] font-semibold text-[#6B7280]">
                {explanation.ocrPending ? 'Scanning signals...' : 'Signals extracted'}
              </span>
              <svg className={`w-3 h-3 text-[#9CA3AF] transition-transform ${showWhy ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
          </button>
          {showWhy && (
            <div className="px-2.5 pb-2.5 space-y-3 border-t border-[#E5E7EC] pt-2">
              {/* Certainty Badges */}
              <div>
                <p className="text-[8.5px] text-[#9CA3AF] uppercase tracking-wider mb-1.5">Certainty Badges</p>
                <div className="flex flex-wrap gap-1">
                  {signalAssessment.confidenceBadges.map((badge, idx) => (
                    <span key={idx} className="text-[8px] font-mono border border-[#DDE0E8] bg-gray-50 text-[#374151] px-1.5 py-0.5 rounded">
                      {badge}
                    </span>
                  ))}
                  {explanation.ocrPending && (
                    <span className="text-[8px] font-mono border border-amber-500/20 bg-amber-500/[0.02] text-amber-500 px-1.5 py-0.5 rounded animate-pulse">
                      Pending text analysis...
                    </span>
                  )}
                </div>
              </div>

              {/* Rationale & Progressive Updates */}
              <div>
                <p className="text-[8.5px] text-[#9CA3AF] uppercase tracking-wider mb-1">Signal Grounding</p>
                {explanation.ocrPending ? (
                  <div className="space-y-1 pt-0.5">
                    <p className="text-[9px] text-[#6B7280] leading-snug flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Visual layout signals detected
                    </p>
                    <p className="text-[9px] text-[#6B7280] leading-snug flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 animate-pulse" />
                      Extracting visible interface text...
                    </p>
                    <p className="text-[9px] text-[#6B7280] leading-snug flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Refining launch suggestions...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {signalAssessment.reasoning.map((r, i) => (
                      <p key={i} className="text-[9px] text-[#6B7280] leading-snug flex items-start gap-1">
                        <span className="text-[#9CA3AF] mt-[3px] flex-shrink-0">·</span>{r}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggested spotlight */}
      {(() => {
        const top = (slide.spotlightCandidates ?? []).find(c => c.confidence >= 0.44)
        if (!top) return null
        return (
          <div className="rounded-xl border border-[#E5E7EC] overflow-hidden">
            <div className="px-2.5 py-2 flex items-center justify-between">
              <span className="text-[9.5px] font-semibold text-[#6B7280]">Suggested focus area</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[8.5px] px-1.5 py-px rounded-full border border-[#E5E7EC] text-[#6B7280]">
                  {FOCUS_TYPE_LABELS[top.type]}
                </span>
                <span className={`text-[9px] font-mono ${top.confidence >= 0.65 ? 'text-emerald-500' : 'text-amber-400'}`}>
                  {Math.round(top.confidence * 100)}%
                </span>
              </div>
            </div>
            <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-[#E5E7EC]">
              {top.reasons.slice(0, 2).map((r, i) => (
                <p key={i} className="text-[9px] text-[#6B7280] leading-snug flex items-start gap-1 pt-1 first:pt-1.5">
                  <span className="text-[#6B7280] mt-px flex-shrink-0">·</span>{r}
                </p>
              ))}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => onApplySuggestion(top)}
                  className="flex-1 py-1 rounded-lg text-[9.5px] font-semibold border border-[#DDE0E8] text-[#111827] hover:bg-gray-100 hover:text-[#111827] transition-all"
                >
                  Apply suggestion
                </button>
                <button
                  onClick={onDismissSuggestion}
                  className="px-2.5 py-1 rounded-lg text-[9.5px] border border-[#E5E7EC] text-[#6B7280] hover:text-[#374151] transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
  intent, slides, assets, onUpdateSlides, onBack, productName, productContext,
}: {
  intent: StoryIntent
  slides: StorySlide[]
  assets: Record<string, StoryAsset>
  onUpdateSlides: React.Dispatch<React.SetStateAction<StorySlide[]>>
  onBack: () => void
  productName: string
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
  const [previousSlidesOrder, setPreviousSlidesOrder] = useState<StorySlide[] | null>(null)

  const launchTimeline = useMemo(() => {
    return generateLaunchTimeline(slides, productContext)
  }, [slides, productContext])

  const narrativeSuggestions = useMemo(() => {
    return generateNarrativeSuggestions(
      slides.map(s => ({
        id: s.id,
        role: s.role,
        title: s.title,
        ocrPageType: s.explanation?.probablePageType,
        ocrConfidence: s.explanation?.confidence,
        hasMetrics: !!(s.explanation?.visualSignals?.some(vs => vs.includes('metrics')) || s.explanation?.semanticSignals?.some(ss => ss.includes('metric'))),
        hasCTA: !!(s.explanation?.visualSignals?.some(vs => vs.includes('CTA')) || s.explanation?.semanticSignals?.some(ss => ss.includes('CTA')))
      })),
      productContext
    )
  }, [slides, productContext])

  const narrativeArc = useMemo(() => {
    return buildNarrativeArc(
      slides.map(s => ({ id: s.id, role: s.role, title: s.title, ocrPageType: s.explanation?.probablePageType })),
      intent
    )
  }, [slides, intent])

  const applyNarrativeSuggestion = (suggestion: NarrativeSuggestion) => {
    setPreviousSlidesOrder([...slides])
    const idOrder = suggestion.orderedSlideIds
    const sorted = [...slides].sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id))
    onUpdateSlides(sorted)
  }

  const undoNarrativeSuggestion = () => {
    if (!previousSlidesOrder) return
    onUpdateSlides(previousSlidesOrder)
    setPreviousSlidesOrder(null)
  }
  const [viewportSize,   setViewportSize]   = useState({ width: 0, height: 0 })

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const activeSlide = slides[activeIndex] ?? slides[0]
  const theme       = THEMES[themeIndex] ?? THEMES[0]

  const activeAsset = activeSlide ? assets[activeSlide.assetId] : null
  const imageDimensions = activeAsset && activeAsset.status === 'ready'
    ? { width: activeAsset.width, height: activeAsset.height }
    : null

  // Terminate OCR worker pool when leaving the builder to free background threads
  useEffect(() => {
    return () => { terminateAllWorkers().catch(() => {}) }
  }, [])

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

  // Compute launch strategy + narrative arc once all OCR completes


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
    setPreviousSlidesOrder(null) // manual reorder invalidates suggestion undo
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
      productName,
      slides: slides.map(s => ({
        id: s.id,
        assetId: s.assetId,
        role: s.role,
        roleLabel: s.roleLabel,
        confidence: s.confidence,
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
  }, [activeSlide, activeAsset, assets, slides, intent, themeIndex, frameType, padding, productName, activeIndex, navigate])

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
                  <p className="text-[8px] text-[#6B7280] mt-0.5 leading-snug">Suggested order — drag arrows to reorder</p>
                </div>
                {slides.length >= 3 && narrativeSuggestions.length > 0 ? (
                  <div className="px-2 mb-3 mt-1 space-y-1.5 border border-[#E5E7EC] bg-white p-2 rounded-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-[8px] font-bold text-[#6B7280] uppercase tracking-wider">Suggested Flows</p>
                      {previousSlidesOrder && (
                        <button
                          onClick={undoNarrativeSuggestion}
                          className="text-[7.5px] font-bold text-amber-400 hover:text-amber-300 border border-amber-400/20 px-1 py-0.5 rounded transition-all"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {narrativeSuggestions.map(sug => {
                        const differs = sug.orderedSlideIds.some((id, idx) => id !== slides[idx]?.id)
                        return (
                          <div key={sug.id} className="p-1.5 rounded-lg border border-[#E5E7EC] bg-white flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-bold text-[#111827]">{sug.label}</span>
                              {differs ? (
                                <button
                                  onClick={() => applyNarrativeSuggestion(sug)}
                                  className="text-[7.5px] font-bold bg-gray-50 text-[#374151] hover:text-[#111827] border border-[#DDE0E8] px-1 py-0.5 rounded transition-all"
                                >
                                  Apply
                                </button>
                              ) : (
                                <span className="text-[7.5px] text-emerald-500 font-mono">Active</span>
                              )}
                            </div>
                            <p className="text-[8px] text-[#6B7280] leading-normal">{sug.description}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  slides.length < 3 && (
                    <div className="px-2 py-2 mb-2 border border-[#E5E7EC] bg-gray-50 rounded-xl text-center">
                      <p className="text-[8px] text-[#6B7280]">Not enough slides for narrative sequencing (requires 3+)</p>
                    </div>
                  )
                )}
                {slides.map((slide, i) => {
                  const getArcPos = (): NarrativePosition => {
                    const ROLE_TO_POSITION: Record<StoryRole, NarrativePosition> = {
                      intro:     'opening',
                      context:   'opening',
                      feature:   'explanation',
                      process:   'explanation',
                      output:    'proof',
                      cta:       'conversion',
                      uncertain: 'flexible',
                    }
                    return ROLE_TO_POSITION[slide.role] ?? 'flexible'
                  }
                  return (
                    <SlideListItem
                      key={slide.id}
                      slide={slide}
                      index={i}
                      total={slides.length}
                      isActive={i === activeIndex}
                      accentColor={intent.color}
                      arcPosition={getArcPos()}
                      onClick={() => setActiveIndex(i)}
                      onMoveUp={() => moveSlide(i, -1)}
                      onMoveDown={() => moveSlide(i, 1)}
                    />
                  )
                })}
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
                  productContext={productContext}
                  totalSlides={slides.length}
                  theme={theme}
                  padding={padding}
                  onUpdateTitle={v => updateSlide(activeIndex, { title: v })}
                  onUpdateCallout={v => updateSlide(activeIndex, { callout: v })}
                  onClearSelection={() => updateSlide(activeIndex, { selection: null })}
                  onPaddingChange={setPadding}
                  onUpdateCallouts={callouts => updateSlide(activeIndex, { callouts })}
                  onApplySuggestion={c => updateSlide(activeIndex, {
                    selection: { x: c.x, y: c.y, w: c.width, h: c.height },
                    spotlightCandidates: [],
                  })}
                  onDismissSuggestion={() => updateSlide(activeIndex, { spotlightCandidates: [] })}
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
            productName={productName}
            onClose={() => setShowExport(false)}
            launchStrategy={launchStrategy}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Pixel Signal Analyzer (heuristic, not semantic) ─────────────────────────
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

// ─── Suggested Sequencer — reorder slides by signal score, apply template copy ─
function sequenceStory(
  slides: StorySlide[],
  assets: Record<string, StoryAsset>,
  intent: StoryIntent
): StorySlide[] {
  const tplSlides = intent.slides
  const mappedSlides = slides.map((slide, i) => {
    const asset = assets[slide.assetId]
    if (!asset || asset.status !== 'ready' || !asset.decodedImage) return slide

    const analysis = analyzeScreenshot(asset.decodedImage)
    
    // Heuristic Scoring formula
    let score = 0
    if (analysis.hasCTA) score += 3
    if (analysis.hasMetrics) score += 3
    if (analysis.uiComplexity > 0.4) score += 2
    if (analysis.textDensity < 0.25) score += 1

    let bestFitRole: StoryRole = 'uncertain'
    if (analysis.hasCTA || score >= 5) {
      bestFitRole = 'cta'
    } else if (analysis.hasMetrics || score >= 3) {
      bestFitRole = 'output'
    } else if (analysis.uiComplexity > 0.4) {
      bestFitRole = 'feature'
    } else if (analysis.textDensity > 0.35) {
      bestFitRole = 'process'
    } else if (analysis.textDensity < 0.25) {
      bestFitRole = 'intro'
    } else {
      bestFitRole = 'context'
    }

    const confidence = Math.round((0.65 + score * 0.05) * 100) / 100
    const explanation = buildVisualOnlyExplanation(analysis)

    return {
      ...slide,
      role: bestFitRole,
      confidence,
      explanation: { ...explanation, assignedRole: bestFitRole },
    }
  })

  // Sort slides according to standard Story Graph order:
  // intro -> context -> feature -> process -> output -> cta -> uncertain
  const ROLE_ORDER: Record<StoryRole, number> = {
    intro: 0,
    context: 1,
    feature: 2,
    process: 3,
    output: 4,
    cta: 5,
    uncertain: 6
  }

  const sortedSlides = [...mappedSlides].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])

  // Apply titles & templates based on intent slides
  return sortedSlides.map((slide, i) => {
    // Pick corresponding template slide text
    const tpl = tplSlides[i] ?? tplSlides[tplSlides.length - 1] ?? { defaultTitle: '', defaultCallout: '', label: '' }
    
    return {
      ...slide,
      title: tpl.defaultTitle || 'Launch slide ' + (i + 1),
      callout: tpl.defaultCallout || 'Feature',
      roleLabel: tpl.label || 'Step ' + (i + 1),
    }
  })
}

// ─── Root page ────────────────────────────────────────────────────────────────

export function StoryModePage() {
  const [step,        setStep]        = useState<StoryStep>('intent')
  const [intent,      setIntent]      = useState<StoryIntent | null>(null)
  const [slides,      setSlides]      = useState<StorySlide[]>([])
  const [assets,      setAssets]      = useState<Record<string, StoryAsset>>({})
  const [productName, setProductName] = useState('')
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
        setProductContext(workspace.context)
        setProductName(workspace.context.productName)
        
        const restoredIntent = STORY_INTENTS.find(i => i.id === (workspace as any).intentId) || STORY_INTENTS[0]
        setIntent(restoredIntent)
        setSlides(workspace.slides)
        
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

  // 2a. Metadata-only autosave (3s debounce) — triggered by slide text edits, no binary writes
  useEffect(() => {
    if (step !== 'builder' || !productContext || slides.length === 0) return

    const wsId = productContext.productName.replace(/\s+/g, '-').toLowerCase() || 'draft-workspace'
    const ws: LaunchWorkspace = {
      id: wsId, createdAt: Date.now(), updatedAt: Date.now(),
      context: productContext, slides, exports: [], narrativeSuggestions: [], versions: [],
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

    const wsId = productContext.productName.replace(/\s+/g, '-').toLowerCase() || 'draft-workspace'
    const ws: LaunchWorkspace = {
      id: wsId, createdAt: Date.now(), updatedAt: Date.now(),
      context: productContext, slides, exports: [], narrativeSuggestions: [], versions: [],
      intentId: intent?.id || 'feature-launch',
    } as any

    saveWorkspaceToDB(ws, newAssetFiles).then(() => {
      for (const id of Object.keys(newAssetFiles)) savedAssetIdsRef.current.add(id)
    }).catch(err => console.warn('Workspace asset save failed', err))
  }, [assets, step]) // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => {
    if (step !== 'builder' || !intent || slides.length === 0) return

    const allReady = slides.every(slide => {
      const asset = assets[slide.assetId]
      return asset && asset.status === 'ready'
    })

    const needsSequencing = slides.some(slide => slide.confidence === 0)

    if (allReady && needsSequencing) {
      setSlides(prev => sequenceStory(prev, assets, intent))
    }
  }, [assets, slides, step, intent])

  // Async OCR enhancement — runs after visual-only sequencing, upgrades explanations with text signals
  const readyAssetCount = Object.values(assets).filter(a => a.status === 'ready').length

  useEffect(() => {
    if (step !== 'builder') return
    if (readyAssetCount === 0) return
    const pendingSlides = slides.filter(s => s.explanation?.ocrPending === true)
    if (pendingSlides.length === 0) return

    let cancelled = false

    const runOCR = async () => {
      for (const slide of pendingSlides) {
        if (cancelled) break
        const asset = assets[slide.assetId]
        if (!asset || asset.status !== 'ready') continue

        try {
          const ocr = await analyzeImageOCR(asset.objectUrl)
          if (cancelled) break

          // Spotlight detection — non-blocking, uses OCR context
          const focusCandidates = await detectSemanticFocus(asset.objectUrl, ocr)
          if (cancelled) break

          // Re-compute visual signals for this slide to build hybrid explanation
          const imgForAnalysis = asset.decodedImage
          if (!imgForAnalysis) continue
          const visual = analyzeScreenshot(imgForAnalysis)
          const hybridExplanation = buildHybridExplanation(ocr, visual)

          setSlides(prev => prev.map(s =>
            s.id === slide.id
              ? {
                  ...s,
                  explanation: { ...hybridExplanation, assignedRole: s.role },
                  spotlightCandidates: focusCandidates,
                }
              : s
          ))
        } catch {
          // OCR or spotlight failure — leave existing visual-only explanation in place
        }
      }
    }

    runOCR()
    return () => { cancelled = true }
  }, [step, slides.length, readyAssetCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge restore — runs once on mount when returning from editor
  useEffect(() => {
    if (!hasReturnData()) return
    const returnedSlide = loadReturnFromEditor()
    const bridgeState = loadBridgeFromStory()
    if (!bridgeState || !returnedSlide) return

    const { session } = bridgeState
    const restoredIntent = STORY_INTENTS.find(i => i.id === session.intentId)
    if (!restoredIntent) return

    const restoredSlides: StorySlide[] = session.slides.map(s => {
      if (s.id === bridgeState.sourceSlide.slideId) {
        return {
          ...s,
          role: returnedSlide.role,
          roleLabel: returnedSlide.roleLabel,
          title: returnedSlide.title,
          callout: returnedSlide.callout,
          selection: returnedSlide.selection,
          confidence: s.confidence,
        }
      }
      return s
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
    setProductName(session.productName)
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

function ContextStep({
  intent,
  onBack,
  onContinue,
}: {
  intent: StoryIntent
  onBack: () => void
  onContinue: (context: ProductContext) => void
}) {
  const [productName, setProductName] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [audience, setAudience] = useState('')
  const [primaryCTA, setPrimaryCTA] = useState('Try it free')
  const [tone, setTone] = useState<ProductTone>('founder')
  const [launchGoal, setLaunchGoal] = useState<LaunchGoal>('product-launch')
  const [productType, setProductType] = useState<ProductType>('saas')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Handle auto-inference
  const handleDescriptionChange = (text: string) => {
    setShortDescription(text)
    if (text.length > 5) {
      const presets = inferPresetsFromDescription(text)
      setTone(presets.tone)
      setLaunchGoal(presets.launchGoal)
      setProductType(presets.productType)
    }
  }

  const handleNext = () => {
    onContinue({
      productName: productName.trim() || 'our product',
      shortDescription: shortDescription.trim() || 'a new release',
      audience: audience.trim() || undefined,
      launchGoal,
      tone,
      productType,
      primaryCTA: primaryCTA.trim() || undefined
    })
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex flex-col">
      <header className="flex items-center gap-3 px-6 h-14 border-b border-[#E5E7EC] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#111827] transition-colors text-xs">
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none"><path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>
        <span className="text-[#D1D5DB]">·</span>
        <span className="text-sm font-bold tracking-tight text-[#111827]"><span className="text-accent">Shot</span>Polish</span>
        <span className="text-[9px] text-[#6B7280] border border-[#E5E7EC] px-1.5 py-0.5 rounded-full ml-1">Launch Context</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#DDE0E8] bg-gray-50 text-[11px] text-[#6B7280] mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Step 2 of 4 — Ground your launch context
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#111827]">Grounded Context Setup</h2>
            <p className="mt-2 text-sm text-[#6B7280] leading-relaxed">
              Tell us what you're launching. User context is always weighted highest to generate structurally original stories and captions without guessing.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="e.g. Notion, Linear, ShotPolish..."
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">What are you launching? (Single sentence)</label>
              <textarea
                value={shortDescription}
                onChange={e => handleDescriptionChange(e.target.value)}
                placeholder="e.g. We built a developer analytics dashboard for tracking API reliability..."
                className="w-full h-24 px-3 py-2.5 text-sm rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Type (Inferred)</label>
                <select
                  value={productType}
                  onChange={e => setProductType(e.target.value as ProductType)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#DDE0E8] bg-white text-[#111827] outline-none focus:border-[#C5CAD8] transition-colors"
                >
                  <option value="saas">SaaS platform</option>
                  <option value="developer-tool">Dev tool</option>
                  <option value="consumer-app">Consumer app</option>
                  <option value="ai-product">AI Product</option>
                  <option value="fintech">Fintech tool</option>
                  <option value="design-tool">Design utility</option>
                  <option value="analytics">Analytics tool</option>
                  <option value="other">General product</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Tone (Inferred)</label>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value as ProductTone)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#DDE0E8] bg-white text-[#111827] outline-none focus:border-[#C5CAD8] transition-colors"
                >
                  <option value="founder">Founder (Standard)</option>
                  <option value="technical">Technical (Builders)</option>
                  <option value="minimal">Minimal (Sleek)</option>
                  <option value="bold">Bold (Hype)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Launch Goal (Inferred)</label>
                <select
                  value={launchGoal}
                  onChange={e => setLaunchGoal(e.target.value as LaunchGoal)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-[#DDE0E8] bg-white text-[#111827] outline-none focus:border-[#C5CAD8] transition-colors"
                >
                  <option value="product-launch">Major Launch</option>
                  <option value="feature-launch">New Feature</option>
                  <option value="beta">Beta Release</option>
                  <option value="redesign">Redesign/Revamp</option>
                  <option value="growth-update">Growth/Milestone</option>
                </select>
              </div>
            </div>

            {/* Advanced toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="text-xs text-[#6B7280] hover:text-[#111827] flex items-center gap-1.5 transition-colors pt-2"
              >
                {showAdvanced ? 'Hide advanced details' : 'Want better launch suggestions? Add audience + CTA.'}
                <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-3 border-t border-[#E5E7EC] mt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Target Audience</label>
                    <input
                      type="text"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="e.g. backend developers, marketing teams, SaaS founders..."
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] mb-1.5">Primary CTA Link or Copy</label>
                    <input
                      type="text"
                      value={primaryCTA}
                      onChange={e => setPrimaryCTA(e.target.value)}
                      placeholder="e.g. fiora.io/launch, Get started free..."
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#DDE0E8] bg-gray-50 text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#C5CAD8] transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex items-center justify-center gap-4">
            <button
              onClick={handleNext}
              disabled={!productName.trim() || !shortDescription.trim()}
              className="flex items-center gap-2 px-10 py-3 rounded-xl text-sm font-bold bg-[#e7e9ea] text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100"
            >
              Continue to Upload
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

  const handleContinue = (newSlides: StorySlide[], initialAssets: Record<string, StoryAsset>, name: string) => {
    setSlides(newSlides)
    setAssets(initialAssets)
    setProductName(name)
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
          onSelect={i => { setIntent(i); setStep('context') }}
        />
      </div>
    )
  }

  if (step === 'context') {
    return (
      <ContextStep
        intent={intent!}
        onBack={() => setStep('intent')}
        onContinue={(ctx) => {
          setProductContext(ctx)
          setProductName(ctx.productName)
          setStep('upload')
        }}
      />
    )
  }

  if (step === 'upload') {
    return (
      <UploadStep
        intent={intent!}
        onBack={() => setStep('context')}
        onContinue={handleContinue}
        createSessionObjectUrl={createSessionObjectUrl}
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
      productName={productName}
      productContext={productContext}
    />
  )
}
