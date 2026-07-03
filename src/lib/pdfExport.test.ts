import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildPdfFromPngs, dataUrlToBytes } from './pdfExport'

// 1×1 opaque PNG
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('dataUrlToBytes', () => {
  it('decodes a data URL into PNG bytes', () => {
    const bytes = dataUrlToBytes(PNG_1x1)
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]) // PNG magic
  })
})

describe('buildPdfFromPngs', () => {
  it('builds one page per PNG at the image dimensions', async () => {
    const png = dataUrlToBytes(PNG_1x1)
    const pdfBytes = await buildPdfFromPngs([png, png, png])
    const doc = await PDFDocument.load(pdfBytes)
    expect(doc.getPageCount()).toBe(3)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBe(1)
    expect(height).toBe(1)
  })

  it('rejects an empty page list', async () => {
    await expect(buildPdfFromPngs([])).rejects.toThrow('empty')
  })
})
