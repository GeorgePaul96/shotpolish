// Pure Museum of You rules shared by the museum-* edge functions and the
// stripe-webhook. No Deno/SDK imports, so it runs under Vitest.
// NOTE: the limits and price below are duplicated in src/lib/museum/rules.ts
// (client and edge are separate bundles). rules.sync.test.ts keeps them equal.

export const FREE_EXHIBITS = 3
export const MAX_EXHIBITS = 20
export const FREE_DAYS = 7
export const PRICE_CENTS = 399
export const PRICE_CURRENCY = 'usd'
export const LIMITS = { name: 40, title: 80, place: 60, year: 20, medium: 100 } as const

export type Tier = 'free' | 'full'
export type MuseumStatus = 'draft' | 'live'
export type MuseumState = 'draft' | 'open' | 'closed'

export interface CleanExhibit { title: string; place: string | null; year: string | null; medium: string | null }
export interface CleanMuseumInput { recipientName: string; curatorName: string | null; exhibits: CleanExhibit[]; hasFinalPhoto: boolean }
type Result = { ok: true; value: CleanMuseumInput } | { ok: false; error: string }

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const optional = (v: unknown): string | null => clean(v) || null
const tooLong = (label: string, max: number): Result => ({ ok: false, error: `${label} is too long (max ${max} characters).` })

export function validateMuseumInput(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Missing museum details.' }
  const r = raw as Record<string, unknown>
  const recipientName = clean(r.recipientName)
  if (!recipientName) return { ok: false, error: 'Add the name of the person this museum is for.' }
  if (recipientName.length > LIMITS.name) return tooLong('Their name', LIMITS.name)
  const curatorName = optional(r.curatorName)
  if (curatorName && curatorName.length > LIMITS.name) return tooLong('Your name', LIMITS.name)
  if (!Array.isArray(r.exhibits) || r.exhibits.length === 0) return { ok: false, error: 'Add at least one exhibit.' }
  if (r.exhibits.length > MAX_EXHIBITS) return { ok: false, error: `A museum can hold up to ${MAX_EXHIBITS} exhibits.` }
  const exhibits: CleanExhibit[] = []
  for (const [i, item] of r.exhibits.entries()) {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const n = i + 1
    const title = clean(e.title)
    if (!title) return { ok: false, error: `Exhibit ${n} needs a title.` }
    if (title.length > LIMITS.title) return tooLong(`Exhibit ${n}'s title`, LIMITS.title)
    const place = optional(e.place), year = optional(e.year), medium = optional(e.medium)
    if (place && place.length > LIMITS.place) return tooLong(`Exhibit ${n}'s place`, LIMITS.place)
    if (year && year.length > LIMITS.year) return tooLong(`Exhibit ${n}'s year`, LIMITS.year)
    if (medium && medium.length > LIMITS.medium) return tooLong(`Exhibit ${n}'s medium`, LIMITS.medium)
    exhibits.push({ title, place, year, medium })
  }
  return { ok: true, value: { recipientName, curatorName, exhibits, hasFinalPhoto: r.hasFinalPhoto === true } }
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const cryptoBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Unbiased base62: bytes >= 248 (62 * 4) are rejected. */
export function randomBase62(length: number, rand: (n: number) => Uint8Array = cryptoBytes): string {
  let out = ''
  while (out.length < length) {
    for (const b of rand(length * 2)) {
      if (b >= 248) continue
      out += B62[b % 62]
      if (out.length === length) break
    }
  }
  return out
}
export const generateSlug = () => randomBase62(10)
export const generateEditKey = () => randomBase62(32)
export const isValidSlug = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z]{10}$/.test(v)
export const isValidEditKey = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z]{32}$/.test(v)

export async function hashEditKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time compare of the stored hash against hash(key). */
export async function keyMatches(storedHash: string, key: string): Promise<boolean> {
  const h = await hashEditKey(key)
  if (h.length !== storedHash.length) return false
  let diff = 0
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ storedHash.charCodeAt(i)
  return diff === 0
}

export function museumState(row: { status: MuseumStatus; expires_at: string | null }, now: Date): MuseumState {
  if (row.status !== 'live') return 'draft'
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return 'closed'
  return 'open'
}
export const freeExpiry = (now: Date) => new Date(now.getTime() + FREE_DAYS * 86_400_000).toISOString()
export const canPublishFree = (exhibitCount: number) => exhibitCount <= FREE_EXHIBITS

export const photoPath = (museumId: string, position: number) => `${museumId}/${position}.jpg`
export const finalPhotoPath = (museumId: string) => `${museumId}/final.jpg`
export function expectedPhotoPaths(museumId: string, exhibitCount: number, hasFinalPhoto: boolean): string[] {
  const paths = Array.from({ length: exhibitCount }, (_, i) => photoPath(museumId, i))
  if (hasFinalPhoto) paths.push(finalPhotoPath(museumId))
  return paths
}

export interface MuseumPayment { museumId: string; sessionId: string }

/** Museum checkouts carry metadata.kind = 'museum'; plan checkouts never do. */
export function mapMuseumPayment(event: { type: string; data: { object: Record<string, any> } }): MuseumPayment | null {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return null
  const obj = event.data.object
  if (obj.metadata?.kind !== 'museum') return null
  if (obj.payment_status !== 'paid') return null
  const museumId = obj.metadata?.museum_id
  if (typeof museumId !== 'string' || !museumId) return null
  return { museumId, sessionId: String(obj.id ?? '') }
}
