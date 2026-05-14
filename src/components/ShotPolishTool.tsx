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
  { name: "Indigo",   colors: ["#312e81", "#4f46e5"], accent: "#818cf8" },
  { name: "Emerald",  colors: ["#064e3b", "#059669"], accent: "#34d399" },
  { name: "Rose",     colors: ["#4c0519", "#e11d48"], accent: "#fb7185" },
  { name: "Slate",    colors: ["#0f172a", "#1e293b"], accent: "#94a3b8" },
  { name: "Amber",    colors: ["#451a03", "#d97706"], accent: "#fcd34d" },
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

      // ── Background gradient ──────────────────────────────────────────────
      const grad = ctx.createLinearGradient(0, 0, canvas.width * 0.6, canvas.height)
      grad.addColorStop(0, theme.colors[0])
      grad.addColorStop(1, theme.colors[1])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Subtle noise texture feel via repeated small circles (no external dep)
      ctx.save()
      ctx.globalAlpha = 0.03
      for (let i = 0; i < 120; i++) {
        const rx = Math.random() * canvas.width
        const ry = Math.random() * canvas.height
        ctx.beginPath()
        ctx.arc(rx, ry, Math.random() * 60 + 10, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      }
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
          <div style={s.stepLabel}>Headline</div>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} style={s.input} placeholder="Your headline..." />
        </div>

        {/* Step 4: Callout */}
        <div style={{ ...s.step, flex: '2 1 220px' }}>
          <div style={s.stepNum}>4</div>
          <div style={s.stepLabel}>Callout</div>
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
                  const a = document.createElement('a')
                  a.href = processedImage
                  a.download = `shotpolish-${intent.replace(/\s+/g, '-').toLowerCase()}.png`
                  a.click()
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
    </div>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#080c14',
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    padding: '0 0 60px',
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '28px 24px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '28px',
  },
  userChip: {
    position: 'absolute',
    top: 20,
    right: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  userEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    maxWidth: 180,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  logoutBtn: {
    padding: '5px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },
  logo: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '-0.5px',
    color: '#fff',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    opacity: 0.4,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'flex-end',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '20px 24px',
    margin: '0 24px 28px',
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: '1 1 120px',
    minWidth: 110,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.35,
    letterSpacing: '0.08em',
  },
  stepLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    opacity: 0.5,
    fontWeight: 600,
    marginTop: -4,
  },
  select: {
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#1e2433',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  input: {
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: '#fff',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  themePicker: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    paddingTop: 4,
  },
  themeDot: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 0.15s, outline 0.15s',
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
    padding: '0 24px',
  },
  panel: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '20px',
    minHeight: 360,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  panelLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    opacity: 0.45,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    color: '#0f172a',
    opacity: 1,
  },
  dropzone: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    border: '2px dashed rgba(255,255,255,0.1)',
    borderRadius: 12,
    width: '100%',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    padding: '60px 20px',
    transition: 'border-color 0.2s',
  },
  dropIcon: {
    fontSize: 32,
    opacity: 0.3,
  },
  rawImg: {
    maxWidth: '100%',
    borderRadius: 8,
    display: 'block',
    userSelect: 'none',
  },
  resetBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
  },
  previewImg: {
    maxWidth: '100%',
    borderRadius: 12,
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  },
  emptyPreview: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.15)',
    fontSize: 13,
  },
  exportBtn: {
    padding: '12px 32px',
    border: 'none',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  },
}
