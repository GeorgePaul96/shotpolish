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
