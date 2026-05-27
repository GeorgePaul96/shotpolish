// Client-side OCR — concurrent Tesseract.js worker pool, LRU cache, multi-region dark-mode preprocessing.
// All errors return a low-confidence unknown result with a clear error — never crashes the page.

import { createWorker } from 'tesseract.js'

export interface OCRAnalysis {
  rawText: string
  headings: string[]
  buttons: string[]
  metrics: string[]
  labels: string[]
  probableCTA: boolean
  probablePageType: PageType
  confidence: number  // 0–1
  error?: string
}

export type PageType =
  | 'onboarding'
  | 'dashboard'
  | 'analytics'
  | 'pricing'
  | 'auth'
  | 'settings'
  | 'workflow'
  | 'editor'
  | 'feature_demo'
  | 'devtools'
  | 'ai'
  | 'collaboration'
  | 'fintech'
  | 'automation'
  | 'unknown'

export type OCRReliability =
  | 'strong'
  | 'partial'
  | 'weak'
  | 'unavailable'

// ─── Keyword tables ───────────────────────────────────────────────────────────

const PAGE_TYPE_KEYWORDS: Record<PageType, string[]> = {
  onboarding:    ['welcome', 'get started', 'setup', 'step 1', 'quick start', 'onboard', 'first time', 'join team'],
  dashboard:     ['overview', 'dashboard', 'summary', 'total', 'active', 'today', 'this week', 'all time', 'workspace', 'home'],
  analytics:     ['analytics', 'metric', 'conversion', 'retention', 'sessions', 'users', 'events', 'funnel', 'trend', 'query', 'charts'],
  pricing:       ['pricing', 'per month', 'per year', 'upgrade', 'free tier', 'enterprise', 'billing', 'subscribe'],
  auth:          ['sign in', 'sign up', 'login', 'log in', 'password', 'forgot', 'create account', 'register', 'token'],
  settings:      ['settings', 'preferences', 'account', 'profile', 'notification', 'privacy', 'security', 'api key', 'webhook'],
  workflow:      ['workflow', 'pipeline', 'in progress', 'assigned', 'due date', 'kanban', 'board', 'sprint', 'deploy', 'automation', 'integration'],
  editor:        ['untitled', 'save', 'publish', 'draft', 'undo', 'redo', 'format', 'paragraph', 'export'],
  feature_demo:  ['demo', 'preview', 'example', 'try it', 'see how', 'here\'s how', 'generated', 'assistant', 'repo'],
  devtools:      ['api', 'repo', 'deploy', 'token', 'pipeline', 'webhook', 'integration', 'git', 'terminal', 'cli', 'npm', 'yarn'],
  ai:            ['assistant', 'ai', 'prompt', 'model', 'copilot', 'generate', 'chat', 'intelligence', 'openai', 'claude', 'neural'],
  collaboration: ['team', 'workspace', 'invite', 'share', 'sync', 'comments', 'members', 'collaboration', 'channels'],
  fintech:       ['billing', 'transaction', 'payout', 'invoice', 'pricing', 'payment', 'revenue', 'stripe', 'ledger', 'balance'],
  automation:    ['workflow', 'automation', 'webhook', 'trigger', 'pipeline', 'sync', 'rule', 'action', 'schedule'],
  unknown:       [],
}

const CTA_KEYWORDS = [
  'get started', 'sign up', 'try', 'start free', 'join', 'subscribe',
  'upgrade', 'free trial', 'learn more', 'book a demo', 'download',
]

// ─── Concurrent 2-Worker Pool ──────────────────────────────────────────────────

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

const WORKER_LIMIT = 2
const workerPool: TesseractWorker[] = []
let poolSize = 0
const waitingQueue: Array<(worker: TesseractWorker) => void> = []

async function acquireWorker(): Promise<TesseractWorker> {
  if (workerPool.length > 0) {
    return workerPool.pop()!
  }
  if (poolSize < WORKER_LIMIT) {
    poolSize++
    try {
      const worker = await createWorker('eng', 1, { logger: () => {} })
      return worker
    } catch (e) {
      poolSize--
      throw e
    }
  }
  return new Promise<TesseractWorker>(resolve => {
    waitingQueue.push(resolve)
  })
}

