import { SOCIAL_FORMATS } from './socialFormats'

export type StoryRole =
  | 'intro'
  | 'context'
  | 'feature'
  | 'process'
  | 'output'
  | 'cta'
  | 'uncertain'

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

// ─── FRAME TYPES ─────────────────────────────────────────────────────────────
export type FrameType = 'browser' | 'iphone' | 'android' | 'ipad' | 'none'

interface FrameMetrics {
  topBarH: number       // status bar / chrome bar height
  bottomBarH: number    // home indicator / nav bar height
  bezelX: number        // horizontal bezel thickness (each side)
  bezelTop: number      // extra bezel above top bar
  screenCornerR: number // inner screen corner radius
  outerCornerR: number  // device body outer corner radius
}

function getFrameMetrics(ft: FrameType, imgW: number, imgH: number): FrameMetrics {
  switch (ft) {
    case 'browser': return {
      topBarH:      Math.max(imgW * 0.042, 28),
      bottomBarH:   0,
      bezelX:       0,
      bezelTop:     0,
      screenCornerR: Math.max(imgW * 0.013, 8),
      outerCornerR:  Math.max(imgW * 0.013, 8),
    }
    case 'iphone': return {
      topBarH:      Math.max(imgH * 0.09,  54),
      bottomBarH:   Math.max(imgH * 0.055, 32),
      bezelX:       Math.max(imgW * 0.052, 18),
      bezelTop:     Math.max(imgH * 0.016, 10),
      screenCornerR: Math.max(imgW * 0.085, 28),
      outerCornerR:  Math.max(imgW * 0.100, 34),
    }
    case 'android': return {
      topBarH:      Math.max(imgH * 0.065, 38),
      bottomBarH:   Math.max(imgH * 0.044, 26),
      bezelX:       Math.max(imgW * 0.028, 10),
      bezelTop:     Math.max(imgH * 0.010,  6),
      screenCornerR: Math.max(imgW * 0.060, 20),
      outerCornerR:  Math.max(imgW * 0.072, 24),
    }
    case 'ipad': return {
      topBarH:      Math.max(imgH * 0.048, 30),
      bottomBarH:   Math.max(imgH * 0.028, 17),
      bezelX:       Math.max(imgW * 0.018,  8),
      bezelTop:     Math.max(imgH * 0.008,  5),
      screenCornerR: Math.max(imgW * 0.028, 12),
      outerCornerR:  Math.max(imgW * 0.033, 14),
    }
    case 'none': return {
      topBarH: 0, bottomBarH: 0, bezelX: 0, bezelTop: 0,
      screenCornerR: Math.max(imgW * 0.013, 8),
      outerCornerR:  Math.max(imgW * 0.013, 8),
    }
  }
}

// ─── TYPES & DATA STRUCTURES ─────────────────────────────────────────────────
export interface Selection {
  x: number // [0, 1] relative to screenshot
  y: number
  w: number
  h: number
}

export interface Callout {
  id: string
  x: number   // [0, 1] relative to screenshot bounds
  y: number   // [0, 1] relative to screenshot bounds
  label: string
  order: number  // 1, 2, or 3
}

export type SpotlightRegion = {
  x: number
  y: number
  width: number
  height: number
}

