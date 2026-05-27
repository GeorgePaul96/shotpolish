// Grounded Spotlight Assistance — visual focus assistance, not semantic focus detection.
// Returns candidate visual focus regions with honest, grounded explanations and confidence filters.

import type { OCRAnalysis } from './ocr'

export interface SemanticFocusCandidate {
  id: string
  x: number       // [0,1] normalized to image
  y: number       // [0,1]
  width: number   // [0,1]
  height: number  // [0,1]
  confidence: number
  type: 'cta' | 'metric' | 'headline' | 'chart' | 'workflow' | 'dialog' | 'navigation' | 'hero'
  reasons: string[]
  userAdjustedSpotlight?: boolean
}

interface GridCell {
  row: number
  col: number
  saturation: number
  edgeDensity: number
  brightness: number
}

const GRID = 8
const SAMPLE = 160

const cache = new Map<string, SemanticFocusCandidate[]>()

// ─── Grid computation ─────────────────────────────────────────────────────────

function buildGrid(imageUrl: string): Promise<GridCell[]> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = SAMPLE; c.height = SAMPLE
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) { resolve([]); return }
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)

      const cellPx = SAMPLE / GRID
      const cells: GridCell[] = []

      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const x = Math.round(col * cellPx)
          const y = Math.round(row * cellPx)
          const sz = Math.round(cellPx)
          const { data } = ctx.getImageData(x, y, sz, sz)
          const n = data.length / 4

          let sumBright = 0, sumSat = 0, edges = 0
          const bright = new Float32Array(n)

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const br = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            bright[i / 4] = br
            sumBright += br
            const mx = Math.max(r, g, b) / 255
            const mn = Math.min(r, g, b) / 255
            sumSat += mx > 0 ? (mx - mn) / mx : 0
          }

          // Simple horizontal + vertical edge detection
          for (let py = 1; py < sz - 1; py++) {
            for (let px = 1; px < sz - 1; px++) {
              const idx = py * sz + px
              if (Math.abs(bright[idx] - bright[idx - 1]) > 0.15 ||
                  Math.abs(bright[idx] - bright[idx - sz]) > 0.15) {
                edges++
              }
            }
          }

          cells.push({
            row, col,
            saturation: sumSat / n,
            edgeDensity: Math.min(1, edges / (n * 0.25)),
            brightness: sumBright / n,
          })
        }
      }
      resolve(cells)
    }
    img.onerror = () => resolve([])
    img.src = imageUrl
  })
}

// ─── Region grouping ──────────────────────────────────────────────────────────

function groupCells(
  cells: GridCell[],
  scores: Map<string, number>,
  threshold: number,
): { cells: GridCell[]; score: number }[] {
  const key = (r: number, c: number) => `${r},${c}`
  const visited = new Set<string>()
  const byKey = new Map(cells.map(c => [key(c.row, c.col), c]))
  const groups: { cells: GridCell[]; score: number }[] = []

  for (const cell of cells) {
    const k = key(cell.row, cell.col)
    if ((scores.get(k) ?? 0) < threshold || visited.has(k)) continue

    const group: GridCell[] = []
    const q = [cell]
    while (q.length > 0) {
      const cur = q.shift()!
      const ck = key(cur.row, cur.col)
      if (visited.has(ck)) continue
      visited.add(ck)
      group.push(cur)
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nk = key(cur.row + dr, cur.col + dc)
        if ((scores.get(nk) ?? 0) >= threshold && !visited.has(nk)) {
          const n = byKey.get(nk)
          if (n) q.push(n)
        }
      }
    }

    if (group.length > 0) {
      const avg = group.reduce((s, c) => s + (scores.get(key(c.row, c.col)) ?? 0), 0) / group.length
      groups.push({ cells: group, score: avg })
    }
  }

  return groups.sort((a, b) => b.score - a.score)
}

