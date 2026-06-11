import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export interface GifEncoderHandle {
  /** Quantize one RGBA frame and append it. `rgba` length must be w*h*4. */
  addFrame(rgba: Uint8ClampedArray, width: number, height: number, delay: number): void
  /** Finalize and return the complete GIF byte stream. */
  finish(): Uint8Array
}

export function createGifEncoder(): GifEncoderHandle {
  const gif = GIFEncoder()
  return {
    addFrame(rgba, width, height, delay) {
      const palette = quantize(rgba, 256)
      const index = applyPalette(rgba, palette)
      gif.writeFrame(index, width, height, { palette, delay })
    },
    finish() {
      gif.finish()
      return gif.bytesView()
    },
  }
}