export interface CompositionDocument {
  id: string
  formatId: string
  themeIndex: number
  padding: number
  shadowOpacity: number
  frameType: FrameType
  role?: StoryRole
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
    callouts?: Callout[]  // multi-point numbered annotations (up to 3)
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface RenderOptions {
  /** Draw the ShotPolish watermark onto the canvas. Defaults to true. */
  watermark?: boolean
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
  cornerR: number      // screen corner radius (used for clipping)
  outerCornerR: number // device body outer corner radius
  deviceBody: Rect     // full outer device bounds (= card for browser/none)
  bottomChromeH: number
  headSpc: number
  frameType: FrameType
}

// ─── LAYOUT ENGINE ───────────────────────────────────────────────────────────
export function computeLayout(
  natW: number,
  natH: number,
  padding: number,
  headlineText: string,
  aspectRatio: string,
  frameType: FrameType = 'browser',
): ComputedLayout {
  const fmt    = SOCIAL_FORMATS[aspectRatio]
  const fixed  = !!(fmt && fmt.width > 0)

  const adjustedPadding = padding

  const maxW    = 1800
  const freeScale = natW > maxW ? maxW / natW : 1
  const baseImgW  = Math.round(natW * freeScale)
  const baseImgH  = Math.round(natH * freeScale)

  let imgW: number
  let imgH: number
  let headSpc: number

  // Overhead fractions for each frame type (used to shrink available space in fixed mode)
  const overheadW = frameType === 'iphone' ? 1.104 : frameType === 'android' ? 1.056 : frameType === 'ipad' ? 1.036 : 1.0
  const overheadH = frameType === 'iphone' ? 1.161 : frameType === 'android' ? 1.119 : frameType === 'ipad' ? 1.076 : 1.0

  if (!fixed) {
    imgW = baseImgW
    imgH = baseImgH
  } else {
    const compW  = fmt.width
    const compH  = fmt.height
    headSpc      = headlineText ? Math.round(compH * 0.11) : Math.round(compH * 0.03)

    let availW = compW - adjustedPadding * 2
    let availH = compH - headSpc - adjustedPadding * 2

    let sw: number, sh: number
    if (frameType === 'browser') {
      sw = availW / baseImgW
      sh = availH / (baseImgH + baseImgW * 0.042)
    } else if (frameType === 'none') {
      sw = availW / baseImgW
      sh = availH / baseImgH
    } else {
      sw = availW / (baseImgW * overheadW)
      sh = availH / (baseImgH * overheadH)
    }
    const s = Math.min(sw, sh, 2)
    imgW = Math.round(baseImgW * s)
    imgH = Math.round(baseImgH * s)
  }

  // Compute frame-specific metrics now that imgW/imgH are known
  const fm = getFrameMetrics(frameType, imgW, imgH)
  const { topBarH, bottomBarH, bezelX, bezelTop, screenCornerR, outerCornerR } = fm

  // headSpc for free mode
  if (!fixed) {
    headSpc = headlineText ? Math.max(imgW * 0.13, 70) : Math.max(imgW * 0.035, 24)
  }

  // ── Composition canvas size ───────────────────────────────────────────────
  let compW: number, compH: number
  if (!fixed) {
    compW = imgW + bezelX * 2 + adjustedPadding * 2
    compH = imgH + topBarH + bottomBarH + bezelTop + headSpc! + adjustedPadding * 2
  } else {
    compW = fmt.width
    compH = fmt.height
  }

  // ── Card & device body placement ─────────────────────────────────────────
  let cardX: number, cardY: number

  if (!fixed) {
    cardX = adjustedPadding + bezelX
    cardY = adjustedPadding + headSpc! + bezelTop
  } else {
    // Center horizontally; account for bezelX so device is centered
    const deviceW = imgW + bezelX * 2
    cardX = Math.round((compW - deviceW) / 2) + bezelX
    const cardH = topBarH + imgH + bottomBarH
    const freeV = compH - headSpc! - adjustedPadding * 2 - cardH - bezelTop
    cardY = headSpc! + adjustedPadding + bezelTop + Math.round(freeV / 2)
  }

  const chromeH = topBarH
  const cardH   = topBarH + imgH + bottomBarH

  const card:       Rect = { x: cardX,         y: cardY,             w: imgW, h: cardH  }
  const chromeRect: Rect = { x: cardX,         y: cardY,             w: imgW, h: chromeH }
  const imgRect:    Rect = { x: cardX,         y: cardY + chromeH,   w: imgW, h: imgH   }

  const deviceBody: Rect = {
    x: cardX - bezelX,
    y: cardY - bezelTop,
    w: imgW + bezelX * 2,
    h: cardH + bezelTop,
  }

  // ── Headline placement & Typography Scale ──────────────────────────────────
  const fs = Math.max(Math.round(imgW * 0.036), 20)
  const textY = (headSpc! * 0.28) + (fixed ? adjustedPadding : 0)
  const headlineRect = {
    x:        Math.round(compW * 0.11),
    y:        Math.round(textY),
    w:        Math.round(compW * 0.78),
    h:        Math.round(fs * 2.5),
    fontSize: fs,
  }

  // ── Watermark ─────────────────────────────────────────────────────────────
  const wms = Math.max(Math.round(compW * 0.012), 10)
  const watermarkRect: Rect = {
    x: compW - Math.max(compW * 0.012, 12),
    y: compH - Math.max(compH * 0.012, 12),
    w: Math.round(wms * 8),
    h: wms,
  }

  return {
    compW,
    compH,
    background: { x: 0, y: 0, w: compW, h: compH },
    card,
    chrome:     chromeRect,
    screenshot: imgRect,
    headline:   headlineRect,
    spotlight:  null,
    callout:    null,
    watermark:  watermarkRect,
    chromeH,
    cornerR:     screenCornerR,
    outerCornerR,
    deviceBody,
    bottomChromeH: bottomBarH,
    headSpc:     headSpc!,
    frameType,
  }
}

// ─── SHAPES & HELPERS ────────────────────────────────────────────────────────
export function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
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
  text: string, cx: number, y: number, maxW: number, lh: number,
) {
  const words = text.split(' ')
  let line = '', curY = y
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
  x: number, y: number, toX: number, toY: number, size: number,
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

// ─── DEVICE CHROME RENDERERS ─────────────────────────────────────────────────

function renderBrowserChrome(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
) {
  const { chrome, cornerR } = L
  ctx.save()
  const cg = ctx.createLinearGradient(0, chrome.y, 0, chrome.y + chrome.h)
  cg.addColorStop(0, '#f0f0f0')
  cg.addColorStop(1, '#d5d5d5')
  ctx.fillStyle = cg
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h, [cornerR, cornerR, 0, 0])
  ctx.fill()

  ctx.strokeStyle = 'rgba(0,0,0,0.13)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(chrome.x, chrome.y + chrome.h)
  ctx.lineTo(chrome.x + chrome.w, chrome.y + chrome.h)
  ctx.stroke()

  const dotR    = Math.max(chrome.w * 0.0065, 4.5)
  const dotGap  = dotR * 2.8
  const dotStartX = chrome.x + dotR * 3
  const dotY    = chrome.y + chrome.h / 2

  ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(dotStartX + i * dotGap, dotY, dotR + 0.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(dotStartX + i * dotGap, dotY, dotR, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })

  const urlW = Math.max(chrome.w * 0.22, 80)
  const urlH = Math.max(chrome.h * 0.40, 10)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  rr(ctx, chrome.x + (chrome.w - urlW) / 2, dotY - urlH / 2, urlW, urlH, urlH / 2)
  ctx.fill()
  ctx.restore()
}

