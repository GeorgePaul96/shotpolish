// Client for the museum-* edge functions. Components never call Supabase
// directly for museums; everything goes through here.
import { isSupabaseConfigured, supabase } from '../supabase'
import type { MuseumDraft, Tier } from './rules'

export const publishingEnabled = isSupabaseConfigured
const BUCKET = 'museums'

export interface ViewerExhibit { title: string; place: string | null; year: string | null; medium: string | null; photoUrl: string }

/** Everything the viewer needs. Preview, example, and live museums all use this shape. */
export interface ViewerMuseum {
  recipientName: string
  curatorName: string | null
  branded: boolean
  exhibits: ViewerExhibit[]
  finalPhotoUrl: string | null
}

export interface OwnerInfo { tier: Tier; status: 'draft' | 'live'; expiresAt: string | null; publishedAt: string | null; exhibitCount: number }

export type GetMuseumResult =
  | { state: 'open'; museum: ViewerMuseum; owner?: OwnerInfo }
  | { state: 'closed'; recipientName: string; curatorName: string | null; owner?: OwnerInfo }
  | { state: 'draft'; recipientName: string; curatorName: string | null; owner: OwnerInfo }
  | { state: 'missing' }

export class MuseumApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'MuseumApiError'
  }
}

export const NOT_ENABLED_MESSAGE = 'Publishing isn’t switched on yet. Your draft is saved on this device.'
const GENERIC_MESSAGE = 'Something went wrong. Check your connection and try again.'

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (!publishingEnabled) throw new MuseumApiError(NOT_ENABLED_MESSAGE)
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (!error) return data as T
  let message = GENERIC_MESSAGE
  let status: number | undefined
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    status = ctx.status
    try {
      const parsed = await ctx.json()
      if (parsed && typeof parsed.error === 'string') message = parsed.error
    } catch {
      // Body wasn't JSON; keep the generic message.
    }
  }
  throw new MuseumApiError(message, status)
}

export interface CreatedMuseum { slug: string; editKey: string; uploads: { path: string; token: string }[] }

export function createMuseum(d: MuseumDraft): Promise<CreatedMuseum> {
  return call<CreatedMuseum>('museum-create', {
    recipientName: d.recipientName,
    curatorName: d.curatorName || undefined,
    exhibits: d.exhibits.map((e) => ({ title: e.title, place: e.place, year: e.year, medium: e.medium })),
    hasFinalPhoto: !!d.finalPhoto,
  })
}

/** Uploads blobs to the signed URLs, in order (exhibits, then the final photo). */
export async function uploadPhotos(
  uploads: CreatedMuseum['uploads'],
  blobs: Blob[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (const [i, u] of uploads.entries()) {
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt))
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, blobs[i], { contentType: 'image/jpeg', upsert: true })
      ok = !error
    }
    if (!ok) throw new MuseumApiError(`Photo ${i + 1} of ${uploads.length} didn’t upload. Check your connection and try again.`)
    onProgress?.(i + 1, uploads.length)
  }
}

export type PublishResult = { state: 'open' | 'closed'; tier: Tier; expiresAt: string | null } | { checkoutUrl: string }

export const publishMuseum = (slug: string, editKey: string, tier: Tier) =>
  call<PublishResult>('museum-publish', { slug, editKey, tier })

interface RawGetResponse {
  state?: string
  recipientName?: string
  curatorName?: string | null
  branded?: boolean
  exhibits?: ViewerExhibit[]
  finalPhotoUrl?: string | null
  owner?: OwnerInfo
}

export async function getMuseum(slug: string, editKey?: string | null): Promise<GetMuseumResult> {
  try {
    const r = await call<RawGetResponse>('museum-get', { slug, editKey: editKey ?? undefined })
    const names = { recipientName: String(r.recipientName ?? ''), curatorName: r.curatorName ?? null }
    if (r.state === 'open') {
      return {
        state: 'open',
        museum: { ...names, branded: r.branded !== false, exhibits: r.exhibits ?? [], finalPhotoUrl: r.finalPhotoUrl ?? null },
        owner: r.owner,
      }
    }
    if (r.state === 'closed') return { state: 'closed', ...names, owner: r.owner }
    if (r.state === 'draft' && r.owner) return { state: 'draft', ...names, owner: r.owner }
    return { state: 'missing' }
  } catch (err) {
    if (err instanceof MuseumApiError && err.status === 404) return { state: 'missing' }
    throw err
  }
}

export const deleteMuseum = (slug: string, editKey: string) => call<{ deleted: true }>('museum-delete', { slug, editKey })

export const museumUrl = (slug: string) => `${window.location.origin}/m/${slug}`
export const manageUrl = (slug: string, editKey: string) => `${window.location.origin}/museum/manage/${slug}#k=${editKey}`
