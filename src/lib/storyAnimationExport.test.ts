import { describe, it, expect } from 'vitest'
import { buildFrameSequence } from './storyAnimationExport'

describe('buildFrameSequence', () => {
  it('returns empty array for 0 slides', () => {
    expect(buildFrameSequence(0).length).toBe(0)
  })

  it('produces correct frame count for 1 slide (no crossfade)', () => {
    const frames = buildFrameSequence(1)
    // 1.5s × 30fps = 45 frames
    expect(frames.length).toBe(45)
  })

  it('produces correct frame count for 2 slides (one crossfade)', () => {
    const frames = buildFrameSequence(2)
    // 45 slide + 8 crossfade + 45 slide = 98 frames  (0.25 × 30 = 7.5 → 8)
    expect(frames.length).toBe(98)
  })

  it('first frame is a slide frame at progress 0', () => {
    const frames = buildFrameSequence(2)
    expect(frames[0].type).toBe('slide')
    expect(frames[0].slideIndex).toBe(0)
    expect(frames[0].localProgress).toBe(0)
  })

  it('last slide frame has localProgress 1', () => {
    const frames = buildFrameSequence(2)
    // frame 44 is the last frame of slide 0 (0-indexed)
    expect(frames[44].type).toBe('slide')
    expect(frames[44].localProgress).toBeCloseTo(1.0, 5)
  })

  it('first crossfade frame has crossfadeAlpha 1 and nextSlideProgress 0', () => {
    const frames = buildFrameSequence(2)
    const cf = frames[45]
    expect(cf.type).toBe('crossfade')
    expect(cf.slideIndex).toBe(0)
    expect(cf.nextSlideIndex).toBe(1)
    expect(cf.crossfadeAlpha).toBeCloseTo(1.0, 5)
    expect(cf.nextSlideProgress).toBe(0)
  })

  it('last crossfade frame dissolves to fully opaque but keeps the incoming slide un-revealed', () => {
    const frames = buildFrameSequence(2)
    const cf = frames[52]   // last crossfade frame (index 45+7 = 52)
    expect(cf.type).toBe('crossfade')
    // Outgoing slide has fully dissolved away (incoming is fully opaque).
    expect(cf.crossfadeAlpha).toBeCloseTo(0.0, 1)
    // Incoming slide must NOT have started its reveal during the crossfade —
    // otherwise it reaches mp=1.0 here then resets to 0 on its own first frame,
    // producing a one-frame flash (see flicker RCA). It reveals once, in its own frames.
    expect(cf.nextSlideProgress).toBe(0)
  })

  it('renders each slide with monotonically non-decreasing motionProgress (no flicker)', () => {
    // Reconstruct, per slide, the sequence of motionProgress values it is rendered at
    // across the whole timeline. A flicker is a non-monotonic dip (e.g. 1.0 -> 0).
    for (const slideCount of [2, 3, 5]) {
      const frames = buildFrameSequence(slideCount)
      const perSlide: Record<number, number[]> = {}
      for (const f of frames) {
        ;(perSlide[f.slideIndex] ??= []).push(f.localProgress)
        if (f.type === 'crossfade') {
          ;(perSlide[f.nextSlideIndex!] ??= []).push(f.nextSlideProgress ?? 0)
        }
      }
      for (const [slideIndex, seq] of Object.entries(perSlide)) {
        for (let i = 1; i < seq.length; i++) {
          expect(
            seq[i],
            `slide ${slideIndex} motionProgress dipped at step ${i}: ${seq[i - 1]} -> ${seq[i]} (slideCount=${slideCount})`,
          ).toBeGreaterThanOrEqual(seq[i - 1] - 1e-9)
        }
      }
    }
  })

  it('next slide starts after crossfade', () => {
    const frames = buildFrameSequence(2)
    const firstSlide2 = frames[53]
    expect(firstSlide2.type).toBe('slide')
    expect(firstSlide2.slideIndex).toBe(1)
    expect(firstSlide2.localProgress).toBe(0)
  })

  it('last frame of a 2-slide story is slide 1 at progress 1', () => {
    const frames = buildFrameSequence(2)
    const last = frames[frames.length - 1]
    expect(last.type).toBe('slide')
    expect(last.slideIndex).toBe(1)
    expect(last.localProgress).toBeCloseTo(1.0, 5)
  })
})
