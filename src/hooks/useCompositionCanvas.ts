import { useRef, useEffect, useCallback, useState } from 'react'
import type { RefObject } from 'react'
import {
  THEMES,
  computeLayout,
  renderComposition,
  type Theme,
  type CompositionDocument
} from '../lib/composition'

export function useCompositionCanvas(
  doc: CompositionDocument,
  canvasRef: RefObject<HTMLCanvasElement>,
  motionProgress: number = 1.0 // Optional reveal animation timeline progress (0.0 to 1.0)
) {
  const [isRendering, setIsRendering] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number | null>(null)
  
  const optsRef = useRef(doc)
  optsRef.current = doc // keep ref up-to-date without rebuilding react callbacks

  const progressRef = useRef(motionProgress)
  progressRef.current = motionProgress

  // ── paint: draws the scene graph onto the canvas ──────────────────────────
  const paint = useCallback(() => {
    rafRef.current = null
    setIsRendering(false)
    
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    
    const parent = canvas.parentElement
    if (!parent) return
    
    const cssW = parent.clientWidth
    if (cssW < 4) return

    const currentDoc = optsRef.current
    const theme = THEMES[currentDoc.themeIndex] ?? THEMES[0]
    
    // Central layout computations
    const L = computeLayout(
      img.naturalWidth,
      img.naturalHeight,
      currentDoc.padding,
      currentDoc.headline.text,
      currentDoc.formatId,
      currentDoc.frameType,
    )
    
    const scale = cssW / L.compW
    const cssH = Math.round(L.compH * scale)
    const dpr = window.devicePixelRatio || 1
    const pixW = Math.round(cssW * dpr)
    const pixH = Math.round(cssH * dpr)

    if (canvas.width !== pixW || canvas.height !== pixH) {
      canvas.width = pixW
      canvas.height = pixH
      canvas.style.height = `${cssH}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Unified coordinate transform scaling (comp space -> screen device pixels)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    renderComposition(ctx, img, theme, currentDoc, L, progressRef.current)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [canvasRef])

  // ── schedule: paints inside requestAnimationFrame ─────────────────────────
  const schedule = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    setIsRendering(true)
    rafRef.current = requestAnimationFrame(paint)
  }, [paint])

  // ── load image on source change ──────────────────────────────────────────
  const imageUrl = doc.screenshot.imageUrl
  useEffect(() => {
    imgRef.current = null
    if (!imageUrl) return

    const img = new Image()
    img.onerror = () => {
      console.error('[useCompositionCanvas] Image failed — URL may be revoked:', imageUrl?.slice(0, 80))
      imgRef.current = null
      setIsRendering(false)
    }
    img.onload = () => {
      console.log('[useCompositionCanvas] Image loaded:', img.naturalWidth, 'x', img.naturalHeight)
      imgRef.current = img
      schedule()
    }
    img.src = imageUrl
  }, [imageUrl, schedule])

  // ── repaint on any document structure mutations or progress steps ─────────
  useEffect(() => {
    if (imgRef.current) schedule()
  }, [doc, motionProgress, schedule])

  // ── resize observer tracking ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    
    const ro = new ResizeObserver(schedule)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [canvasRef, schedule, imageUrl])

  // ── export: high-resolution canvas snapshot render ────────────────────────
  const exportImage = useCallback(async (overrideFormatId?: string, overrideProgress?: number): Promise<string | null> => {
    const img = imgRef.current
    if (!img) return null
    
    const docCopy = {
      ...optsRef.current,
      ...(overrideFormatId ? { formatId: overrideFormatId } : {})
    }
    const theme = THEMES[docCopy.themeIndex] ?? THEMES[0]
    
    // Central computed layout match
    const L = computeLayout(
      img.naturalWidth,
      img.naturalHeight,
      docCopy.padding,
      docCopy.headline.text,
      docCopy.formatId,
      docCopy.frameType,
    )
    
    const off = document.createElement('canvas')
    off.width = L.compW
    off.height = L.compH
    
    const ctx = off.getContext('2d')
    if (!ctx) return null
    
    const activeProgress = overrideProgress !== undefined ? overrideProgress : progressRef.current
    renderComposition(ctx, img, theme, docCopy, L, activeProgress)
    try {
      return off.toDataURL('image/png')
    } catch {
      return null
    }
  }, [])

  return { isRendering, exportImage }
}
