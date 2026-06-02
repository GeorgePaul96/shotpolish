/// <reference lib="dom" />
import {
  THEMES,
  computeLayout,
  renderComposition,
  type FrameType,
  type Selection,
  type Callout,
  type StoryRole,
} from './composition'
import { SOCIAL_FORMATS } from './socialFormats'
import { exportMotionVideo, type ExportResult, type ExportProgress } from './motionExport'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIDE_DURATION_S  = 1.5
const CROSSFADE_S       = 0.25
const FPS               = 30
const OVERLAP_START     = 0.75  // next slide animation begins at 75% of crossfade

// ── Public types ─────────────────────────────────────────────────────────────

export interface FrameSpec {
  type: 'slide' | 'crossfade'
  slideIndex: number
  localProgress: number
  crossfadeAlpha?: number      // opacity of outgoing slide (1→0); only on crossfade frames
  nextSlideIndex?: number      // only on crossfade frames
  nextSlideProgress?: number   // motionProgress for incoming slide; only on crossfade frames
}

// Minimal interface — structurally compatible with StorySlide from StoryModePage.
// Using a local interface avoids importing from a page file into a lib.
export interface AnimSlide {
  id: string
  assetId: string
  role: StoryRole
  title: string
  callout: string
  selection: Selection | null
  callouts?: Callout[]
}

export interface AnimAsset {
  decodedImage: HTMLImageElement | null
  width: number
  height: number
  status: 'loading' | 'ready' | 'error'
}

export interface StoryAnimConfig {
  formatId: string
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
}

// ── buildFrameSequence ────────────────────────────────────────────────────────

export function buildFrameSequence(
  slideCount: number,
  fps: number = FPS,
  slideDurationS: number = SLIDE_DURATION_S,
  crossfadeDurationS: number = CROSSFADE_S,
): FrameSpec[] {
  const spf = Math.round(slideDurationS * fps)    // frames per slide
  const cpf = Math.round(crossfadeDurationS * fps) // frames per crossfade
  const frames: FrameSpec[] = []

  for (let si = 0; si < slideCount; si++) {
    for (let f = 0; f < spf; f++) {
      frames.push({
        type: 'slide',
        slideIndex: si,
        localProgress: spf > 1 ? f / (spf - 1) : 1.0,
      })
    }
    if (si < slideCount - 1) {
      for (let f = 0; f < cpf; f++) {
        const t = cpf > 1 ? f / (cpf - 1) : 1.0
        frames.push({
          type: 'crossfade',
          slideIndex: si,
          localProgress: 1.0,
          crossfadeAlpha: 1.0 - t,
          nextSlideIndex: si + 1,
          nextSlideProgress: Math.max(0, (t - OVERLAP_START) / (1 - OVERLAP_START)),
        })
      }
    }
  }

  return frames
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  slide: AnimSlide,
  asset: AnimAsset,
  motionProgress: number,
  config: StoryAnimConfig,
): void {
  if (!asset.decodedImage) return
  const theme = THEMES[config.themeIndex] ?? THEMES[0]
  const L = computeLayout(
    asset.width,
    asset.height,
    config.padding,
    slide.title,
    config.formatId,
    config.frameType,
  )
  if (canvas.width !== L.compW || canvas.height !== L.compH) {
    canvas.width  = L.compW
    canvas.height = L.compH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  renderComposition(ctx, asset.decodedImage, theme, {
    id: slide.id,
    formatId: config.formatId,
    themeIndex: config.themeIndex,
    padding: config.padding,
    shadowOpacity: config.shadowOpacity,
    frameType: config.frameType,
    role: slide.role,
    headline:   { text: slide.title,   visible: !!slide.title   },
    screenshot: {
      imageUrl:     null,
      naturalWidth:  asset.width,
      naturalHeight: asset.height,
      visible:       true,
      selection:     slide.selection ?? null,
      callout:       { text: slide.callout, visible: !!slide.callout },
      callouts:      slide.callouts ?? [],
    },
  }, L, motionProgress)
}

// Two offscreen canvases allocated once and reused across frames.
let _offA: HTMLCanvasElement | null = null
let _offB: HTMLCanvasElement | null = null
function offscreens(): [HTMLCanvasElement, HTMLCanvasElement] {
  if (!_offA) _offA = document.createElement('canvas')
  if (!_offB) _offB = document.createElement('canvas')
  return [_offA, _offB]
}

// ── renderStoryFrame ──────────────────────────────────────────────────────────

export function renderStoryFrame(
  spec: FrameSpec,
  slides: AnimSlide[],
  assets: Record<string, AnimAsset>,
  canvas: HTMLCanvasElement,
  config: StoryAnimConfig,
): void {
  const fmt = SOCIAL_FORMATS[config.formatId]
  if (!fmt || fmt.width === 0) return   // free format not supported for animation

  if (canvas.width !== fmt.width || canvas.height !== fmt.height) {
    canvas.width  = fmt.width
    canvas.height = fmt.height
  }

  if (spec.type === 'slide') {
    const slide = slides[spec.slideIndex]
    const asset = assets[slide.assetId]
    if (asset?.decodedImage) renderSlideToCanvas(canvas, slide, asset, spec.localProgress, config)
    return
  }

  // Crossfade: draw outgoing slide at full opacity, draw incoming on top with rising alpha.
  const [offA, offB] = offscreens()
  const slideA = slides[spec.slideIndex]
  const assetA = assets[slideA.assetId]
  if (assetA?.decodedImage) renderSlideToCanvas(offA, slideA, assetA, 1.0, config)

  const slideB = slides[spec.nextSlideIndex!]
  const assetB = assets[slideB.assetId]
  if (assetB?.decodedImage) renderSlideToCanvas(offB, slideB, assetB, spec.nextSlideProgress ?? 0, config)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.globalAlpha = 1.0
  if (offA.width > 0) ctx.drawImage(offA, 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 1.0 - (spec.crossfadeAlpha ?? 1.0)  // incoming slide opacity
  if (offB.width > 0) ctx.drawImage(offB, 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 1.0
}

// ── exportStoryAsVideo ────────────────────────────────────────────────────────

export async function exportStoryAsVideo(
  slides: AnimSlide[],
  assets: Record<string, AnimAsset>,
  config: StoryAnimConfig,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const fmt = SOCIAL_FORMATS[config.formatId]
  if (!fmt || fmt.width === 0) throw new Error('Animated export requires a fixed social format (not "free").')

  const frameSeq    = buildFrameSequence(slides.length)
  const totalFrames = frameSeq.length

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width  = fmt.width
  exportCanvas.height = fmt.height

  const renderFrame = (progress: number) => {
    const fi = Math.min(Math.round(progress * (totalFrames - 1)), totalFrames - 1)
    renderStoryFrame(frameSeq[fi], slides, assets, exportCanvas, config)
  }

  return exportMotionVideo(exportCanvas, totalFrames, FPS, renderFrame, onProgress, signal)
}
