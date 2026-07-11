import { describe, it, expect } from 'vitest'
import { drawWatermark } from './composition'
import type { Rect } from './composition'

// Records which 2D-context methods were called. Only the members drawWatermark touches are implemented.
function mockCtx() {
  const calls: string[] = []
  const colored: string[] = []
  let currentFill = ''
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillText: (t: string) => {
      calls.push(`fillText:${t}`)
      colored.push(`${currentFill}|${t}`)
    },
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath: () => calls.push('beginPath'),
    roundRect: () => calls.push('roundRect'),
    fill: () => calls.push('fill'),
    fillRect: () => calls.push('fillRect'),
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    set fillStyle(v: string) { currentFill = v },
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls, colored }
}

const wm: Rect = { x: 100, y: 100, w: 80, h: 20 }

describe('drawWatermark', () => {
  it('draws the violet "S" mark tile', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(calls).toContain('fillText:S')
  })

  it('renders the ShotPolish wordmark with an accented "Shot" segment', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    // Line 1 is drawn as three segments so "Shot" can render in the accent color.
    expect(calls).toContain('fillText:Made with ')
    expect(calls).toContain('fillText:Shot')
    expect(calls).toContain('fillText:Polish')
  })

  it('colors the "Shot" segment with the accent and the rest white', () => {
    const { ctx, colored } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    expect(colored).toContain('rgba(255,255,255,0.92)|Made with ')
    expect(colored).toContain('#a78bfa|Shot')
    expect(colored).toContain('rgba(255,255,255,0.92)|Polish')
  })

  it('draws the mark by default (opts undefined)', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, undefined)
    expect(calls).toContain('fillText:S')
    expect(calls).toContain('fillText:Shot')
  })

  it('bakes the remix url into the badge when provided', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true, remixUrl: 'shotpolish.org/r/launch-indigo' })
    expect(calls).toContain('fillText:shotpolish.org/r/launch-indigo')
  })

  it('omits the second line when no remix url is given', () => {
    const { ctx, calls } = mockCtx()
    drawWatermark(ctx, wm, 1200, 800, { watermark: true })
    const urlLines = calls.filter(c => c.startsWith('fillText:shotpolish'))
    expect(urlLines).toEqual([])
  })

  it('draws the pill background', () => {
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
