// Motion export pipeline — MP4 (H.264 where available), WebM fallback, GIF option.
// All exports are async and non-blocking. Progress callbacks prevent UI freezing.

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

  // Offscreen canvas for pixel extraction (must stay on the main thread —
  // the composition engine renders to a DOM canvas). Only the CPU-heavy
  // quantize/encode is offloaded to the worker.
  const offscreen = document.createElement('canvas')
  offscreen.width  = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d', { willReadFrequently: true })!

  const worker = new Worker(new URL('../workers/encode.worker.ts', import.meta.url), { type: 'module' })

  try {
    const gifBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'progress') {
          onProgress?.({ frame: msg.written, total: renderFramesCount, percent: Math.round((msg.written / renderFramesCount) * 100) })
        } else if (msg.type === 'done') {
          resolve(msg.gif as ArrayBuffer)
        } else if (msg.type === 'error') {
          reject(new Error(msg.message))
        }
      }
      worker.onerror = () => reject(new Error('GIF encode worker error'))

      ;(async () => {
        try {
          for (let i = 0; i < totalFrames; i += step) {
            if (signal?.aborted) break

            const progress = i / totalFrames
            const dataUrl = await exportFrame(progress)
            if (!dataUrl) continue

            await new Promise<void>((res, rej) => {
              const img = new Image()
              img.onload = () => { ctx.drawImage(img, 0, 0, w, h); res() }
              img.onerror = () => rej(new Error('Frame image decode failed'))
              img.src = dataUrl
            })

            const { data } = ctx.getImageData(0, 0, w, h)
            // Transfer the pixel buffer to the worker (zero-copy).
            const rgba = new Uint8ClampedArray(data).buffer
            worker.postMessage(
              { type: 'frame', rgba, width: w, height: h, delay, total: renderFramesCount },
              [rgba],
            )

            // Yield so frame rendering stays responsive.
            await new Promise(r => setTimeout(r, 0))
          }
          worker.postMessage({ type: 'finish' })
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    })

    const blob = new Blob([gifBytes], { type: 'image/gif' })
    return { blob, format: 'gif', url: URL.createObjectURL(blob) }
  } finally {
    worker.terminate()
  }
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
