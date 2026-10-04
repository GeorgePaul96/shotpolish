import { describe, it, expect } from 'vitest'
import { fitWithin, coverCrop, MAX_EDGE } from './image'

describe('fitWithin', () => {
  it('keeps small images', () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }))
  it('scales the long edge to MAX_EDGE', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_EDGE, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: MAX_EDGE })
  })
})

describe('coverCrop', () => {
  it('crops the sides of a wide source', () => expect(coverCrop(2000, 1000, 400, 500)).toEqual({ sx: 600, sy: 0, sw: 800, sh: 1000 }))
  it('crops top/bottom of a tall source', () => expect(coverCrop(1000, 2000, 400, 500)).toEqual({ sx: 0, sy: 375, sw: 1000, sh: 1250 }))
  it('uses the whole source when ratios match', () => expect(coverCrop(800, 1000, 400, 500)).toEqual({ sx: 0, sy: 0, sw: 800, sh: 1000 }))
})
