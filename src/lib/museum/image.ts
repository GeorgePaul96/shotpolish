// Photo preparation for Museum of You. Every photo is re-encoded in the browser
// before upload: long edge capped at MAX_EDGE, JPEG, and (because it's redrawn
// on a canvas) stripped of EXIF metadata such as GPS location.

export const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height }
  const scale = max / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Source rectangle that fills a dw×dh box with no letterboxing (CSS object-fit: cover). */
export function coverCrop(sw: number, sh: number, dw: number, dh: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(dw / sw, dh / sh)
  const cw = dw / scale
  const ch = dh / scale
  return { sx: Math.round((sw - cw) / 2), sy: Math.round((sh - ch) / 2), sw: Math.round(cw), sh: Math.round(ch) }
}

/** Loads an <img>. crossOrigin is set so signed Storage URLs can be drawn to a canvas. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This photo couldn’t be loaded.'))
    img.src = src
  })
}

interface Decoded { source: CanvasImageSource; width: number; height: number; release: () => void }

async function decode(file: Blob): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
  } catch {
    // Fall back to <img>, which also decodes HEIC on Safari.
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageEl(url)
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('This photo couldn’t be opened. Try a JPG or PNG.')
  }
}

export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('That file isn’t a photo. Try a JPG or PNG.')
  const decoded = await decode(file)
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser couldn’t process this photo.')
    ctx.drawImage(decoded.source, 0, 0, width, height)
    return await canvasToBlob(canvas)
  } finally {
    decoded.release()
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Your browser couldn’t process this photo.'))), 'image/jpeg', quality)
  })
}
