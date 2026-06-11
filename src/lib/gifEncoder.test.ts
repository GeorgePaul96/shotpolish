import { describe, it, expect } from 'vitest'
import { createGifEncoder } from './gifEncoder'

// Builds a flat opaque-red RGBA buffer of w*h pixels.
function redFrame(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255
  }
  return buf
}

describe('createGifEncoder', () => {
  it('produces a valid GIF byte stream with the GIF89a header', () => {
    const enc = createGifEncoder()
    enc.addFrame(redFrame(4, 4), 4, 4, 100)
    enc.addFrame(redFrame(4, 4), 4, 4, 100)
    const bytes = enc.finish()
    expect(bytes.length).toBeGreaterThan(6)
    // "GIF89a" magic
    const header = String.fromCharCode(...bytes.slice(0, 6))
    expect(header).toBe('GIF89a')
  })

  it('encodes multiple frames without throwing', () => {
    const enc = createGifEncoder()
    for (let i = 0; i < 5; i++) enc.addFrame(redFrame(8, 8), 8, 8, 80)
    expect(() => enc.finish()).not.toThrow()
  })
})