function renderIPhoneFrame(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
  _theme: Theme,
) {
  const { deviceBody, chrome, screenshot, outerCornerR, cornerR } = L

  // Device body
  ctx.save()
  ctx.fillStyle = '#141416'
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.fill()

  // Subtle edge highlight (top/left)
  const edgeGrad = ctx.createLinearGradient(deviceBody.x, deviceBody.y, deviceBody.x + deviceBody.w, deviceBody.y + deviceBody.h)
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.10)')
  edgeGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)')
  edgeGrad.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.strokeStyle = edgeGrad
  ctx.lineWidth = Math.max(deviceBody.w * 0.008, 2)
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.stroke()

  // Side buttons — volume (left side), power (right side)
  const btnW  = Math.max(deviceBody.w * 0.012, 3)
  const btnR  = btnW / 2
  const vol1Y = deviceBody.y + deviceBody.h * 0.22
  const vol2Y = deviceBody.y + deviceBody.h * 0.32
  const volH  = deviceBody.h * 0.072
  const pwrY  = deviceBody.y + deviceBody.h * 0.26
  const pwrH  = deviceBody.h * 0.10
  const lx    = deviceBody.x - btnW * 0.5
  const rx    = deviceBody.x + deviceBody.w - btnW * 0.5

  // Silent switch
  ctx.fillStyle = '#1e1e22'
  rr(ctx, lx, deviceBody.y + deviceBody.h * 0.14, btnW, volH * 0.55, btnR)
  ctx.fill()
  // Vol +
  ctx.fillStyle = '#1e1e22'
  rr(ctx, lx, vol1Y, btnW, volH, btnR)
  ctx.fill()
  // Vol -
  rr(ctx, lx, vol2Y, btnW, volH, btnR)
  ctx.fill()
  // Power
  rr(ctx, rx, pwrY, btnW, pwrH, btnR)
  ctx.fill()

  // Screen bg
  ctx.fillStyle = '#050507'
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  // Status bar (clock + icons)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `600 ${Math.max(chrome.h * 0.28, 11)}px 'Inter',system-ui,sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('9:41', chrome.x + chrome.w * 0.065, chrome.y + chrome.h * 0.38)

  // Battery + wifi icons (right side)
  const iconY  = chrome.y + chrome.h * 0.38
  const iconSz = Math.max(chrome.h * 0.22, 8)
  const iconX  = chrome.x + chrome.w - chrome.w * 0.06

  // Battery
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  rr(ctx, iconX - iconSz * 2.2, iconY - iconSz * 0.5, iconSz * 1.8, iconSz, 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(iconX - iconSz * 0.35, iconY - iconSz * 0.25, iconSz * 0.15, iconSz * 0.5)

  // WiFi arc (simplified dots)
  const wifiX = iconX - iconSz * 3.2
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(wifiX, iconY + iconSz * 0.4, iconSz * (0.18 + i * 0.22), Math.PI * 1.15, Math.PI * 1.85)
    ctx.strokeStyle = `rgba(255,255,255,${0.75 - i * 0.1})`
    ctx.lineWidth = Math.max(iconSz * 0.18, 1.5)
    ctx.stroke()
  }

  ctx.restore()
}

