/// <reference lib="webworker" />
import { createGifEncoder, type GifEncoderHandle } from '../lib/gifEncoder'

type InMsg =
  | { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; delay: number; total: number }
  | { type: 'finish' }

export type OutMsg =
  | { type: 'progress'; written: number; total: number }
  | { type: 'done'; gif: ArrayBuffer }
  | { type: 'error'; message: string }

let encoder: GifEncoderHandle | null = null
let written = 0

const post = (msg: OutMsg, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? [])

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    if (msg.type === 'frame') {
      if (!encoder) { encoder = createGifEncoder(); written = 0 }
      const rgba = new Uint8ClampedArray(msg.rgba)
      encoder.addFrame(rgba, msg.width, msg.height, msg.delay)
      written++
      post({ type: 'progress', written, total: msg.total })
    } else if (msg.type === 'finish') {
      if (!encoder) { post({ type: 'done', gif: new Uint8Array().buffer }); return }
      const bytes = encoder.finish()
      // Copy into a fresh ArrayBuffer so we can transfer it cleanly.
      const out = bytes.slice().buffer
      encoder = null
      written = 0
      post({ type: 'done', gif: out }, [out])
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