function toBounds(group: GridCell[]) {
  const cs = 1 / GRID
  const pad = cs * 0.25
  const minR = Math.min(...group.map(c => c.row))
  const maxR = Math.max(...group.map(c => c.row))
  const minC = Math.min(...group.map(c => c.col))
  const maxC = Math.max(...group.map(c => c.col))
  return {
    x: Math.max(0, minC * cs - pad),
    y: Math.max(0, minR * cs - pad),
    w: Math.min(1, (maxC - minC + 1) * cs + pad * 2),
    h: Math.min(1, (maxR - minR + 1) * cs + pad * 2),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function detectSemanticFocus(
  imageUrl: string,
  ocr?: OCRAnalysis | null,
): Promise<SemanticFocusCandidate[]> {
  const ck = imageUrl.slice(0, 128)
  if (cache.has(ck)) return cache.get(ck)!

  const cells = await buildGrid(imageUrl)
  if (cells.length === 0) { cache.set(ck, []); return [] }

  // Grounded Scoring Model
  // base = saturation×0.6 + edgeDensity×0.4
  // - Deduct points for structural sidebars and top nav bar chrome
  // - Add points for cell regions overlapping metric clues or CTAs
  const scores = new Map(cells.map(c => {
    let baseScore = c.saturation * 0.6 + c.edgeDensity * 0.4

    // 1. Penalize layout borders and browser sidebars
    if (c.row === 0 || c.row === 7) {
      baseScore -= 0.25  // Top/Bottom header chrome
    }
    if (c.col === 0 || c.col === 1) {
      baseScore -= 0.20  // Left persistent side navigation
    }
    if (c.col === 7) {
      baseScore -= 0.20  // Right control drawer border
    }

    // 2. Boost regions with supporting evidence
    if (ocr) {
      if (ocr.probableCTA && c.row > 4) {
        baseScore += 0.25 // Action zone boost
      }
      if (ocr.metrics.length > 0 && c.row >= 2 && c.row <= 5 && c.col >= 2 && c.col <= 6) {
        baseScore += 0.25 // Center data/chart region boost
      }
      if (ocr.headings.length > 0 && c.row >= 1 && c.row <= 3 && c.col >= 1 && c.col <= 6) {
        baseScore += 0.15 // Upper headline region boost
      }
    }

    return [`${c.row},${c.col}`, Math.max(0, baseScore)]
  }))

  const groups = groupCells(cells, scores, 0.22).slice(0, 4)
  const candidates: SemanticFocusCandidate[] = []

  for (const g of groups) {
    const bounds = toBounds(g.cells)

    // Skip degenerate/full-page or too-small regions
    if (bounds.w > 0.85 || bounds.h > 0.85) continue
    if (bounds.w < 0.05 || bounds.h < 0.03) continue

    const avgRow = g.cells.reduce((s, c) => s + c.row, 0) / g.cells.length / GRID
    const avgCol = g.cells.reduce((s, c) => s + c.col, 0) / g.cells.length / GRID
    const avgSat = g.cells.reduce((s, c) => s + c.saturation, 0) / g.cells.length
    const avgEdge = g.cells.reduce((s, c) => s + c.edgeDensity, 0) / g.cells.length

    let type: SemanticFocusCandidate['type'] = 'workflow'
    const reasons: string[] = []
    let conf = 0.35 + g.score * 0.32

    // ── Classify focus category with grounded reasons ─────────────────────────

    if (avgRow > 0.55 && avgSat > 0.18 && ocr?.probableCTA) {
      type = 'cta'
      conf += 0.16
      reasons.push('Primary Focus: Interactive action button.')
      reasons.push(`Contains button text matching CTA indicators: "${ocr.buttons.slice(0, 1).join('') || 'Action'}"`)
      
    } else if (ocr?.metrics && ocr.metrics.length >= 1 && avgRow > 0.18 && avgRow < 0.80 && avgEdge > 0.22) {
      type = 'metric'
      conf += 0.14
      reasons.push('Primary Focus: Metrics and data KPIs.')
      reasons.push(`Contains numeric metric value: "${ocr.metrics[0]}"`)

    } else if (avgRow < 0.32 && avgEdge > 0.28) {
      type = 'headline'
      conf += 0.10
      reasons.push('Primary Focus: Upper title layout.')
      if (ocr?.headings?.length) {
        reasons.push(`Matches header text block: "${ocr.headings[0].slice(0, 32)}..."`)
        conf += 0.08
      }

    } else if (avgEdge > 0.40 && avgRow > 0.20 && avgRow < 0.80 && g.cells.length >= 2) {
      type = 'chart'
      conf += 0.06
      reasons.push('Primary Focus: Data visualization region containing line detail indicators.')

    } else if (avgRow > 0.25 && avgRow < 0.75 && avgCol > 0.25 && avgCol < 0.75 && bounds.w < 0.55 && bounds.h < 0.55) {
      type = 'dialog'
      conf += 0.06
      reasons.push('Primary Focus: Centered modal container or bounded control card.')

    } else {
      type = 'workflow'
      reasons.push('Primary Focus: High-detail workflow settings container.')
    }

    if (ocr?.probablePageType === 'analytics' && type === 'metric') conf += 0.08
    if (ocr?.probablePageType === 'pricing' && type === 'cta') conf += 0.10

    conf = Math.min(0.88, conf) // Never claim 100% certainty

    // ENFORCE HONEST CONFIDENCE THRESHOLD
    // If confidence < 0.55, discard candidate to prevent faking focus boundaries
    if (conf < 0.55) continue

    candidates.push({
      id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h,
      confidence: conf, type, reasons,
    })
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  const result = candidates.slice(0, 2)
  cache.set(ck, result)
  return result
}

export function clearSpotlightCache() { cache.clear() }

export const FOCUS_TYPE_LABELS: Record<SemanticFocusCandidate['type'], string> = {
  cta:        'Primary CTA',
  metric:     'Metrics cluster',
  headline:   'Hero headline',
  chart:      'Data visualization',
  workflow:   'Workflow region',
  dialog:     'Modal / dialog',
  navigation: 'Navigation area',
  hero:       'Hero section',
}
