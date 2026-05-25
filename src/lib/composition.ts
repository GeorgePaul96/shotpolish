import { SOCIAL_FORMATS } from './socialFormats'

// ─── THEMES ───────────────────────────────────────────────────────────────────
export const THEMES = [
  { name: 'Indigo',  bg: '#06080f', accent: '#818cf8', glow: 'rgba(99,102,241,0.42)',  glowMid: 'rgba(99,102,241,0.10)'  },
  { name: 'Emerald', bg: '#030a06', accent: '#34d399', glow: 'rgba(16,185,129,0.38)',  glowMid: 'rgba(16,185,129,0.08)'  },
  { name: 'Rose',    bg: '#0a0306', accent: '#fb7185', glow: 'rgba(244,63,94,0.38)',   glowMid: 'rgba(244,63,94,0.08)'   },
  { name: 'Slate',   bg: '#060809', accent: '#94a3b8', glow: 'rgba(148,163,184,0.26)', glowMid: 'rgba(148,163,184,0.06)' },
  { name: 'Amber',   bg: '#080600', accent: '#fcd34d', glow: 'rgba(251,191,36,0.38)',  glowMid: 'rgba(251,191,36,0.08)'  },
  { name: 'Sky',     bg: '#02080d', accent: '#38bdf8', glow: 'rgba(56,189,248,0.38)',  glowMid: 'rgba(56,189,248,0.08)'  },
] as const

export type Theme = typeof THEMES[number]

// ─── TYPES & DATA STRUCTURES ─────────────────────────────────────────────────
export interface Selection {
  x: number // [0, 1] relative to screenshot
  y: number // [0, 1] relative to screenshot
  w: number
  h: number
}