function renderIPhoneOverlay(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
  _theme: Theme,
) {
  const { chrome, card, screenshot, cornerR } = L

  ctx.save()

  // Dynamic Island
  const diW = Math.max(chrome.w * 0.22, 60)
  const diH = Math.max(chrome.h * 0.32, 18)
  const diX = chrome.x + (chrome.w - diW) / 2
  const diY = chrome.y + chrome.h * 0.12

  ctx.fillStyle = '#000000'
  rr(ctx, diX, diY, diW, diH, diH / 2)
  ctx.fill()

  // Home indicator
  const hiW = Math.max(card.w * 0.28, 60)
  const hiH = Math.max(card.h * 0.0055, 4)
  const hiX = card.x + (card.w - hiW) / 2
  const hiY = card.y + card.h - L.bottomChromeH * 0.38 - hiH / 2

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  rr(ctx, hiX, hiY, hiW, hiH, hiH / 2)
  ctx.fill()

  // Screen edge inner shadow (gives depth)
  const innerShadow = ctx.createRadialGradient(
    chrome.x + chrome.w / 2, chrome.y, 0,
    chrome.x + chrome.w / 2, chrome.y, chrome.w * 0.65,
  )
  innerShadow.addColorStop(0.85, 'transparent')
  innerShadow.addColorStop(1.0, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = innerShadow
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  ctx.restore()
}

function renderAndroidFrame(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
  _theme: Theme,
) {
  const { deviceBody, chrome, screenshot, outerCornerR, cornerR } = L

  ctx.save()

  // Device body
  ctx.fillStyle = '#141416'
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.fill()

  // Edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = Math.max(deviceBody.w * 0.006, 1.5)
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.stroke()

  // Screen bg
  ctx.fillStyle = '#050507'
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  // Status bar
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `500 ${Math.max(chrome.h * 0.28, 11)}px 'Inter',system-ui,sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('9:41', chrome.x + chrome.w * 0.055, chrome.y + chrome.h * 0.42)

  const iconY  = chrome.y + chrome.h * 0.42
  const iconSz = Math.max(chrome.h * 0.22, 7)
  const iconX  = chrome.x + chrome.w - chrome.w * 0.05

  // Battery
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  rr(ctx, iconX - iconSz * 2.0, iconY - iconSz * 0.5, iconSz * 1.6, iconSz, 2)
  ctx.fill()

  // WiFi
  const wifiX = iconX - iconSz * 3.0
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(wifiX, iconY + iconSz * 0.4, iconSz * (0.18 + i * 0.22), Math.PI * 1.15, Math.PI * 1.85)
    ctx.strokeStyle = `rgba(255,255,255,${0.75 - i * 0.1})`
    ctx.lineWidth = Math.max(iconSz * 0.18, 1.5)
    ctx.stroke()
  }

  ctx.restore()
}

function renderAndroidOverlay(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
) {
  const { chrome, card, screenshot, cornerR } = L
  ctx.save()

  // Camera hole-punch
  const camR = Math.max(chrome.w * 0.016, 7)
  const camX = chrome.x + chrome.w / 2
  const camY = chrome.y + chrome.h * 0.42

  ctx.beginPath()
  ctx.arc(camX, camY, camR, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()

  // Gesture nav bar (thin pill)
  const gbW = Math.max(card.w * 0.22, 48)
  const gbH = Math.max(card.h * 0.005, 3.5)
  const gbX = card.x + (card.w - gbW) / 2
  const gbY = card.y + card.h - L.bottomChromeH * 0.40 - gbH / 2

  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  rr(ctx, gbX, gbY, gbW, gbH, gbH / 2)
  ctx.fill()

  // Inner shadow
  const innerShadow = ctx.createRadialGradient(
    chrome.x + chrome.w / 2, chrome.y, 0,
    chrome.x + chrome.w / 2, chrome.y, chrome.w * 0.65,
  )
  innerShadow.addColorStop(0.85, 'transparent')
  innerShadow.addColorStop(1.0, 'rgba(0,0,0,0.20)')
  ctx.fillStyle = innerShadow
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  ctx.restore()
}

function renderIPadFrame(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
  _theme: Theme,
) {
  const { deviceBody, chrome, screenshot, outerCornerR, cornerR } = L

  ctx.save()

  // Device body
  ctx.fillStyle = '#141416'
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.09)'
  ctx.lineWidth = Math.max(deviceBody.w * 0.005, 1.5)
  rr(ctx, deviceBody.x, deviceBody.y, deviceBody.w, deviceBody.h, outerCornerR)
  ctx.stroke()

  // Screen bg
  ctx.fillStyle = '#050507'
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  // Status bar
  ctx.fillStyle = 'rgba(255,255,255,0.70)'
  ctx.font = `500 ${Math.max(chrome.h * 0.30, 11)}px 'Inter',system-ui,sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('9:41', chrome.x + chrome.w * 0.04, chrome.y + chrome.h * 0.50)
  ctx.textAlign = 'right'
  ctx.fillText('100%', chrome.x + chrome.w - chrome.w * 0.03, chrome.y + chrome.h * 0.50)

  ctx.restore()
}

function renderIPadOverlay(
  ctx: CanvasRenderingContext2D,
  L: ComputedLayout,
) {
  const { chrome, card, screenshot, cornerR } = L
  ctx.save()

  // Face ID slot (small pill, top center)
  const faceW = Math.max(chrome.w * 0.06, 20)
  const faceH = Math.max(chrome.h * 0.22, 8)
  const faceX = chrome.x + (chrome.w - faceW) / 2
  const faceY = chrome.y + (chrome.h - faceH) / 2

  ctx.fillStyle = '#0a0a0a'
  rr(ctx, faceX, faceY, faceW, faceH, faceH / 2)
  ctx.fill()

  // Home indicator
  const hiW = Math.max(card.w * 0.18, 40)
  const hiH = Math.max(card.h * 0.004, 3)
  const hiX = card.x + (card.w - hiW) / 2
  const hiY = card.y + card.h - L.bottomChromeH * 0.40 - hiH / 2

  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  rr(ctx, hiX, hiY, hiW, hiH, hiH / 2)
  ctx.fill()

  // Inner shadow
  const innerShadow = ctx.createRadialGradient(
    chrome.x + chrome.w / 2, chrome.y, 0,
    chrome.x + chrome.w / 2, chrome.y, chrome.w * 0.60,
  )
  innerShadow.addColorStop(0.85, 'transparent')
  innerShadow.addColorStop(1.0, 'rgba(0,0,0,0.18)')
  ctx.fillStyle = innerShadow
  rr(ctx, chrome.x, chrome.y, chrome.w, chrome.h + screenshot.h, [cornerR, cornerR, cornerR, cornerR])
  ctx.fill()

  ctx.restore()
}

// ─── MULTI-CALLOUT RENDERER ───────────────────────────────────────────────────
function renderMultiCallouts(
  ctx: CanvasRenderingContext2D,
  callouts: Callout[],
  screenshot: Rect,
  theme: Theme,
  motionProgress: number,
) {
  if (!callouts.length) return

  const alpha = motionProgress < 1.0
    ? Math.max(0, Math.min(1, (motionProgress - 0.55) / 0.22))
    : 1.0
  if (alpha < 0.01) return

  const sorted = [...callouts].sort((a, b) => a.order - b.order)
  const circleR  = Math.max(screenshot.w * 0.024, 13)
  const fontSize = Math.max(screenshot.w * 0.018, 11)
  const padX     = fontSize * 1.1
  const padY     = fontSize * 0.55

  ctx.save()
  ctx.globalAlpha = alpha

  for (const c of sorted) {
    const cx = screenshot.x + c.x * screenshot.w
    const cy = screenshot.y + c.y * screenshot.h

    // Drop shadow for circle
    ctx.save()
    ctx.shadowColor  = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur   = 10
    ctx.shadowOffsetY = 2
    ctx.beginPath()
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2)
    ctx.fillStyle = theme.accent
    ctx.fill()
    ctx.restore()

    // Number inside circle
    ctx.save()
    ctx.font = `800 ${Math.round(circleR * 0.9)}px 'Inter',system-ui,sans-serif`
    ctx.fillStyle    = '#0f172a'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(c.order), cx, cy + 0.5)
    ctx.restore()

    // Label pill
    if (c.label) {
      ctx.save()
      ctx.font = `600 ${fontSize}px 'Inter',system-ui,sans-serif`

      const tw = ctx.measureText(c.label).width
      const lw = tw + padX * 2
      const lh = fontSize + padY * 2

      // Position label right unless near right edge
      const toRight = cx + circleR + 8 + lw < screenshot.x + screenshot.w - 4
      const lx = toRight ? cx + circleR + 8 : cx - circleR - 8 - lw
      const ly = cy - lh / 2

      // Dashed leader line
      ctx.strokeStyle  = `${theme.accent}90`
      ctx.lineWidth    = Math.max(screenshot.w * 0.0015, 1.2)
      ctx.lineCap      = 'round'
      ctx.setLineDash([3, 3])
      const lineStartX = toRight ? cx + circleR + 3 : cx - circleR - 3
      const lineEndX   = toRight ? lx - 2 : lx + lw + 2
      ctx.beginPath()
      ctx.moveTo(lineStartX, cy)
      ctx.lineTo(lineEndX, cy)
      ctx.stroke()
      ctx.setLineDash([])

      // Label background pill
      ctx.shadowColor  = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur   = 8
      ctx.shadowOffsetY = 2
      ctx.fillStyle    = 'rgba(10, 12, 22, 0.90)'
      rr(ctx, lx, ly, lw, lh, lh / 2)
      ctx.fill()

      // Label border
      ctx.shadowColor  = 'transparent'
      ctx.strokeStyle  = `${theme.accent}50`
      ctx.lineWidth    = Math.max(screenshot.w * 0.001, 1)
      rr(ctx, lx, ly, lw, lh, lh / 2)
      ctx.stroke()

      // Label text
      ctx.fillStyle    = '#ffffff'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(c.label, lx + lw / 2, ly + lh / 2)
      ctx.restore()
    }
  }

  ctx.restore()
}

