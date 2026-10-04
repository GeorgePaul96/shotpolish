// The "Masterpiece" card the recipient posts: their portrait in a gilt frame
// under a spotlight, with a museum plaque. Free museums carry the remix badge
// (the viral loop); full museums are unbranded.
import { remixHost } from '../remix'
import { coverCrop } from './image'

const W = 1080
const H = 1350

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Waits (briefly) for the museum fonts so canvas text doesn't fall back to Georgia. */
async function fontsReady(): Promise<void> {
  if (!document.fonts?.load) return
  const loads = Promise.all([
    document.fonts.load('600 54px "Cormorant Garamond"'),
    document.fonts.load('italic 500 30px "Cormorant Garamond"'),
    document.fonts.load('500 24px Jost'),
  ]).catch(() => undefined)
  await Promise.race([loads, new Promise((r) => setTimeout(r, 1500))])
}

export async function renderShareCard(
  portrait: CanvasImageSource,
  portraitWidth: number,
  portraitHeight: number,
  recipientName: string,
  branded: boolean,
): Promise<HTMLCanvasElement> {
  await fontsReady()
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  const wall = g.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#24443a')
  wall.addColorStop(1, '#0e1d18')
  g.fillStyle = wall
  g.fillRect(0, 0, W, H)

  const beam = g.createLinearGradient(0, 0, 0, H * 0.8)
  beam.addColorStop(0, 'rgba(255,226,176,.35)')
  beam.addColorStop(1, 'rgba(255,226,176,0)')
  g.fillStyle = beam
  g.beginPath()
  g.moveTo(W * 0.45, 0)
  g.lineTo(W * 0.55, 0)
  g.lineTo(W * 0.92, H * 0.8)
  g.lineTo(W * 0.08, H * 0.8)
  g.closePath()
  g.fill()

  const pool = g.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.6)
  pool.addColorStop(0, 'rgba(255,226,176,.25)')
  pool.addColorStop(1, 'rgba(255,226,176,0)')
  g.fillStyle = pool
  g.fillRect(0, 0, W, H)

  // Frame: gilt outer, mat, then the portrait cropped to 4:5.
  const aw = 520, ah = 650, ax = (W - aw) / 2, ay = branded ? 150 : 180
  const mat = 44, fr = 40
  const ox = ax - mat - fr, oy = ay - mat - fr, ow = aw + 2 * (mat + fr), oh = ah + 2 * (mat + fr)
  const gold = g.createLinearGradient(ox, oy, ox + ow, oy + oh)
  gold.addColorStop(0, '#f6dc96')
  gold.addColorStop(0.35, '#c99a3e')
  gold.addColorStop(0.5, '#7b5519')
  gold.addColorStop(0.7, '#f6dc96')
  gold.addColorStop(1, '#c99a3e')
  g.save()
  g.shadowColor = 'rgba(0,0,0,.6)'
  g.shadowBlur = 60
  g.shadowOffsetY = 30
  g.fillStyle = gold
  g.fillRect(ox, oy, ow, oh)
  g.restore()
  g.strokeStyle = 'rgba(255,240,200,.5)'
  g.lineWidth = 3
  g.strokeRect(ox + 8, oy + 8, ow - 16, oh - 16)
  g.strokeStyle = 'rgba(90,60,15,.55)'
  g.lineWidth = 6
  g.strokeRect(ox + 18, oy + 18, ow - 36, oh - 36)
  g.fillStyle = '#efe9dc'
  g.fillRect(ax - mat, ay - mat, aw + 2 * mat, ah + 2 * mat)
  const crop = coverCrop(portraitWidth, portraitHeight, aw, ah)
  g.drawImage(portrait, crop.sx, crop.sy, crop.sw, crop.sh, ax, ay, aw, ah)
  g.strokeStyle = 'rgba(0,0,0,.25)'
  g.lineWidth = 2
  g.strokeRect(ax, ay, aw, ah)

  // Plaque.
  const pw = 600, ph = 172, px = (W - pw) / 2, py = oy + oh + 56
  g.save()
  g.shadowColor = 'rgba(0,0,0,.45)'
  g.shadowBlur = 18
  g.shadowOffsetY = 8
  g.fillStyle = '#f3ede1'
  g.fillRect(px, py, pw, ph)
  g.restore()
  g.textAlign = 'center'
  g.fillStyle = '#6b6155'
  g.font = '500 20px Jost, "Avenir Next", sans-serif'
  g.fillText('PERMANENT COLLECTION', W / 2, py + 44)
  g.fillStyle = '#211c16'
  g.font = '600 54px "Cormorant Garamond", Georgia, serif'
  g.fillText('The Masterpiece', W / 2, py + 104)
  g.fillStyle = '#4a4238'
  g.font = 'italic 500 30px "Cormorant Garamond", Georgia, serif'
  g.fillText(`${recipientName}, ${new Date().getFullYear()}  ·  Medium: priceless`, W / 2, py + 146, pw - 40)

  if (branded) {
    const label = `Made with Museum of You  ·  ${remixHost()}/museum`
    g.font = '500 24px Jost, "Avenir Next", sans-serif'
    const bw = g.measureText(label).width + 60, bh = 54, bx = (W - bw) / 2, by = H - 92
    g.fillStyle = 'rgba(10,18,15,.78)'
    roundRect(g, bx, by, bw, bh, 27)
    g.fill()
    g.strokeStyle = 'rgba(246,220,150,.55)'
    g.lineWidth = 2
    roundRect(g, bx, by, bw, bh, 27)
    g.stroke()
    g.fillStyle = '#f6dc96'
    g.fillText(label, W / 2, by + 35)
  }
  return c
}
