// LinkedIn carousels are PDF "document" posts: one page per slide.
// Pure helpers — no DOM APIs, so they run in Vitest (node) and the browser.
import { PDFDocument } from 'pdf-lib'

/** Decode a base64 data URL (e.g. canvas.toDataURL output) into raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Assemble PNG slides into a multi-page PDF, one page per image, each page
 * sized to its image so slides render full-bleed with no margins.
 */
export async function buildPdfFromPngs(pngs: Uint8Array[]): Promise<Uint8Array> {
  if (pngs.length === 0) throw new Error('Cannot build an empty PDF')
  const doc = await PDFDocument.create()
  for (const png of pngs) {
    const image = await doc.embedPng(png)
    const page = doc.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  return doc.save()
}
