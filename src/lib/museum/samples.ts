// Painted sample "photos" for the example museum at /museum/example, so
// visitors can walk a museum before building one. Deterministic (seeded) art,
// drawn once on canvases; no network or stock images.
import type { ViewerMuseum } from './api'

const AW = 800
const AH = 1000
type G = CanvasRenderingContext2D

function canvas(w = AW, h = AH): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function rng(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundRect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
const circle = (g: G, x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
const ellipse = (g: G, x: number, y: number, rx: number, ry: number) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill() }
function linear(g: G, y0: number, y1: number, stops: [number, string][]) {
  const grad = g.createLinearGradient(0, y0, 0, y1)
  for (const [o, c] of stops) grad.addColorStop(o, c)
  return grad
}

/** Vignette + film grain so the paintings read as photos on a wall. */
function finish(g: G) {
  const v = g.createRadialGradient(AW / 2, AH / 2, AW * 0.3, AW / 2, AH / 2, AW * 0.9)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,.45)')
  g.fillStyle = v
  g.fillRect(0, 0, AW, AH)
  const r = rng(99)
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'
    g.fillRect(r() * AW, r() * AH, 1.5, 1.5)
  }
}

function paintLisbon(): HTMLCanvasElement {
  const [c, g] = canvas()
  const r = rng(7)
  g.fillStyle = linear(g, 0, 640, [[0, '#0a1230'], [0.6, '#1c2b58'], [1, '#46426e']])
  g.fillRect(0, 0, AW, AH)
  for (const [x, top, w] of [[0, 250, 170], [150, 190, 150], [280, 300, 130], [400, 210, 170], [560, 260, 120], [660, 170, 150]]) {
    g.fillStyle = '#10152b'
    g.beginPath(); g.moveTo(x - 6, top); g.lineTo(x + w / 2, top - 34); g.lineTo(x + w + 6, top); g.fill()
    g.fillStyle = '#141a33'
    g.fillRect(x, top, w, 640 - top)
    for (let wy = top + 26; wy < 600; wy += 46) {
      for (let wx = x + 16; wx < x + w - 20; wx += 34) {
        if (r() < 0.45) { g.fillStyle = r() < 0.5 ? '#ffc867' : '#f6a94a'; g.globalAlpha = 0.55 + r() * 0.4; g.fillRect(wx, wy, 16, 24); g.globalAlpha = 1 }
        else { g.fillStyle = '#0c1024'; g.fillRect(wx, wy, 16, 24) }
      }
    }
  }
  g.fillStyle = linear(g, 640, 1000, [[0, '#22233d'], [1, '#0b0c18']])
  g.fillRect(0, 640, AW, 360)
  g.strokeStyle = 'rgba(200,200,230,.35)'; g.lineWidth = 3
  g.beginPath(); g.moveTo(0, 770); g.lineTo(800, 730); g.moveTo(0, 810); g.lineTo(800, 766); g.stroke()
  g.strokeStyle = '#0d0f1c'; g.lineWidth = 2
  g.beginPath(); g.moveTo(0, 420); g.lineTo(800, 400); g.stroke()
  g.fillStyle = '#0d0f1c'; g.fillRect(612, 330, 10, 330); g.fillRect(586, 326, 50, 10)
  const glow = g.createRadialGradient(600, 350, 4, 600, 350, 170)
  glow.addColorStop(0, 'rgba(255,214,140,.95)'); glow.addColorStop(0.18, 'rgba(255,190,110,.45)'); glow.addColorStop(1, 'rgba(255,190,110,0)')
  g.fillStyle = glow; g.fillRect(400, 150, 400, 400)
  const tx = 110, ty = 560, tw = 380, th = 170
  g.strokeStyle = '#0d0f1c'; g.lineWidth = 4
  g.beginPath(); g.moveTo(tx + tw / 2, ty - 14); g.lineTo(tx + tw / 2 + 120, 408); g.stroke()
  g.fillStyle = '#e9a92c'; roundRect(g, tx, ty, tw, th, 18); g.fill()
  g.fillStyle = '#f4c75a'; g.fillRect(tx + 8, ty + th - 58, tw - 16, 10)
  g.fillStyle = '#c4c2c0'; roundRect(g, tx + 10, ty - 14, tw - 20, 22, 8); g.fill()
  for (let i = 0; i < 5; i++) {
    const wx = tx + 22 + i * 70
    g.fillStyle = '#ffdf9c'; roundRect(g, wx, ty + 22, 54, 62, 6); g.fill()
    g.fillStyle = 'rgba(120,70,20,.35)'; g.fillRect(wx, ty + 62, 54, 22)
  }
  g.fillStyle = '#1b1b2e'; g.font = '700 30px Jost, sans-serif'; g.fillText('28', tx + tw - 62, ty + 130)
  g.fillStyle = '#0b0b14'; circle(g, tx + 60, ty + th + 4, 20); circle(g, tx + tw - 60, ty + th + 4, 20)
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,200,110,${0.05 + r() * 0.12})`; g.fillRect(tx + r() * tw, 790 + r() * 50, 2 + r() * 6, 60 + r() * 120) }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,214,140,${0.05 + r() * 0.1})`; g.fillRect(596 + r() * 40, 700 + r() * 60, 2 + r() * 4, 80 + r() * 140) }
  const ux = 660, uy = 770
  g.fillStyle = '#07070d'
  roundRect(g, ux - 36, uy, 28, 92, 12); g.fill(); roundRect(g, ux + 6, uy + 4, 28, 88, 12); g.fill()
  circle(g, ux - 22, uy - 14, 15); circle(g, ux + 20, uy - 10, 14)
  g.fillStyle = '#c8323c'; g.beginPath(); g.arc(ux, uy - 32, 74, Math.PI, 0); g.closePath(); g.fill()
  g.strokeStyle = '#07070d'; g.lineWidth = 4; g.beginPath(); g.moveTo(ux, uy - 32); g.lineTo(ux, uy + 30); g.stroke()
  g.strokeStyle = 'rgba(210,220,255,.22)'; g.lineWidth = 1.5
  for (let i = 0; i < 260; i++) { const x = r() * 820, y = r() * 1000; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 26); g.stroke() }
  finish(g)
  return c
}