function releaseWorker(worker: TesseractWorker) {
  if (waitingQueue.length > 0) {
    const next = waitingQueue.shift()!
    next(worker)
  } else {
    workerPool.push(worker)
  }
}

// ─── Result Cache (LRU Capped at 50) ───────────────────────────────────────────

const ocrCache = new Map<string, OCRAnalysis>()

function cacheKey(url: string): string {
  return url.slice(0, 128)
}

function saveToCache(key: string, analysis: OCRAnalysis) {
  ocrCache.set(key, analysis)
  if (ocrCache.size > 50) {
    const firstKey = ocrCache.keys().next().value
    if (firstKey) {
      ocrCache.delete(firstKey)
    }
  }
}

// ─── Multi-region Brightness Sampling ──────────────────────────────────────────

async function preprocessImage(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(url); return }

      ctx.drawImage(img, 0, 0, w, h)

      // Weighted Multi-Region Sampling:
      // Center (40% weight), Top-center, Left-center, Right-center, Bottom-center (15% each)
      const regions = [
        { x: w * 0.35,  y: h * 0.35,  w: w * 0.30, h: h * 0.30, weight: 0.40 }, // Center
        { x: w * 0.35,  y: h * 0.05,  w: w * 0.30, h: h * 0.20, weight: 0.15 }, // Top center
        { x: w * 0.05,  y: h * 0.35,  w: w * 0.20, h: h * 0.30, weight: 0.15 }, // Center-left
        { x: w * 0.75,  y: h * 0.35,  w: w * 0.20, h: h * 0.30, weight: 0.15 }, // Center-right
        { x: w * 0.35,  y: h * 0.75,  w: w * 0.30, h: h * 0.20, weight: 0.15 }, // Lower-center
      ]

      let weightedBrightnessSum = 0
      let totalWeight = 0

      for (const r of regions) {
        const rx = Math.max(0, Math.min(w - 2, Math.round(r.x)))
        const ry = Math.max(0, Math.min(h - 2, Math.round(r.y)))
        const rw = Math.max(1, Math.min(w - rx, Math.round(r.w)))
        const rh = Math.max(1, Math.min(h - ry, Math.round(r.h)))

        const sample = ctx.getImageData(rx, ry, rw, rh)
        let sampleBrightSum = 0
        const n = sample.data.length / 4

        for (let i = 0; i < sample.data.length; i += 4) {
          sampleBrightSum += 0.299 * sample.data[i] + 0.587 * sample.data[i + 1] + 0.114 * sample.data[i + 2]
        }

        const avgBrightness = sampleBrightSum / n
        weightedBrightnessSum += avgBrightness * r.weight
        totalWeight += r.weight
      }

      const meanBrightness = weightedBrightnessSum / (totalWeight || 1)

      if (meanBrightness < 128) {
        // Invert dark screenshots for better OCR accuracy
        const fullData = ctx.getImageData(0, 0, w, h)
        for (let i = 0; i < fullData.data.length; i += 4) {
          fullData.data[i]     = 255 - fullData.data[i]
          fullData.data[i + 1] = 255 - fullData.data[i + 1]
          fullData.data[i + 2] = 255 - fullData.data[i + 2]
        }
        ctx.putImageData(fullData, 0, 0)
      }

      const dataUrl = canvas.toDataURL('image/png')
      // Release GPU-backed canvas memory immediately after encoding
      canvas.width = 0
      canvas.height = 0
      resolve(dataUrl)
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
}

// ─── Text analysis ────────────────────────────────────────────────────────────

function extractLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 1)
}

function scorePageType(rawText: string): { type: PageType; score: number } {
  const lower = rawText.toLowerCase()
  let best: PageType = 'unknown'
  let bestScore = 0

  for (const [type, keywords] of Object.entries(PAGE_TYPE_KEYWORDS) as [PageType, string[]][]) {
    if (type === 'unknown') continue
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    if (score > bestScore) {
      bestScore = score
      best = type
    }
  }

  return { type: bestScore >= 2 ? best : 'unknown', score: bestScore }
}

