import { describe, it, expect } from 'vitest'
import { buildFrameSequence } from './storyAnimationExport'

describe('buildFrameSequence', () => {
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

  it('last crossfade frame has crossfadeAlpha ~0 and nextSlideProgress ~1', () => {
    const frames = buildFrameSequence(2)
    const cf = frames[52]   // last crossfade frame (index 45+7 = 52)
    expect(cf.type).toBe('crossfade')
    expect(cf.crossfadeAlpha).toBeCloseTo(0.0, 1)
    expect(cf.nextSlideProgress).toBeCloseTo(1.0, 1)
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