function paintPancakes(): HTMLCanvasElement {
  const [c, g] = canvas()
  const r = rng(11)
  g.fillStyle = linear(g, 0, 640, [[0, '#f2dfbf'], [1, '#e2bf8c']]); g.fillRect(0, 0, AW, 640)
  g.strokeStyle = 'rgba(150,110,60,.2)'; g.lineWidth = 2
  for (let y = 300, row = 0; y < 640; y += 56, row++) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(800, y); g.stroke()
    for (let x = (row % 2) * 40; x < 800; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 56); g.stroke() }
  }
  g.fillStyle = 'rgba(255,250,230,.35)'
  g.beginPath(); g.moveTo(520, 0); g.lineTo(800, 0); g.lineTo(800, 300); g.lineTo(640, 420); g.closePath(); g.fill()
  g.fillStyle = '#f7f3ea'; circle(g, 140, 80, 34); g.fillStyle = '#d9d2c4'; circle(g, 140, 80, 22); g.fillStyle = '#e0303a'; circle(g, 152, 72, 5)
  g.strokeStyle = 'rgba(224,48,58,.7)'; g.lineWidth = 4
  for (const k of [0, 1, 2]) { g.beginPath(); g.arc(140, 80, 48 + k * 16, -0.5, 0.5); g.stroke() }
  g.fillStyle = linear(g, 640, 1000, [[0, '#b67c45'], [1, '#7a4c24']]); g.fillRect(0, 640, AW, 360)
  g.fillStyle = 'rgba(60,30,10,.25)'; for (let i = 0; i < 18; i++) g.fillRect(0, 650 + i * 20 + r() * 6, 800, 2)
  g.fillStyle = 'rgba(40,20,5,.35)'; ellipse(g, 410, 852, 250, 62)
  g.fillStyle = '#fbf8f2'; ellipse(g, 400, 836, 250, 66); g.fillStyle = '#ece6da'; ellipse(g, 400, 830, 190, 46)
  const cols = ['#d99a4f', '#d4914a', '#cf8a44', '#c98140']
  for (let i = 0; i < 5; i++) {
    const y = 812 - i * 42, dx = (r() - 0.5) * 12
    g.fillStyle = '#a8662a'; ellipse(g, 400 + dx, y + 10, 170, 40)
    g.fillStyle = cols[i % 4]; ellipse(g, 400 + dx, y, 166, 36)
  }
  const ty = 812 - 5 * 42
  g.fillStyle = '#3b2312'; ellipse(g, 404, ty + 8, 160, 36); g.fillStyle = '#5a3418'; ellipse(g, 404, ty, 152, 30)
  g.fillStyle = '#f7dc6f'; roundRect(g, 372, ty - 26, 58, 34, 6); g.fill(); g.fillStyle = '#fff2a8'; g.fillRect(378, ty - 22, 40, 6)
  g.fillStyle = 'rgba(120,55,10,.85)'
  for (const dx of [-120, -60, 40, 110]) { roundRect(g, 400 + dx, ty + 22, 14, 60 + r() * 90, 7); g.fill() }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(90,85,80,${0.1 + r() * 0.12})`; circle(g, 360 + r() * 120 + i * 6, ty - 60 - i * 30, 30 + i * 5) }
  finish(g)
  return c
}

function paintRoad(): HTMLCanvasElement {
  const [c, g] = canvas()
  const r = rng(23)
  g.fillStyle = linear(g, 0, 560, [[0, '#2a1c4d'], [0.55, '#b44d79'], [1, '#f7a65c']]); g.fillRect(0, 0, AW, 560)
  g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 50; i++) circle(g, r() * 800, r() * 200, r() * 1.6 + 0.4)
  const sg = g.createRadialGradient(400, 520, 10, 400, 520, 260)
  sg.addColorStop(0, 'rgba(255,214,130,.9)'); sg.addColorStop(1, 'rgba(255,214,130,0)')
  g.fillStyle = sg; g.fillRect(0, 200, 800, 400)
  g.fillStyle = '#ffd27a'; circle(g, 400, 540, 120)
  g.save(); g.beginPath(); g.arc(400, 540, 120, 0, Math.PI * 2); g.clip()
  g.fillStyle = '#e9867a'; for (let i = 0; i < 6; i++) g.fillRect(260, 470 + i * 16 + i * i * 1.2, 280, 3 + i * 1.6)
  g.restore()
  const hill = (color: string, pts: [number, number][]) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, 600)
    for (const [x, y] of pts) g.lineTo(x, y)
    g.lineTo(800, 600); g.closePath(); g.fill()
  }
  hill('#5b2c62', [[0, 520], [160, 470], [330, 510], [520, 455], [800, 500]])
  hill('#3b1f4a', [[0, 560], [200, 520], [420, 548], [640, 505], [800, 540]])
  g.fillStyle = '#24162f'; g.fillRect(0, 560, 800, 440)
  g.fillStyle = '#17121f'; g.beginPath(); g.moveTo(388, 560); g.lineTo(412, 560); g.lineTo(760, 1000); g.lineTo(40, 1000); g.closePath(); g.fill()
  g.strokeStyle = 'rgba(255,240,220,.6)'; g.lineWidth = 4
  g.beginPath(); g.moveTo(390, 560); g.lineTo(80, 1000); g.moveTo(410, 560); g.lineTo(720, 1000); g.stroke()
  g.fillStyle = '#ffcf5a'
  for (let i = 0; i < 9; i++) {
    const t0 = Math.pow(i / 9, 1.8), t1 = Math.pow((i + 0.5) / 9, 1.8)
    const y0 = 560 + t0 * 440, y1 = 560 + t1 * 440, w0 = 2 + t0 * 14, w1 = 2 + t1 * 14
    g.beginPath(); g.moveTo(400 - w0 / 2, y0); g.lineTo(400 + w0 / 2, y0); g.lineTo(400 + w1 / 2, y1); g.lineTo(400 - w1 / 2, y1); g.closePath(); g.fill()
  }
  const cx = 470, cy = 800
  for (const sx of [-1, 1]) {
    const lx = cx + sx * 70
    const tg = g.createRadialGradient(lx, cy - 30, 2, lx, cy - 30, 70)
    tg.addColorStop(0, 'rgba(255,60,70,.8)'); tg.addColorStop(1, 'rgba(255,60,70,0)')
    g.fillStyle = tg; g.fillRect(lx - 70, cy - 100, 140, 140)
  }
  g.fillStyle = '#0e0b14'; roundRect(g, cx - 90, cy - 60, 180, 90, 16); g.fill(); roundRect(g, cx - 64, cy - 104, 128, 56, 18); g.fill()
  g.fillStyle = '#3d3550'; roundRect(g, cx - 54, cy - 96, 108, 40, 10); g.fill()
  g.fillStyle = '#0e0b14'; circle(g, cx - 22, cy - 70, 13); circle(g, cx + 22, cy - 68, 13)
  g.fillStyle = '#ff4b5a'; for (const sx of [-1, 1]) { roundRect(g, cx + sx * 70 - 14, cy - 38, 28, 14, 4); g.fill() }
  g.fillStyle = 'rgba(255,236,200,.88)'; g.font = '600 46px Jost, sans-serif'
  g.fillText('♪', cx - 130, cy - 150); g.fillText('♫', cx + 70, cy - 190)
  g.font = '600 34px Jost, sans-serif'; g.fillText('♪', cx + 6, cy - 240)
  finish(g)
  return c
}

function paintRooftop(): HTMLCanvasElement {
  const [c, g] = canvas()
  const r = rng(31)
  g.fillStyle = linear(g, 0, 700, [[0, '#3d3470'], [0.45, '#d9667a'], [0.8, '#ffb36b'], [1, '#ffd99a']]); g.fillRect(0, 0, AW, 700)
  g.fillStyle = 'rgba(255,190,170,.35)'; for (let i = 0; i < 5; i++) ellipse(g, r() * 800, 120 + r() * 220, 90 + r() * 80, 12 + r() * 10)
  const sg = g.createRadialGradient(560, 600, 10, 560, 600, 300)
  sg.addColorStop(0, 'rgba(255,230,160,.95)'); sg.addColorStop(1, 'rgba(255,230,160,0)')
  g.fillStyle = sg; g.fillRect(200, 300, 600, 500)
  g.fillStyle = '#fff0c2'; circle(g, 560, 610, 90)
  let x = 0
  while (x < 800) {
    const w = 50 + r() * 90, h = 120 + r() * 260
    g.fillStyle = '#2b2142'; g.fillRect(x, 700 - h, w, h + 10)
    if (r() < 0.4) g.fillRect(x + w / 2 - 3, 700 - h - 40, 6, 40)
    g.fillStyle = 'rgba(255,210,140,.55)'
    for (let wy = 700 - h + 16; wy < 690; wy += 28) for (let wx = x + 10; wx < x + w - 12; wx += 22) if (r() < 0.18) g.fillRect(wx, wy, 9, 12)
    x += w + 6
  }
  g.strokeStyle = 'rgba(40,25,50,.8)'; g.lineWidth = 3
  for (let i = 0; i < 5; i++) {
    const bx = 150 + r() * 300, by = 180 + r() * 120, s = 8 + r() * 8
    g.beginPath(); g.moveTo(bx - s, by); g.quadraticCurveTo(bx - s / 2, by - s * 0.6, bx, by); g.quadraticCurveTo(bx + s / 2, by - s * 0.6, bx + s, by); g.stroke()
  }
  g.fillStyle = '#17111f'; g.fillRect(0, 780, 800, 220); g.fillStyle = '#231a2e'; g.fillRect(0, 770, 800, 22)
  g.strokeStyle = '#17111f'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 690); g.lineTo(800, 690); g.stroke()
  g.lineWidth = 4; for (let rx = 20; rx < 800; rx += 60) { g.beginPath(); g.moveTo(rx, 690); g.lineTo(rx, 775); g.stroke() }
  const fx = 330
  g.fillStyle = '#120d18'; circle(g, fx, 660, 30); roundRect(g, fx - 44, 688, 88, 96, 30); g.fill()
  circle(g, fx + 90, 668, 28); roundRect(g, fx + 48, 694, 86, 90, 30); g.fill()
  g.fillStyle = '#2c2238'; roundRect(g, fx + 44, 692, 96, 44, 20); g.fill()
  finish(g)
  return c
}

const EXAMPLE_EXHIBITS = [
  { title: 'The Night We Missed the Last Train', place: 'Lisbon', year: '2024', medium: 'bad decisions, one shared umbrella', paint: paintLisbon },
  { title: 'First Attempt at Pancakes', place: 'Our kitchen', year: '2023', medium: 'flour, a smoke alarm, optimism', paint: paintPancakes },
  { title: 'The Road Trip Playlist Dispute', place: 'Highway 1', year: '2024', medium: 'two aux cords, zero compromise', paint: paintRoad },
  { title: 'Golden Hour, Unplanned', place: 'A rooftop we weren’t supposed to be on', year: '2025', medium: 'one borrowed jacket, perfect timing', paint: paintRooftop },
]

let cached: ViewerMuseum | null = null

export function exampleMuseum(): ViewerMuseum {
  if (cached) return cached
  cached = {
    recipientName: 'Sam',
    curatorName: 'Alex',
    branded: true,
    finalPhotoUrl: null,
    exhibits: EXAMPLE_EXHIBITS.map(({ paint, ...e }) => ({ ...e, photoUrl: paint().toDataURL('image/jpeg', 0.9) })),
  }
  return cached
}
