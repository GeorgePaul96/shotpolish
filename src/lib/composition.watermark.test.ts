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
    drawWatermark(ctx, wm, 1200, undefined)
    expect(calls).toContain('fillText:ShotPolish')
  })

  it('draws the mark when watermark is explicitly true', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, { watermark: true })
    expect(calls).toContain('fillText:ShotPolish')
  })

  it('draws nothing when watermark is false', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, { watermark: false })
    expect(calls).toEqual([])
  })
})
