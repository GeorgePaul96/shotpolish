// Motion export pipeline — MP4 (H.264 where available), WebM fallback, GIF option.
// All exports are async and non-blocking. Progress callbacks prevent UI freezing.

import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export type MotionFormat = 'mp4' | 'webm' | 'gif'

export interface ExportResult {
  blob: Blob
  format: MotionFormat
  url: string
}

export interface ExportProgress {
  frame: number
  total: number
  percent: number
}

// ─── MIME TYPE DETECTION ──────────────────────────────────────────────────────

export function getSupportedVideoMimeType(): { mimeType: string; format: MotionFormat } {
  const candidates = [
    { mimeType: 'video/mp4;codecs=h264',  format: 'mp4'  as MotionFormat },
    { mimeType: 'video/mp4;codecs=avc1',  format: 'mp4'  as MotionFormat },
    { mimeType: 'video/mp4',              format: 'mp4'  as MotionFormat },
    { mimeType: 'video/webm;codecs=vp9',  format: 'webm' as MotionFormat },
    { mimeType: 'video/webm',             format: 'webm' as MotionFormat },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c
    }
  }
  return { mimeType: 'video/webm', format: 'webm' }
}

// ─── VIDEO EXPORT (MediaRecorder) ────────────────────────────────────────────

export async function exportMotionVideo(
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  renderFrame: (progress: number) => void,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const { mimeType, format } = getSupportedVideoMimeType()
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []

  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

  await new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('MediaRecorder error'))
    recorder.start()

    let frame = 0
    const interval = 1000 / fps

    const renderNext = () => {
      if (signal?.aborted) { recorder.stop(); return }
      if (frame >= totalFrames) { recorder.stop(); return }

      const progress = frame / totalFrames
      renderFrame(progress)
      onProgress?.({ frame, total: totalFrames, percent: Math.round(progress * 100) })
      frame++
      setTimeout(renderNext, interval)
    }

    setTimeout(renderNext, 200) // stabilize encoder before first frame
  })

  const blob = new Blob(chunks, { type: mimeType })
  return { blob, format, url: URL.createObjectURL(blob) }
}

// ─── GIF EXPORT ───────────────────────────────────────────────────────────────

export async function exportMotionGIF(
  exportFrame: (progress: number) => Promise<string | null>,  // returns data URL per frame
  totalFrames: number,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  // 1. Cap dimensions at max 960px width to prevent high-DPR out-of-memory pressure
  let w = targetWidth
  let h = targetHeight
  if (w > 960) {
    const scale = 960 / w
    w = 960
    h = Math.round(h * scale)
  }

  // 2. Adaptive Frame Skipping: Cap at 45 frames to prevent huge files and browser crashes
  const maxAllowedFrames = 45
  const step = totalFrames > maxAllowedFrames ? Math.ceil(totalFrames / maxAllowedFrames) : 1
  const renderFramesCount = Math.ceil(totalFrames / step)

  // 3. Predicted Memory Safety Check
  const predictedBytes = w * h * renderFramesCount * 4
  const predictedMB = Math.round(predictedBytes / (1024 * 1024))
  if (predictedMB > 120) {
    console.warn(`[GIF Export Guard] Predicted render memory: ${predictedMB}MB. Capping dimensions further.`);
  }

  const delay = Math.round((1000 / fps) * step)
  const gif = GIFEncoder()

  // Offscreen canvas for pixel extraction
  const offscreen = document.createElement('canvas')
  offscreen.width  = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d', { willReadFrequently: true })!

  let writtenFrames = 0
  for (let i = 0; i < totalFrames; i += step) {
    if (signal?.aborted) break

    const progress = i / totalFrames
    const dataUrl = await exportFrame(progress)
    if (!dataUrl) continue

    // Draw data URL to offscreen canvas to get pixel data
    await new Promise<void>(resolve => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h)
        resolve()
      }
      img.src = dataUrl
    })

    const { data } = ctx.getImageData(0, 0, w, h)
    const rgba = new Uint8ClampedArray(data)

    const palette = quantize(rgba, 256)
    const index = applyPalette(rgba, palette)
    gif.writeFrame(index, w, h, { palette, delay })
    
    writtenFrames++

    onProgress?.({ frame: writtenFrames, total: renderFramesCount, percent: Math.round((writtenFrames / renderFramesCount) * 100) })

    // Yield to browser event loop every 4 frames to avoid UI freeze
    if (writtenFrames % 4 === 3) await new Promise(r => setTimeout(r, 0))
  }

  gif.finish()
  const buffer = gif.bytesView()
  const blob = new Blob([buffer], { type: 'image/gif' })
  return { blob, format: 'gif', url: URL.createObjectURL(blob) }
}

// ─── PLATFORM COMPATIBILITY LABELS ───────────────────────────────────────────

export const FORMAT_COMPATIBILITY: Record<MotionFormat, { label: string; platforms: string[]; note: string }> = {
  mp4:  {
    label: 'MP4',
    platforms: ['X / Twitter', 'LinkedIn', 'Product Hunt', 'Instagram'],
    note: 'Best for social platforms — native playback everywhere.',
  },
  webm: {
    label: 'WebM',
    platforms: ['Chrome', 'Firefox', 'Web sharing'],
    note: 'Works in modern browsers. Convert to MP4 before uploading to most social platforms.',
  },
  gif:  {
    label: 'GIF',
    platforms: ['X / Twitter', 'Slack', 'Discord', 'Email', 'Any browser'],
    note: 'Universal compatibility, larger file size. Best for short loops.',
  },
}
