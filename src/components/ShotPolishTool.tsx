import { useRef, useState, useEffect, useCallback } from 'react'
import { Events } from '../lib/analytics'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const INTENT_MAP: Record<string, string> = {
  "Explain Feature":      "Check out this feature!",
  "Launch Product":       "We are officially live!",
  "Share Update":         "Here is what's new",
  "Highlight Improvement":"We made it even better",
  "Show Bug Fix":         "Fixed a frustrating bug",
  "Promote Benefit":      "Save time with this",
}

const CALLOUT_MAP: Record<string, string> = {
  "Explain Feature":      "This is where the magic happens",
  "Launch Product":       "Now available",
  "Share Update":         "New addition",
  "Highlight Improvement":"Faster than before",
  "Show Bug Fix":         "Issue resolved",
  "Promote Benefit":      "Saves hours of work",
}

const THEMES = [
  { name: "Indigo",  colors: ["#06080f", "#06080f"], accent: "#818cf8", glow: "rgba(99,102,241,0.35)",  glowMid: "rgba(99,102,241,0.08)"  },
  { name: "Emerald", colors: ["#030a06", "#030a06"], accent: "#34d399", glow: "rgba(16,185,129,0.32)",  glowMid: "rgba(16,185,129,0.07)"  },
  { name: "Rose",    colors: ["#0a0306", "#0a0306"], accent: "#fb7185", glow: "rgba(244,63,94,0.32)",   glowMid: "rgba(244,63,94,0.07)"   },
  { name: "Slate",   colors: ["#060809", "#060809"], accent: "#94a3b8", glow: "rgba(148,163,184,0.22)", glowMid: "rgba(148,163,184,0.05)" },
  { name: "Amber",   colors: ["#080600", "#080600"], accent: "#fcd34d", glow: "rgba(251,191,36,0.32)",  glowMid: "rgba(251,191,36,0.07)"  },
]

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Selection { x: number; y: number; w: number; h: number }
interface DragBox   { x: number; y: number; w: number; h: number }

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxWidth: number, lineHeight: number
): number {
  const words = text.split(' ')
  let line = ''
  let currentY = y
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' '
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY)
      line = words[n] + ' '
      currentY += lineHeight
    } else {
      line = testLine
    }
  }
  ctx.fillText(line.trim(), x, currentY)
  return currentY
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  toX: number, toY: number,
  size: number
) {
  const angle = Math.atan2(toY - y, toX - x)
  ctx.save()
  ctx.translate(toX, toY)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size / 2)
  ctx.lineTo(-size,  size / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function ShotPolishTool() {
  const [imageUrl,       setImageUrl]       = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [isRendering,    setIsRendering]    = useState(false)
  const [hasExported,    setHasExported]    = useState(false)
  const [showWaitlist,   setShowWaitlist]   = useState(false)
  const [waitlistEmail,  setWaitlistEmail]  = useState('')
  const [waitlistSent,   setWaitlistSent]   = useState(false)
  // Feedback modal state — inlined so it works regardless of App.tsx composition
  const [fbStatus,  setFbStatus]  = useState<'idle'|'open'|'submitting'|'success'|'error'>('idle')
  const [fbResult,  setFbResult]  = useState('')
  const [fbWilling, setFbWilling] = useState('')
  const [fbImprove, setFbImprove] = useState('')

  // Narrative
  const [intent,    setIntent]    = useState("Explain Feature")
  const [headline,  setHeadline]  = useState(INTENT_MAP["Explain Feature"])
  const [callout,   setCallout]   = useState(CALLOUT_MAP["Explain Feature"])
  const [selection, setSelection] = useState<Selection | null>(null)

  // Drawing
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragBox,   setDragBox]   = useState<DragBox | null>(null)

  // Style
  const [themeIndex, setThemeIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const sourceImgRef = useRef<HTMLImageElement>(null)
  const renderTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── File handling ────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(file))
    setSelection(null)
    Events.screenshotUploaded()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(file))
    setSelection(null)
    Events.screenshotUploaded()
  }

  // ── Intent sync ──────────────────────────────────────────────────────────
  const handleIntentChange = (newIntent: string) => {
    setIntent(newIntent)
    setHeadline(INTENT_MAP[newIntent] || "")
    setCallout(CALLOUT_MAP[newIntent] || "")
    Events.intentChanged(newIntent)
  }

  // ── Selection drawing ────────────────────────────────────────────────────
  const getScaleFactors = () => {
    const el = sourceImgRef.current
    if (!el) return { scaleX: 1, scaleY: 1 }
    // naturalWidth/naturalHeight for intrinsic dimensions
    return {
      scaleX: el.naturalWidth  / el.getBoundingClientRect().width,
      scaleY: el.naturalHeight / el.getBoundingClientRect().height,
    }
  }

  const startDrawing = (e: React.MouseEvent) => {
    if (!sourceImgRef.current) return
    const rect = sourceImgRef.current.getBoundingClientRect()
    setIsDrawing(true)
    setDragBox({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 })
  }

  const drawMove = (e: React.MouseEvent) => {
    if (!isDrawing || !dragBox || !sourceImgRef.current) return
    const rect = sourceImgRef.current.getBoundingClientRect()
    setDragBox({ ...dragBox, w: e.clientX - rect.left - dragBox.x, h: e.clientY - rect.top - dragBox.y })
  }

  const endDrawing = () => {
    if (!dragBox || !sourceImgRef.current) return
    setIsDrawing(false)
    const el = sourceImgRef.current
    const displayW = el.getBoundingClientRect().width
    const displayH = el.getBoundingClientRect().height
    const normW = Math.abs(dragBox.w) / displayW
    const normH = Math.abs(dragBox.h) / displayH
    if (normW > 0.03 && normH > 0.03) {
      setSelection({
        x: (dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w) / displayW,
        y: (dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h) / displayH,
        w: normW,
        h: normH,
      })
      Events.focusBoxDrawn()
    }
    setDragBox(null)
  }

  // ── Render engine ────────────────────────────────────────────────────────
  const render = useCallback(() => {
    if (!imageUrl) return
    setIsRendering(true)

    const theme = THEMES[themeIndex]
    const img = new Image()
    img.src = imageUrl
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const pad      = Math.min(img.width * 0.1, 160)
      const headSpace = headline ? 130 : 50
      const chromeH  = Math.max(img.height * 0.055, 38)

      canvas.width  = img.width  + pad * 2
      canvas.height = img.height + pad * 2 + chromeH + headSpace

      // ── Background: Emil-style deep base + single centered radial glow ────
      // 1. Deep near-black base fill
      ctx.fillStyle = theme.colors[0]
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 2. One large soft radial glow from center — the Emil signature move
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const glowR = Math.max(canvas.width, canvas.height) * 0.72
      const glow = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy * 0.7, glowR)
      glow.addColorStop(0,   theme.glow)
      glow.addColorStop(0.5, theme.glowMid)
      glow.addColorStop(1,   'transparent')
      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()

      // 3. Subtle vignette to deepen corners
      const vig = ctx.createRadialGradient(cx, cy, canvas.height * 0.3, cx, cy, canvas.height)
      vig.addColorStop(0,   'transparent')
      vig.addColorStop(1,   'rgba(0,0,0,0.45)')
      ctx.save()
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()

      const drawX = pad
      const drawY = pad + headSpace

      // ── Headline ─────────────────────────────────────────────────────────
      if (headline) {
        const fontSize = Math.max(Math.round(canvas.width * 0.034), 26)
        ctx.font = `800 ${fontSize}px 'Segoe UI', system-ui, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.shadowColor = 'rgba(0,0,0,0.4)'
        ctx.shadowBlur = 12
        wrapText(ctx, headline, canvas.width / 2, pad + 28, canvas.width * 0.75, fontSize * 1.35)
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
      }

      // ── Drop shadow behind card ──────────────────────────────────────────
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 60
      ctx.shadowOffsetY = 24
      ctx.fillStyle = '#e8e8e8'
      ctx.beginPath()
      // @ts-ignore
      ctx.roundRect?.(drawX, drawY, img.width, img.height + chromeH, 14)
      ctx.fill()
      ctx.restore()

      // ── macOS light titlebar ─────────────────────────────────────────────
      ctx.save()
      const titleGrad = ctx.createLinearGradient(0, drawY, 0, drawY + chromeH)
      titleGrad.addColorStop(0, '#ececec')
      titleGrad.addColorStop(1, '#d8d8d8')
      ctx.fillStyle = titleGrad
      ctx.beginPath()
      // @ts-ignore
      ctx.roundRect?.(drawX, drawY, img.width, chromeH, [14, 14, 0, 0])
      ctx.fill()
      // Separator line
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(drawX, drawY + chromeH)
      ctx.lineTo(drawX + img.width, drawY + chromeH)
      ctx.stroke()
      // Traffic lights
      const dotY = drawY + chromeH / 2
      const dots = ['#ff5f57', '#febc2e', '#28c840']
      dots.forEach((c, i) => {
        ctx.beginPath()
        ctx.arc(drawX + 20 + i * 20, dotY, 7, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.1)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(drawX + 20 + i * 20, dotY, 6, 0, Math.PI * 2)
        ctx.fillStyle = c
        ctx.fill()
      })
      // URL bar stub
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.beginPath()
      // @ts-ignore
      ctx.roundRect?.(drawX + img.width / 2 - 90, dotY - 10, 180, 20, 10)
      ctx.fill()
      ctx.restore()

      // ── Screenshot ───────────────────────────────────────────────────────
      ctx.save()
      ctx.beginPath()
      // @ts-ignore
      ctx.roundRect?.(drawX, drawY + chromeH, img.width, img.height, [0, 0, 14, 14])
      ctx.clip()
      ctx.drawImage(img, drawX, drawY + chromeH)
      ctx.restore()

      // ── Spotlight & Callout ───────────────────────────────────────────────
      if (selection) {
        const sX = drawX + selection.x * img.width
        const sY = drawY + chromeH + selection.y * img.height
        const sW = selection.w * img.width
        const sH = selection.h * img.height

        // 1. Dim overlay (clipped to screenshot area)
        ctx.save()
        ctx.beginPath()
        // @ts-ignore
        ctx.roundRect?.(drawX, drawY + chromeH, img.width, img.height, [0, 0, 14, 14])
        ctx.clip()
        ctx.fillStyle = 'rgba(0,0,0,0.68)'
        ctx.fillRect(drawX, drawY + chromeH, img.width, img.height)
        ctx.restore()

        // 2. Clear spotlight hole
        ctx.save()
        ctx.beginPath()
        ctx.rect(sX, sY, sW, sH)
        ctx.clip()
        ctx.drawImage(img, drawX, drawY + chromeH)
        ctx.restore()

        // 3. Spotlight border with glow
        ctx.save()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.shadowColor = theme.accent
        ctx.shadowBlur = 18
        ctx.strokeRect(sX, sY, sW, sH)
        ctx.restore()

        // 4. Corner accents on spotlight
        const cornerLen = Math.min(sW, sH) * 0.18
        ctx.save()
        ctx.strokeStyle = theme.accent
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        const corners = [
          [sX, sY, 1, 1], [sX + sW, sY, -1, 1],
          [sX, sY + sH, 1, -1], [sX + sW, sY + sH, -1, -1],
        ] as [number, number, number, number][]
        corners.forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath()
          ctx.moveTo(cx + dx * cornerLen, cy)
          ctx.lineTo(cx, cy)
          ctx.lineTo(cx, cy + dy * cornerLen)
          ctx.stroke()
        })
        ctx.restore()

        // 5. Smart Callout
        if (callout) {
          ctx.save()
          const fontSize = 17
          ctx.font = `700 ${fontSize}px 'Segoe UI', system-ui, sans-serif`
          const textW   = ctx.measureText(callout).width
          const padX    = 22, padY = 13
          const labelW  = textW + padX * 2
          const labelH  = fontSize + padY * 2

          // Decide position: prefer above, fall back to below
          const gap = 52
          let isAbove   = true
          let labelY    = sY - gap - labelH
          if (labelY < drawY + chromeH + 10) { isAbove = false; labelY = sY + sH + gap }

          const labelX   = Math.max(drawX + 8, Math.min(sX + sW / 2 - labelW / 2, drawX + img.width - labelW - 8))
          const arrowTipX = sX + sW / 2
          const arrowTipY = isAbove ? sY - 4 : sY + sH + 4

          const pillCX = labelX + labelW / 2
          const pillCY = isAbove ? labelY + labelH : labelY

          // Elbow arrow: two segments for a cleaner look than a weak bezier
          ctx.strokeStyle = '#ffffff'
          ctx.fillStyle   = '#ffffff'
          ctx.lineWidth   = 2.5
          ctx.lineCap     = 'round'
          ctx.beginPath()
          ctx.moveTo(pillCX, pillCY)
          ctx.lineTo(pillCX, (pillCY + arrowTipY) / 2)
          ctx.lineTo(arrowTipX, (pillCY + arrowTipY) / 2)
          ctx.lineTo(arrowTipX, arrowTipY)
          ctx.stroke()

          // Arrowhead
          ctx.fillStyle = '#ffffff'
          drawArrowhead(ctx, arrowTipX, (pillCY + arrowTipY) / 2, arrowTipX, arrowTipY, 9)

          // Dot at tip
          ctx.beginPath()
          ctx.arc(arrowTipX, arrowTipY, 5, 0, Math.PI * 2)
          ctx.fillStyle = theme.accent
          ctx.fill()

          // Label pill shadow
          ctx.shadowColor  = 'rgba(0,0,0,0.4)'
          ctx.shadowBlur   = 24
          ctx.shadowOffsetY = 8

          // Pill background (accent colored)
          ctx.fillStyle = theme.accent
          ctx.beginPath()
          // @ts-ignore
          ctx.roundRect?.(labelX, labelY, labelW, labelH, 999)
          ctx.fill()

          ctx.shadowColor = 'transparent'
          ctx.shadowBlur  = 0

          // Pill text
          ctx.fillStyle    = '#0f172a'
          ctx.textAlign    = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(callout, labelX + labelW / 2, labelY + labelH / 2)

          ctx.restore()
        }
      }

      // ── Watermark — viral loop driver ───────────────────────────────────
      // Small, tasteful, legible. Every share is a free ad.
      ctx.save()
      const wmText = 'shotpolish.com'
      const wmSize = Math.max(Math.round(canvas.width * 0.013), 11)
      ctx.font = `500 ${wmSize}px 'Inter', system-ui, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = 'rgba(255,255,255,0.30)'
      ctx.fillText(wmText, canvas.width - 16, canvas.height - 14)
      ctx.restore()

      setProcessedImage(canvas.toDataURL('image/png'))
      setIsRendering(false)
    }
  }, [imageUrl, selection, headline, callout, themeIndex])

  // Debounced render trigger
  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(render, 120)
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current) }
  }, [render])

  // Cleanup object URL on unmount
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [])

  // ── Feedback submit ─────────────────────────────────────────────────────
  const submitFeedback = async () => {
    if (!fbResult) return
    setFbStatus('submitting')
    // feedback_submitted — use plausible directly since track is standalone
    try { (window as any).plausible?.('feedback_submitted') } catch { /* noop */ }
    try {
      const res = await fetch('https://formspree.io/f/xvzyowzb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _type: 'feedback',
          'Did it work?': fbResult,
          'Would you pay?': fbWilling,
          'What would improve it?': fbImprove,
        }),
      })
      setFbStatus(res.ok ? 'success' : 'error')
    } catch { setFbStatus('error') }
  }

  const closeFeedback = () => {
    setFbStatus('idle')
    setFbResult('')
    setFbWilling('')
    setFbImprove('')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const theme = THEMES[themeIndex]

  return (
    <div style={s.container}>
      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={s.logo}>
            <span style={{ color: theme.accent }}>Shot</span>Polish
          </div>
          <div style={s.tagline}>Turn screenshots into stories</div>
        </div>

      </header>

      {/* Toolbar */}
      <div style={s.toolbar}>
        {/* Step 1: Upload */}
        <div style={s.step}>
          <div style={s.stepNum}>1</div>
          <div style={s.stepLabel}>Upload</div>
          <button onClick={() => fileInputRef.current?.click()} style={{ ...s.btn, background: theme.accent, color: '#0f172a' }}>
            Choose Image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
        </div>

        {/* Step 2: Intent */}
        <div style={s.step}>
          <div style={s.stepNum}>2</div>
          <div style={s.stepLabel}>Intent</div>
          <select value={intent} onChange={(e) => handleIntentChange(e.target.value)} style={s.select}>
            {Object.keys(INTENT_MAP).map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Step 3: Headline */}
        <div style={{ ...s.step, flex: '2 1 220px' }}>
          <div style={s.stepNum}>3</div>
          <div style={s.stepLabel}>
            Headline
            {headline !== INTENT_MAP[intent] && (
              <button onClick={() => setHeadline(INTENT_MAP[intent])} style={s.resetField} title="Reset to default">↺</button>
            )}
          </div>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} style={s.input} placeholder="Your headline..." />
        </div>

        {/* Step 4: Callout */}
        <div style={{ ...s.step, flex: '2 1 220px' }}>
          <div style={s.stepNum}>4</div>
          <div style={s.stepLabel}>
            Callout
            {callout !== CALLOUT_MAP[intent] && (
              <button onClick={() => setCallout(CALLOUT_MAP[intent])} style={s.resetField} title="Reset to default">↺</button>
            )}
          </div>
          <input value={callout} onChange={(e) => setCallout(e.target.value)} style={s.input} placeholder="Callout label..." />
        </div>

        {/* Theme */}
        <div style={s.step}>
          <div style={s.stepNum}>5</div>
          <div style={s.stepLabel}>Theme</div>
          <div style={s.themePicker}>
            {THEMES.map((t, i) => (
              <button
                key={t.name}
                title={t.name}
                onClick={() => setThemeIndex(i)}
                style={{
                  ...s.themeDot,
                  background: t.accent,
                  outline: i === themeIndex ? `2px solid #fff` : 'none',
                  transform: i === themeIndex ? 'scale(1.25)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Workspace */}
      <div style={s.workspace}>
        {/* Source + draw zone */}
        <div style={s.panel}>
          <div style={s.panelLabel}>
            <span style={{ color: theme.accent }}>⬡</span> Step 6 · Draw Focus Area
            {selection && <span style={{ ...s.badge, background: theme.accent }}>✓ Area set</span>}
          </div>

          {/* Live text preview — always shows current headline/callout state */}
          {imageUrl && (
            <div style={s.liveTextBar}>
              <div style={s.liveHeadline}>{headline || <span style={{ opacity: 0.3 }}>No headline</span>}</div>
              {callout && <div style={{ ...s.liveCallout, background: theme.accent }}>📌 {callout}</div>}
            </div>
          )}

          {!imageUrl ? (
            <div
              style={s.dropzone}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div style={s.dropIcon}>⬆</div>
              <div>Drop image or click to upload</div>
            </div>
          ) : (
            <div
              style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', overflow: 'hidden', borderRadius: 8 }}
              onMouseDown={startDrawing}
              onMouseMove={drawMove}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
            >
              <img ref={sourceImgRef} src={imageUrl} style={s.rawImg} draggable={false} />
              {/* Persisted selection overlay */}
              {selection && !isDrawing && sourceImgRef.current && (() => {
                const el = sourceImgRef.current!
                const dW = el.getBoundingClientRect().width
                const dH = el.getBoundingClientRect().height
                const sx = selection.x * dW
                const sy = selection.y * dH
                const sw = selection.w * dW
                const sh = selection.h * dH
                const dim = 'rgba(0,0,0,0.55)'
                return (
                  <>
                    <div style={{ position:'absolute', pointerEvents:'none', background: dim, left:0, top:0, width:'100%', height: sy }} />
                    <div style={{ position:'absolute', pointerEvents:'none', background: dim, left:0, top: sy+sh, width:'100%', height: `calc(100% - ${sy+sh}px)` }} />
                    <div style={{ position:'absolute', pointerEvents:'none', background: dim, left:0, top: sy, width: sx, height: sh }} />
                    <div style={{ position:'absolute', pointerEvents:'none', background: dim, left: sx+sw, top: sy, width: `calc(100% - ${sx+sw}px)`, height: sh }} />
                    <div style={{ position:'absolute', pointerEvents:'none', border: `2px solid ${theme.accent}`, left: sx, top: sy, width: sw, height: sh }} />
                  </>
                )
              })()}
              {/* Active drag overlay */}
              {dragBox && (
                <div style={{
                  position: 'absolute', pointerEvents: 'none',
                  border: `2px solid ${theme.accent}`,
                  background: `${theme.accent}22`,
                  left: dragBox.w > 0 ? dragBox.x : dragBox.x + dragBox.w,
                  top:  dragBox.h > 0 ? dragBox.y : dragBox.y + dragBox.h,
                  width: Math.abs(dragBox.w), height: Math.abs(dragBox.h),
                }} />
              )}
            </div>
          )}
          {selection && (
            <button onClick={() => setSelection(null)} style={s.resetBtn}>
              ✕ Clear focus
            </button>
          )}
        </div>

        {/* Preview zone */}
        <div style={s.panel}>
          <div style={s.panelLabel}>
            <span style={{ color: theme.accent }}>⬡</span> Preview
            {isRendering && <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 8 }}>rendering…</span>}
          </div>
          {processedImage ? (
            <>
              <img src={processedImage} style={s.previewImg} alt="Preview" />
              <button
                onClick={() => {
                  Events.exportCompleted(intent, THEMES[themeIndex].name)
                  // Append to DOM first — required for programmatic click
                  // on data URLs in Chrome, Safari, and Firefox
                  const a = document.createElement('a')
                  a.href = processedImage
                  a.download = `shotpolish-${intent.replace(/\s+/g, '-').toLowerCase()}.png`
                  a.style.display = 'none'
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  // Show waitlist immediately — no timeout, no race condition
                  if (!hasExported) {
                    setHasExported(true)
                    setShowWaitlist(true)
                  }
                }}
                style={{ ...s.exportBtn, background: theme.accent, color: '#0f172a' }}
              >
                ↓ Export Story
              </button>
            </>
          ) : (
            <div style={s.emptyPreview}>Upload an image to get started</div>
          )}
        </div>
      </div>
      {/* ── Feedback button — bottom left, always visible ─────────────────── */}
      <button
        onClick={() => { setFbStatus('open') }}
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 9000,
          padding: '10px 18px',
          background: 'rgba(129,140,248,0.12)',
          color: '#818cf8',
          border: '1px solid rgba(129,140,248,0.35)',
          borderRadius: 999, fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          fontFamily: "'Inter', system-ui, sans-serif",
          whiteSpace: 'nowrap' as const,
        }}
      >
        💬 Feedback
      </button>

      {/* ── Feedback modal ──────────────────────────────────────────────────── */}
      {fbStatus !== 'idle' && (
        <div
          onClick={e => e.target === e.currentTarget && closeFeedback()}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
            padding: '0 24px 80px',
          }}
        >
          <div style={{
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '24px', width: '100%', maxWidth: 340,
            display: 'flex', flexDirection: 'column' as const, gap: 18,
            boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>Quick feedback</span>
              <button onClick={closeFeedback} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
            </div>

            {fbStatus === 'success' ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12, textAlign: 'center' as const, padding: '8px 0' }}>
                <div style={{ fontSize: 28 }}>🙏</div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>Thank you — genuinely read by the founder.</p>
                <button onClick={closeFeedback} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#818cf8', color: '#0f172a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
            ) : fbStatus === 'error' ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12, textAlign: 'center' as const }}>
                <div style={{ fontSize: 28 }}>⚠️</div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: 0 }}>Something went wrong. Please try again.</p>
                <button onClick={() => setFbStatus('open')} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#818cf8', color: '#0f172a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
              </div>
            ) : (
              <>
                {/* Q1 */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Did you get the result you wanted? *</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {['Yes ✓', 'Almost', 'No'].map(opt => (
                      <button key={opt} onClick={() => setFbResult(opt)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: fbResult === opt ? '#818cf8' : 'transparent', color: fbResult === opt ? '#0f172a' : 'rgba(255,255,255,0.45)', fontWeight: fbResult === opt ? 700 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{opt}</button>
                    ))}
                  </div>
                </div>
                {/* Q2 */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>Would you pay for a Pro version?</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {['Yes', 'Maybe', 'No'].map(opt => (
                      <button key={opt} onClick={() => setFbWilling(opt)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: fbWilling === opt ? '#818cf8' : 'transparent', color: fbWilling === opt ? '#0f172a' : 'rgba(255,255,255,0.45)', fontWeight: fbWilling === opt ? 700 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{opt}</button>
                    ))}
                  </div>
                </div>
                {/* Q3 */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>What would make it better? <span style={{ opacity: 0.35 }}>(optional)</span></label>
                  <textarea value={fbImprove} onChange={e => setFbImprove(e.target.value)} placeholder="Any feature, complaint, or idea..." rows={3}
                    style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' as const, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' as const, width: '100%' }} />
                </div>
                <button onClick={submitFeedback} disabled={!fbResult || fbStatus === 'submitting'}
                  style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: '#818cf8', color: '#0f172a', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: !fbResult ? 'not-allowed' : 'pointer', opacity: !fbResult || fbStatus === 'submitting' ? 0.4 : 1 }}>
                  {fbStatus === 'submitting' ? 'Sending…' : 'Send feedback →'}
                </button>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' as const, margin: '-6px 0 0' }}>Takes 20 seconds.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pro waitlist banner — shows once after first export */}
      {showWaitlist && (
        <div style={s.waitlistBanner}>
          <button onClick={() => setShowWaitlist(false)} style={s.waitlistClose} aria-label="Dismiss">✕</button>
          {waitlistSent ? (
            <div style={{ textAlign: 'center' as const, padding: '4px 0' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                You're on the list. We'll email you when Pro launches.
              </div>
            </div>
          ) : (
            <div style={s.waitlistContent}>
              <div style={s.waitlistText}>
                <span style={{ color: theme.accent, fontWeight: 700 }}>Pro is coming.</span>
                {' '}Remove watermark, custom fonts, extra themes.
              </div>
              <div style={s.waitlistInputRow}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={waitlistEmail}
                  onChange={e => setWaitlistEmail(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && waitlistEmail.includes('@')) {
                      Events.pricingInterestShown()
                      fetch('https://formspree.io/f/mnjrqgpw', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify({ email: waitlistEmail, source: 'post-export-banner' }),
                      }).finally(() => setWaitlistSent(true))
                    }
                  }}
                  style={s.waitlistInput}
                />
                <button
                  onClick={() => {
                    if (!waitlistEmail.includes('@')) return
                    Events.pricingInterestShown()
                    fetch('https://formspree.io/f/mnjrqgpw', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                      body: JSON.stringify({ email: waitlistEmail, source: 'post-export-banner' }),
                    }).finally(() => setWaitlistSent(true))
                  }}
                  style={{ ...s.waitlistBtn, background: theme.accent, color: '#0f172a' }}
                >
                  Join →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── STYLES — Emil Kowalski aesthetic ────────────────────────────────────────
// Key principles:
//   • Near-black backgrounds (#06080f), never pure black
//   • One radial glow per surface — never two competing gradients
//   • Glass cards: barely-there white border + backdrop-filter blur
//   • Typography: Inter, tight letter-spacing, high contrast whites
//   • Generous padding, very little visual noise
//   • Buttons: ghost style with glow on active state, never flat fills

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#06080f',
    color: '#e8eaf0',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    padding: '0 0 80px',
    // Subtle radial glow from top-center — same technique as Emil's sites
    backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.15) 0%, transparent 70%)',
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '48px 24px 32px',
    marginBottom: '32px',
  },
  userChip: {
    position: 'absolute',
    top: 24,
    right: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  userEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    maxWidth: 180,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  logoutBtn: {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  logo: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: '-0.8px',
    color: '#fff',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.04em',
    fontWeight: 400,
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 16,
    alignItems: 'flex-end',
    // Glass card — Emil's signature surface treatment
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '20px 24px',
    margin: '0 24px 24px',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
  step: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 7,
    flex: '1 1 120px',
    minWidth: 110,
  },
  stepNum: {
    fontSize: 10,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: '0.06em',
  },
  stepLabel: {
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 500,
    marginTop: -2,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  resetField: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  select: {
    padding: '8px 11px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#1a1f2e',   // solid dark — rgba backgrounds break native <select> on all browsers
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    letterSpacing: '0.01em',
    appearance: 'auto' as const,
  },
  input: {
    padding: '8px 11px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 400,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    letterSpacing: '0.01em',
  },
  btn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.01em',
    transition: 'opacity 0.15s',
  },
  themePicker: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    paddingTop: 2,
  },
  themeDot: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 0.12s, box-shadow 0.12s',
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    padding: '0 24px',
  },
  panel: {
    // Glass card — Emil's primary surface
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: '24px',
    minHeight: 400,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 16,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  panelLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    color: '#000',
    opacity: 1,
    letterSpacing: '0.03em',
  },
  dropzone: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 12,
    width: '100%',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    padding: '60px 20px',
    transition: 'border-color 0.2s, background 0.2s',
    letterSpacing: '0.01em',
  },
  dropIcon: {
    fontSize: 28,
    opacity: 0.2,
  },
  rawImg: {
    maxWidth: '100%',
    borderRadius: 10,
    display: 'block',
    userSelect: 'none' as const,
  },
  resetBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  previewImg: {
    maxWidth: '100%',
    borderRadius: 14,
    // Deep shadow — makes the export look like it's floating
    boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.8)',
  },
  emptyPreview: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.12)',
    fontSize: 13,
    letterSpacing: '0.01em',
  },
  exportBtn: {
    padding: '11px 28px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    letterSpacing: '0.03em',
    // Glow effect on the export button — reward for reaching the final step
    boxShadow: '0 0 24px rgba(0,0,0,0.4)',
    transition: 'opacity 0.15s, box-shadow 0.15s',
  },
  liveTextBar: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginBottom: 4,
  },
  liveHeadline: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center' as const,
    lineHeight: 1.5,
    wordBreak: 'break-word' as const,
    letterSpacing: '-0.01em',
  },
  liveCallout: {
    fontSize: 11,
    fontWeight: 600,
    color: '#000',
    padding: '3px 10px',
    borderRadius: 999,
    letterSpacing: '0.02em',
  },
  waitlistBanner: {
    position: 'fixed' as const,
    bottom: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    background: 'rgba(10,12,20,0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: '16px 20px',
    maxWidth: 480,
    width: 'calc(100vw - 48px)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  },
  waitlistContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  waitlistText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
    minWidth: 200,
  },
  waitlistBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    textDecoration: 'none',
    letterSpacing: '0.01em',
  },
  waitlistClose: {
    position: 'absolute' as const,
    top: 10,
    right: 12,
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
    lineHeight: 1,
  },
  waitlistInputRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  waitlistInput: {
    flex: 1,
    minWidth: 160,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 13,
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
  },
}