function detectCTA(rawText: string): boolean {
  const lower = rawText.toLowerCase()
  return CTA_KEYWORDS.some(kw => lower.includes(kw))
}

function isCleanHeading(text: string): boolean {
  // Reject clearly noisy OCR lines: e.g. very long sequences of dashes, pipes, low letter density
  if (text.length < 3 || text.length > 80) return false
  if (/^[_\-\|\=\:\+\/\s]{3,}/.test(text)) return false // noise lines
  if ((text.match(/[^A-Za-z0-9\s]/g) || []).length > text.length * 0.40) return false // too many symbols
  // Check if starts with uppercase letter, number, or standard emoji
  return /^[A-Z0-9\p{Emoji_Presentation}]/u.test(text)
}

function extractHeadings(lines: string[]): string[] {
  return lines.filter(l => isCleanHeading(l))
}

function extractButtons(rawText: string): string[] {
  const lower = rawText.toLowerCase()
  return CTA_KEYWORDS.filter(kw => lower.includes(kw)).map(kw =>
    kw.charAt(0).toUpperCase() + kw.slice(1)
  )
}

function extractMetrics(lines: string[]): string[] {
  return lines.filter(l =>
    /\d+[\%\+kKmM]|\$\d+|\d{1,3}(,\d{3})+|\d+\s*(users|events|sessions|views|clicks|revenue)/.test(l)
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

const EMPTY: OCRAnalysis = {
  rawText: '', headings: [], buttons: [], metrics: [], labels: [],
  probableCTA: false, probablePageType: 'unknown', confidence: 0,
}

export async function analyzeImageOCR(imageUrl: string): Promise<OCRAnalysis> {
  const key = cacheKey(imageUrl)
  const cached = ocrCache.get(key)
  if (cached) return cached

  // Timeout recovery shield using Promise.race (12 seconds limit)
  const ocrPromise = (async (): Promise<OCRAnalysis> => {
    const preprocessed = await preprocessImage(imageUrl)
    const worker = await acquireWorker()
    try {
      const result = await worker.recognize(preprocessed)
      const rawText = result.data.text
      const confidence = Math.min(1, Math.max(0, result.data.confidence / 100))
      const lines = extractLines(rawText)
      const { type: probablePageType } = scorePageType(rawText)

      const analysis: OCRAnalysis = {
        rawText,
        headings:        extractHeadings(lines),
        buttons:         extractButtons(rawText),
        metrics:         extractMetrics(lines),
        labels:          lines.filter(l => l.length < 30),
        probableCTA:     detectCTA(rawText),
        probablePageType,
        confidence,
      }

      saveToCache(key, analysis)
      return analysis
    } finally {
      releaseWorker(worker)
    }
  })()

  const timeoutPromise = new Promise<OCRAnalysis>((resolve) => {
    setTimeout(() => {
      resolve({
        ...EMPTY,
        error: 'OCR Analysis timeout (12s limit exceeded)',
      })
    }, 12000)
  })

  try {
    return await Promise.race([ocrPromise, timeoutPromise])
  } catch (err) {
    return {
      ...EMPTY,
      error: err instanceof Error ? err.message : 'OCR failed',
    }
  }
}

export function getOCRReliability(ocr: OCRAnalysis | null): OCRReliability {
  if (!ocr) return 'unavailable'
  if (ocr.error) return 'unavailable'
  if (ocr.confidence > 0.70 && ocr.rawText.length > 50) return 'strong'
  if (ocr.confidence > 0.40 && ocr.rawText.length > 15) return 'partial'
  return 'weak'
}

export function clearOCRCache(): void {
  ocrCache.clear()
}

export async function terminateAllWorkers(): Promise<void> {
  const toTerminate = [...workerPool]
  workerPool.length = 0
  poolSize = 0
  waitingQueue.length = 0
  await Promise.allSettled(toTerminate.map(w => w.terminate()))
}
