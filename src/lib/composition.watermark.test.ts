import { describe, it, expect } from 'vitest'
import { drawWatermark } from './composition'
import type { Rect } from './composition'

// Records which 2D-context methods were called. Only the members drawWatermark touches are implemented.
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillText: (t: string) => calls.push(`fillText:${t}`),
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath: () => calls.push('beginPath'),
    roundRect: () => calls.push('roundRect'),
    fill: () => calls.push('fill'),
    fillRect: () => calls.push('fillRect'),
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set fillStyle(_v: string) {},
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const wm: Rect = { x: 100, y: 100, w: 80, h: 20 }

describe('drawWatermark', () => {
  it('draws the ShotPolish mark when watermark is on (default)', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, undefined)
    expect(calls).toContain('fillText:Made with ShotPolish')
  })

  it('draws the mark when watermark is explicitly true', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(calls).toContain('fillText:Made with ShotPolish')
  })

  it('bakes the remix url into the badge when provided', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true, remixUrl: 'shotpolish.app/r/launch-indigo' })
    expect(calls).toContain('fillText:Made with ShotPolish')
    expect(calls).toContain('fillText:shotpolish.app/r/launch-indigo')
  })

  it('draws a pill background', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(calls).toContain('roundRect')
  })

  it('draws nothing when watermark is false', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: false })
    expect(calls).toEqual([])
  })
})