export interface CompositionDocument {
  id: string
  formatId: string
  themeIndex: number
  padding: number
  shadowOpacity: number
  headline: {
    text: string
    visible: boolean
  }
  screenshot: {
    imageUrl: string | null
    naturalWidth: number
    naturalHeight: number
    visible: boolean
    selection: Selection | null
    callout: {
      text: string
      visible: boolean
    } | null
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ComputedLayout {
  compW: number
  compH: number
  background: Rect
  card: Rect
  chrome: Rect
  screenshot: Rect
  headline: Rect & { fontSize: number }
  spotlight: Rect | null
  callout: Rect | null
  watermark: Rect
  chromeH: number
  cornerR: number
  headSpc: number
}

// ─── LAYOUT ENGINE ───────────────────────────────────────────────────────────
export function computeLayout(
  natW: number,
  natH: number,
  padding: number,
  headlineText: string,
  aspectRatio: string,
): ComputedLayout {
  const fmt = SOCIAL_FORMATS[aspectRatio]
  const fixed = !!(fmt && fmt.width > 0)

  let compW: number
  let compH: number
  let imgW: number
  let imgH: number
  let headSpc: number

  // Image base dimensions capped at 1800 to avoid giant canvases
  const maxW = 1800
  const freeScale = natW > maxW ? maxW / natW : 1
  const baseImgW = Math.round(natW * freeScale)
  const baseImgH = Math.round(natH * freeScale)

  if (!fixed) {
    // Free mode — composition wraps the image
    imgW = baseImgW
    imgH = baseImgH
    const ch = Math.max(imgW * 0.042, 28)
    headSpc = headlineText ? Math.max(imgW * 0.13, 70) : Math.max(imgW * 0.035, 24)
    compW = imgW + padding * 2
    compH = imgH + ch + headSpc + padding * 2
  } else {
    // Platform mode — fixed canvas size, image scaled to fit inside bounds
    compW = fmt.width
    compH = fmt.height
    headSpc = headlineText ? Math.round(compH * 0.11) : Math.round(compH * 0.03)
    
    const availW = compW - padding * 2
    const availH = compH - headSpc - padding * 2
    
    const sw = availW / baseImgW
    const sh = availH / (baseImgH + baseImgW * 0.042)
    const s = Math.min(sw, sh, 2) // Cap upscale factor to avoid blurry images
    
    imgW = Math.round(baseImgW * s)
    imgH = Math.round(baseImgH * s)
  }

  const chromeH = Math.max(imgW * 0.042, 28)
  const cornerR = Math.max(imgW * 0.013, 8)

  let cardX: number
  let cardY: number
  const cardH = imgH + chromeH

  if (!fixed) {
    cardX = padding
    cardY = padding + headSpc
  } else {
    cardX = Math.round((compW - imgW) / 2)
    const freeV = compH - headSpc - padding * 2 - cardH
    cardY = headSpc + padding + Math.round(freeV / 2)
  }

  // Draw positions inside card bounds
  const chromeRect: Rect = { x: cardX, y: cardY, w: imgW, h: chromeH }
  const imgRect: Rect = { x: cardX, y: cardY + chromeH, w: imgW, h: imgH }

  // Headline placement
  const fs = Math.max(Math.round(imgW * 0.036), 20)
  const textY = headSpc * 0.28 + (fixed ? padding : 0)
  const headlineRect = {
    x: Math.round(compW * 0.11),
    y: Math.round(textY),
    w: Math.round(compW * 0.78),
    h: Math.round(fs * 2.5),
    fontSize: fs
  }

  // Spotlight Bounds relative to Screenshot
  let spotlightRect: Rect | null = null
  let calloutRect: Rect | null = null

  // Watermark
  const wms = Math.max(Math.round(compW * 0.012), 10)
  const watermarkRect: Rect = {
    x: compW - Math.max(compW * 0.012, 12),
    y: compH - Math.max(compH * 0.012, 12),
    w: Math.round(wms * 8),
    h: wms
  }

  return {
    compW,
    compH,
    background: { x: 0, y: 0, w: compW, h: compH },
    card: { x: cardX, y: cardY, w: imgW, h: cardH },
    chrome: chromeRect,
    screenshot: imgRect,
    headline: headlineRect,
    spotlight: spotlightRect,
    callout: calloutRect,
    watermark: watermarkRect,
    chromeH,
    cornerR,
    headSpc
  }
}

// ─── SHAPES & HELPERS ────────────────────────────────────────────────────────
export function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | [number, number, number, number],
) {
  const maxR = Math.min(Math.abs(w), Math.abs(h)) / 2
  const c = (r: number) => Math.min(Math.abs(r), maxR)
  const [tl, tr, br, bl] = typeof radii === 'number'
    ? [c(radii), c(radii), c(radii), c(radii)]
    : [c(radii[0]), c(radii[1]), c(radii[2]), c(radii[3])]
  
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl)
  ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lh: number,
) {
  const words = text.split(' ')
  let line = ''
  let curY = y
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' '
    if (ctx.measureText(test).width > maxW && i > 0) {
      ctx.fillText(line.trim(), cx, curY)
      line = words[i] + ' '
      curY += lh
    } else {
      line = test
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), cx, curY)
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  toX: number,
  toY: number,
  size: number,
) {
  const angle = Math.atan2(toY - y, toX - x)
  ctx.save()
  ctx.translate(toX, toY)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size / 2)
  ctx.lineTo(-size, size / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ─── RENDERING PIPELINE ───────────────────────────────────────────────────────
export function renderComposition(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  theme: Theme,
  doc: CompositionDocument,
  L: ComputedLayout,
  motionProgress: number = 1.0 // 0.0 to 1.0 represents the reveal timeline progress
) {
  const { compW, compH, card, chrome, screenshot, headline: headL, watermark, cornerR, chromeH } = L
  const { shadowOpacity, padding, formatId } = doc

  // 1. Background base fill
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, compW, compH)

  // Soft ambient radial glow
  const gcx = compW / 2
  const gcy = (card.y + card.h / 2) * 0.75
  const glowR = Math.max(compW, compH) * 0.78
  const grd = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, glowR)
  grd.addColorStop(0, theme.glow)
  grd.addColorStop(0.5, theme.glowMid)
  grd.addColorStop(1, 'transparent')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, compW, compH)

  // Deep vignette overlay for cinematic canvas edges
  const vig = ctx.createRadialGradient(gcx, compH / 2, compH * 0.25, gcx, compH / 2, compH * 0.95)
  vig.addColorStop(0, 'transparent')
  vig.addColorStop(1, 'rgba(0,0,0,0.44)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, compW, compH)

  // 2. Headline Layer (fades in from p = 0.10 to p = 0.35)
  let headlineAlpha = 1.0
  if (motionProgress < 1.0) {
    headlineAlpha = Math.max(0, Math.min(1, (motionProgress - 0.10) / 0.25))
  }
  
  if (doc.headline.visible && doc.headline.text && headlineAlpha > 0.01) {
    ctx.save()
    ctx.globalAlpha = headlineAlpha
    ctx.font = `800 ${headL.fontSize}px 'Inter','Segoe UI',system-ui,sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 10
    wrapText(ctx, doc.headline.text, compW / 2, headL.y, compW * 0.78, headL.fontSize * 1.32)
    ctx.restore()
  }

  // ── Apply card zoom/scale transform for motion (p = 0.0 to p = 1.0 zooms from 96% to 100%)
  const cardScale = motionProgress < 1.0 ? 0.96 + 0.04 * motionProgress : 1.0
  
  ctx.save()
  const ccx = card.x + card.w / 2
  const ccy = card.y + card.h / 2
  ctx.translate(ccx, ccy)
  ctx.scale(cardScale, cardScale)
  ctx.translate(-ccx, -ccy)

  // 3. Layered Cinematic Drop Shadow (Opaque shapes cast real depth)
  if (shadowOpacity > 0.05) {
    const sb = Math.max(card.w * 0.048, 24) * shadowOpacity
    const so = Math.max(card.w * 0.018, 10) * shadowOpacity
    
    ctx.save()
    // First pass: ambient black depth shadow
    ctx.shadowColor = `rgba(0,0,0,${0.72 * shadowOpacity})`
    ctx.shadowBlur = sb
    ctx.shadowOffsetY = so
    ctx.fillStyle = '#08080a' // Solid dark shape to cast strong shadow (covered by real card)
    rr(ctx, card.x, card.y, card.w, card.h, cornerR)
    ctx.fill()

    // Second pass: soft color ambient glow shadow
    ctx.shadowColor = theme.glow.replace('0.42', `${0.28 * shadowOpacity}`)
    ctx.shadowBlur = sb * 1.6
    ctx.shadowOffsetY = 0
    ctx.fillStyle = '#08080a'
    rr(ctx, card.x, card.y, card.w, card.h, cornerR)
    ctx.fill()
    ctx.restore()
  }

  // 4. macOS Chrome Mockup
  if (doc.screenshot.visible) {
    ctx.save()
    // Chrome gradient background
    const cg = ctx.createLinearGradient(0, chrome.y, 0, chrome.y + chrome.h)
    cg.addColorStop(0, '#f0f0f0')
    cg.addColorStop(1, '#d5d5d5')
    ctx.fillStyle = cg
    rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h, [cornerR, cornerR, 0, 0])
    ctx.fill()
    
    // Bottom border line
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(chrome.x, chrome.y + chrome.h)
    ctx.lineTo(chrome.x + chrome.w, chrome.y + chrome.h)
    ctx.stroke()

    // Mockup window traffic lights
    const dotR = Math.max(chrome.w * 0.0065, 4.5)
    const dotGap = dotR * 2.8
    const dotStartX = chrome.x + dotR * 3
    const dotY = chrome.y + chrome.h / 2
    const colors = ['#ff5f57', '#febc2e', '#28c840']
    
    colors.forEach((c, i) => {
      // Ring shadow
      ctx.beginPath()
      ctx.arc(dotStartX + i * dotGap, dotY, dotR + 0.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fill()
      // Solid traffic light color dot
      ctx.beginPath()
      ctx.arc(dotStartX + i * dotGap, dotY, dotR, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
    })

    // Browser URL bar pill
    const urlW = Math.max(chrome.w * 0.22, 80)
    const urlH = Math.max(chrome.h * 0.40, 10)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    rr(ctx, chrome.x + (chrome.w - urlW) / 2, dotY - urlH / 2, urlW, urlH, urlH / 2)
    ctx.fill()
    ctx.restore()

    // 5. Contained Screenshot Image Layer
    ctx.save()
    rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [0, 0, cornerR, cornerR])
    ctx.clip()
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, screenshot.x, screenshot.y, screenshot.w, screenshot.h)
    ctx.restore()

    // 6. Selection Spotlight Annotations
    const selection = doc.screenshot.selection
    if (selection) {
      const sX = screenshot.x + selection.x * screenshot.w
      const sY = screenshot.y + selection.y * screenshot.h
      const sW = selection.w * screenshot.w
      const sH = selection.h * screenshot.h

      // Spotlight opacity fades in from p = 0.20 to p = 0.45
      const spotlightAlpha = motionProgress < 1.0
        ? Math.max(0, Math.min(1, (motionProgress - 0.20) / 0.25))
        : 1.0

      // Spotlight border glow pulses gently from p = 0.45 to p = 0.85
      const pulse = (motionProgress < 1.0 && motionProgress >= 0.45)
        ? 1.0 + 0.05 * Math.sin((motionProgress - 0.45) * Math.PI * 4)
        : 1.0

      // Dim backdrop over remaining screenshot areas
      ctx.save()
      rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [0, 0, cornerR, cornerR])
      ctx.clip()
      ctx.fillStyle = `rgba(0,0,0,${0.68 * spotlightAlpha})`
      ctx.fillRect(screenshot.x, screenshot.y, screenshot.w, screenshot.h)
      ctx.restore()

      // Spotlight slice reveal and border are painted only if spotlightAlpha is positive
      if (spotlightAlpha > 0.01) {
        ctx.save()
        ctx.globalAlpha = spotlightAlpha
        
        // High-res spotlight slice reveal
        ctx.save()
        ctx.beginPath()
        ctx.rect(sX, sY, sW, sH)
        ctx.clip()
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, screenshot.x, screenshot.y, screenshot.w, screenshot.h)
        ctx.restore()

        // White/accent border glow on spotlight bounds
        ctx.save()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(screenshot.w * 0.0025, 2)
        ctx.shadowColor = theme.accent
        ctx.shadowBlur = Math.max(screenshot.w * 0.015, 12) * pulse
        ctx.strokeRect(sX, sY, sW, sH)
        ctx.restore()

        // Designer corner bracket coordinates
        const cl = Math.min(sW, sH) * 0.18
        const lw = Math.max(screenshot.w * 0.0035, 3)
        ctx.save()
        ctx.strokeStyle = theme.accent
        ctx.lineWidth = lw
        ctx.lineCap = 'round'
        
        const brackets: [number, number, number, number][] = [
          [sX, sY, 1, 1],
          [sX + sW, sY, -1, 1],
          [sX, sY + sH, 1, -1],
          [sX + sW, sY + sH, -1, -1]
        ]
        
        brackets.forEach(([bx, by, dx, dy]) => {
          ctx.beginPath()
          ctx.moveTo(bx + dx * cl, by)
          ctx.lineTo(bx, by)
          ctx.lineTo(bx, by + dy * cl)
          ctx.stroke()
        })
        ctx.restore()
        ctx.restore()
      }

      // 7. Interactive Callout Annotation Pill
      if (doc.screenshot.callout?.visible && doc.screenshot.callout.text) {
        // Callout fades in from p = 0.50 to p = 0.75, slides up 12px
        const calloutAlpha = motionProgress < 1.0
          ? Math.max(0, Math.min(1, (motionProgress - 0.50) / 0.25))
          : 1.0
        const calloutYOffset = motionProgress < 1.0 ? 12 * (1 - calloutAlpha) : 0

        // Elbow connector grows in from p = 0.48 to p = 0.66
        const arrowProgress = motionProgress < 1.0
          ? Math.max(0, Math.min(1, (motionProgress - 0.48) / 0.18))
          : 1.0

        if (calloutAlpha > 0.01) {
          ctx.save()
          const cfs = Math.max(screenshot.w * 0.016, 13)
          ctx.font = `700 ${cfs}px 'Inter','Segoe UI',system-ui,sans-serif`
          
          const tw = ctx.measureText(doc.screenshot.callout.text).width
          const px = cfs * 1.3
          const py = cfs * 0.75
          const pw = tw + px * 2
          const ph = cfs + py * 2
          const gap = Math.max(screenshot.h * 0.06, 36)

          // Positioning: check if room exists above selection card boundary
          const above = sY - gap - ph >= screenshot.y + 8
          const ly = (above ? sY - gap - ph : sY + sH + gap) + calloutYOffset
          const lx = Math.max(screenshot.x + 6, Math.min(sX + sW / 2 - pw / 2, screenshot.x + screenshot.w - pw - 6))

          const tipX = sX + sW / 2
          const tipY = above ? sY - 3 : sY + sH + 3
          const elbX = lx + pw / 2
          const elbY = above ? ly + ph : ly
          const midY = (elbY + tipY) / 2

          // Connector elbow path (drawn progressively based on arrowProgress)
          if (arrowProgress > 0.01) {
            ctx.save()
            ctx.globalAlpha = calloutAlpha
            ctx.strokeStyle = '#ffffff'
            ctx.fillStyle = '#ffffff'
            ctx.lineWidth = Math.max(screenshot.w * 0.002, 2)
            ctx.lineCap = 'round'
            
            const len1 = Math.abs(midY - elbY)
            const len2 = Math.abs(tipX - elbX)
            const len3 = Math.abs(tipY - midY)
            const totalLength = len1 + len2 + len3
            
            ctx.setLineDash([totalLength])
            ctx.lineDashOffset = totalLength * (1 - arrowProgress)
            
            ctx.beginPath()
            ctx.moveTo(elbX, elbY)
            ctx.lineTo(elbX, midY)
            ctx.lineTo(tipX, midY)
            ctx.lineTo(tipX, tipY)
            ctx.stroke()

            // Draw arrowhead & target dot at tip once arrow reaches the destination (progress > 0.95)
            if (arrowProgress > 0.95) {
              const scaleArrow = (arrowProgress - 0.95) / 0.05
              drawArrow(ctx, tipX, midY, tipX, tipY, Math.max(screenshot.w * 0.007, 7) * scaleArrow)

              ctx.beginPath()
              ctx.arc(tipX, tipY, Math.max(screenshot.w * 0.004, 4) * scaleArrow, 0, Math.PI * 2)
              ctx.fillStyle = theme.accent
              ctx.fill()
            }
            ctx.restore()
          }

          // Main Callout text pill
          ctx.save()
          ctx.globalAlpha = calloutAlpha
          
          // Soft dropshadow on pill structure
          ctx.shadowColor = 'rgba(0,0,0,0.45)'
          ctx.shadowBlur = Math.max(screenshot.w * 0.015, 16)
          ctx.shadowOffsetY = Math.max(screenshot.w * 0.006, 6)

          // Pill background
          ctx.fillStyle = theme.accent
          rr(ctx, lx, ly, pw, ph, 999)
          ctx.fill()

          // Text rendering inside pill center
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0
          ctx.fillStyle = '#0f172a'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(doc.screenshot.callout.text, lx + pw / 2, ly + ph / 2)
          ctx.restore()
          ctx.restore()
        }
      }
    }
  }

  ctx.restore() // restore card scale transform

  // 8. Viral Watermark Brand
  ctx.save()
  const wms = Math.max(Math.round(compW * 0.012), 10)
  ctx.font = `500 ${wms}px 'Inter',system-ui,sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(255,255,255,0.26)'
  ctx.fillText('shotpolish.com', watermark.x, watermark.y + watermark.h)
  ctx.restore()
}