// ─── RENDERING PIPELINE ───────────────────────────────────────────────────────
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  watermark: Rect,
  compW: number,
  opts?: RenderOptions,
) {
  if (opts?.watermark === false) return
  ctx.save()
  const wms = Math.max(Math.round(compW * 0.012), 10)
  ctx.font          = `500 ${wms}px 'Inter',system-ui,sans-serif`
  ctx.textAlign     = 'right'
  ctx.textBaseline  = 'bottom'
  ctx.fillStyle     = 'rgba(255,255,255,0.26)'
  ctx.fillText('ShotPolish', watermark.x, watermark.y + watermark.h)
  ctx.restore()
}

export function renderComposition(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  theme: Theme,
  doc: CompositionDocument,
  L: ComputedLayout,
  motionProgress: number = 1.0,
  opts?: RenderOptions,
) {
  const { compW, compH, card, screenshot, headline: headL, watermark, cornerR, outerCornerR, deviceBody, frameType } = L
  const { shadowOpacity } = doc

  // 1. Background
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, compW, compH)

  const gcx  = compW / 2
  const gcy  = (card.y + card.h / 2) * 0.75
  const glowR = Math.max(compW, compH) * 0.78
  const grd  = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, glowR)
  grd.addColorStop(0, theme.glow)
  grd.addColorStop(0.5, theme.glowMid)
  grd.addColorStop(1, 'transparent')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, compW, compH)

  const vig = ctx.createRadialGradient(gcx, compH / 2, compH * 0.25, gcx, compH / 2, compH * 0.95)
  vig.addColorStop(0, 'transparent')
  vig.addColorStop(1, 'rgba(0,0,0,0.44)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, compW, compH)

  // 2. Headline
  let headlineAlpha = 1.0
  if (motionProgress < 1.0) headlineAlpha = Math.max(0, Math.min(1, (motionProgress - 0.10) / 0.25))

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

  // 3. Scale transform for motion (pivots on device body center)
  const cardScale = motionProgress < 1.0 ? 0.96 + 0.04 * motionProgress : 1.0
  const ccx = deviceBody.x + deviceBody.w / 2
  const ccy = deviceBody.y + deviceBody.h / 2

  ctx.save()
  ctx.translate(ccx, ccy)
  ctx.scale(cardScale, cardScale)
  ctx.translate(-ccx, -ccy)

  // 4. Shadow — cast from deviceBody for phones, card for browser/none
  if (shadowOpacity > 0.05) {
    const shadowTarget = frameType === 'browser' || frameType === 'none' ? card : deviceBody
    const shadowR      = frameType === 'browser' || frameType === 'none' ? cornerR : outerCornerR
    const sb = Math.max(shadowTarget.w * 0.048, 24) * shadowOpacity
    const so = Math.max(shadowTarget.w * 0.018, 10) * shadowOpacity

    ctx.save()
    ctx.shadowColor  = `rgba(0,0,0,${0.72 * shadowOpacity})`
    ctx.shadowBlur   = sb
    ctx.shadowOffsetY = so
    ctx.fillStyle = '#08080a'
    rr(ctx, shadowTarget.x, shadowTarget.y, shadowTarget.w, shadowTarget.h, shadowR)
    ctx.fill()

    ctx.shadowColor  = theme.glow.replace('0.42', `${0.28 * shadowOpacity}`)
    ctx.shadowBlur   = sb * 1.6
    ctx.shadowOffsetY = 0
    rr(ctx, shadowTarget.x, shadowTarget.y, shadowTarget.w, shadowTarget.h, shadowR)
    ctx.fill()
    ctx.restore()
  }

  // 5. Device frame background + chrome
  if (doc.screenshot.visible) {
    if (frameType === 'browser') {
      renderBrowserChrome(ctx, L)
    } else if (frameType === 'iphone') {
      renderIPhoneFrame(ctx, L, theme)
    } else if (frameType === 'android') {
      renderAndroidFrame(ctx, L, theme)
    } else if (frameType === 'ipad') {
      renderIPadFrame(ctx, L, theme)
    }

    // 6. Screenshot image
    ctx.save()
    if (frameType === 'browser') {
      rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [0, 0, cornerR, cornerR])
    } else if (frameType === 'none') {
      rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, cornerR)
    } else {
      // Mobile: screen corners
      rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [cornerR, cornerR, cornerR, cornerR])
    }
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, screenshot.x, screenshot.y, screenshot.w, screenshot.h)
    ctx.restore()

    // 7. Device overlays (drawn on top of screenshot)
    if (frameType === 'iphone')  renderIPhoneOverlay(ctx, L, theme)
    if (frameType === 'android') renderAndroidOverlay(ctx, L)
    if (frameType === 'ipad')    renderIPadOverlay(ctx, L)

    // 8. Spotlight — only renders when user explicitly draws a region
    const selection = doc.screenshot.selection

    if (selection) {
      const sX = screenshot.x + selection.x * screenshot.w
      const sY = screenshot.y + selection.y * screenshot.h
      const sW = selection.w * screenshot.w
      const sH = selection.h * screenshot.h

      const spotlightAlpha = motionProgress < 1.0
        ? Math.max(0, Math.min(1, (motionProgress - 0.20) / 0.25))
        : 1.0

      const pulse = (motionProgress < 1.0 && motionProgress >= 0.45)
        ? 1.0 + 0.05 * Math.sin((motionProgress - 0.45) * Math.PI * 4)
        : 1.0

      if (spotlightAlpha > 0.01) {
        ctx.save()
        if (frameType === 'browser') {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [0, 0, cornerR, cornerR])
        } else if (frameType === 'none') {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, cornerR)
        } else {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [cornerR, cornerR, cornerR, cornerR])
        }
        ctx.clip()
        ctx.globalAlpha = spotlightAlpha

        // --- DRAW OUTSIDE SPOTLIGHT (BACKGROUND SUPPRESSION) ---
        // Single subtle dimming — preserve context without destroying it
        ctx.fillStyle = 'rgba(0, 0, 0, 0.52)'
        ctx.fillRect(screenshot.x, screenshot.y, screenshot.w, screenshot.h)

        // --- DRAW INSIDE SPOTLIGHT (FOCUS CONTRACTION EFFECT) ---
        ctx.save()
        ctx.beginPath()
        ctx.rect(sX, sY, sW, sH)
        ctx.clip()

        const scaleFactor = 1.03
        const cx = sX + sW / 2
        const cy = sY + sH / 2

        ctx.translate(cx, cy)
        ctx.scale(scaleFactor, scaleFactor)
        ctx.translate(-cx, -cy)

        if ('filter' in ctx) {
          ctx.filter = 'contrast(115%) saturate(110%) brightness(105%)'
        }
        ctx.globalAlpha = 1.0
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, screenshot.x, screenshot.y, screenshot.w, screenshot.h)
        ctx.restore()

        // --- DRAW CINEMATIC RADIAL FEATHERED ATTENTION FALLBACK ---
        ctx.save()
        if (frameType === 'browser') {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [0, 0, cornerR, cornerR])
        } else if (frameType === 'none') {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, cornerR)
        } else {
          rr(ctx, screenshot.x, screenshot.y, screenshot.w, screenshot.h, [cornerR, cornerR, cornerR, cornerR])
        }
        ctx.clip()

        const outerR = Math.sqrt(
          Math.max(cx - screenshot.x, screenshot.x + screenshot.w - cx) ** 2 +
          Math.max(cy - screenshot.y, screenshot.y + screenshot.h - cy) ** 2
        ) * 1.1

        const innerR = Math.sqrt(sW * sW + sH * sH) * 0.38 * pulse

        const vig = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
        vig.addColorStop(0,    'rgba(0,0,0,0)')
        vig.addColorStop(0.25, 'rgba(0,0,0,0.04)')
        vig.addColorStop(0.50, 'rgba(0,0,0,0.14)')
        vig.addColorStop(0.70, 'rgba(0,0,0,0.28)')
        vig.addColorStop(0.85, 'rgba(0,0,0,0.42)')
        vig.addColorStop(1.00, 'rgba(0,0,0,0.55)')

        ctx.fillStyle = vig
        ctx.fillRect(screenshot.x, screenshot.y, screenshot.w, screenshot.h)
        ctx.restore()

        ctx.restore()
      }

      // 9. Callout annotation
      if (doc.screenshot.callout?.visible && doc.screenshot.callout.text) {
        const calloutAlpha = motionProgress < 1.0
          ? Math.max(0, Math.min(1, (motionProgress - 0.50) / 0.25))
          : 1.0
        const calloutYOffset = motionProgress < 1.0 ? 12 * (1 - calloutAlpha) : 0
        const arrowProgress  = motionProgress < 1.0
          ? Math.max(0, Math.min(1, (motionProgress - 0.48) / 0.18))
          : 1.0

        if (calloutAlpha > 0.01) {
          ctx.save()
          const cfs = Math.max(screenshot.w * 0.016, 13)
          ctx.font  = `700 ${cfs}px 'Inter','Segoe UI',system-ui,sans-serif`

          const tw  = ctx.measureText(doc.screenshot.callout.text).width
          const px  = cfs * 1.3, py = cfs * 0.75
          const pw  = tw + px * 2,  ph = cfs + py * 2
          const gap = Math.max(screenshot.h * 0.06, 36)

          const above = sY - gap - ph >= screenshot.y + 8
          const ly    = (above ? sY - gap - ph : sY + sH + gap) + calloutYOffset
          const lx    = Math.max(screenshot.x + 6, Math.min(sX + sW / 2 - pw / 2, screenshot.x + screenshot.w - pw - 6))

          const tipX = sX + sW / 2
          const tipY = above ? sY - 3 : sY + sH + 3
          const elbX = lx + pw / 2
          const elbY = above ? ly + ph : ly
          const midY = (elbY + tipY) / 2

          if (arrowProgress > 0.01) {
            ctx.save()
            ctx.globalAlpha  = calloutAlpha
            ctx.strokeStyle  = '#ffffff'
            ctx.fillStyle    = '#ffffff'
            ctx.lineWidth    = Math.max(screenshot.w * 0.002, 2)
            ctx.lineCap      = 'round'

            const len1 = Math.abs(midY - elbY), len2 = Math.abs(tipX - elbX), len3 = Math.abs(tipY - midY)
            const totalLength = len1 + len2 + len3
            ctx.setLineDash([totalLength])
            ctx.lineDashOffset = totalLength * (1 - arrowProgress)
            ctx.beginPath()
            ctx.moveTo(elbX, elbY)
            ctx.lineTo(elbX, midY)
            ctx.lineTo(tipX, midY)
            ctx.lineTo(tipX, tipY)
            ctx.stroke()

            if (arrowProgress > 0.95) {
              const scaleA = (arrowProgress - 0.95) / 0.05
              drawArrow(ctx, tipX, midY, tipX, tipY, Math.max(screenshot.w * 0.007, 7) * scaleA)
              ctx.beginPath()
              ctx.arc(tipX, tipY, Math.max(screenshot.w * 0.004, 4) * scaleA, 0, Math.PI * 2)
              ctx.fillStyle = theme.accent
              ctx.fill()
            }
            ctx.restore()
          }

          ctx.save()
          ctx.globalAlpha  = calloutAlpha
          ctx.shadowColor  = 'rgba(0,0,0,0.45)'
          ctx.shadowBlur   = Math.max(screenshot.w * 0.015, 16)
          ctx.shadowOffsetY = Math.max(screenshot.w * 0.006, 6)
          ctx.fillStyle    = theme.accent
          rr(ctx, lx, ly, pw, ph, 999)
          ctx.fill()

          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
          ctx.fillStyle    = '#0f172a'
          ctx.textAlign    = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(doc.screenshot.callout.text, lx + pw / 2, ly + ph / 2)
          ctx.restore()
          ctx.restore()
        }
      }
    }

    // Multi-callout annotations — numbered markers with labels, independent of spotlight
    if (doc.screenshot.callouts?.length) {
      renderMultiCallouts(ctx, doc.screenshot.callouts, screenshot, theme, motionProgress)
    }
  }

  ctx.restore() // end scale transform

  // 10. Watermark (suppressed for entitled users via opts.watermark === false)
  drawWatermark(ctx, watermark, compW, opts)
}
