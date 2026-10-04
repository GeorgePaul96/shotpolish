// Device-local persistence for Museum of You.
// - The in-progress draft (text + photo Blobs) lives in IndexedDB, so a reload,
//   or a mobile browser evicting the tab, doesn't lose someone's gift.
// - Published museums the creator owns ({slug, editKey}) live in localStorage.
// Both are best-effort: private windows may refuse storage and that's fine.
import type { MuseumDraft } from './rules'

const DB_NAME = 'museum-of-you'
const STORE = 'drafts'
const DRAFT_KEY = 'current'
const MINE_KEY = 'museum-of-you:mine'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = run(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
    tx.onabort = () => db.close()
  })
}

export async function loadDraft(): Promise<MuseumDraft | null> {
  try {
    const d = await withStore<MuseumDraft | undefined>('readonly', (s) => s.get(DRAFT_KEY))
    return d && Array.isArray(d.exhibits) ? d : null
  } catch {
    return null
  }
}

export async function saveDraft(d: MuseumDraft): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.put({ ...d, updatedAt: Date.now() }, DRAFT_KEY))
  } catch {
    // Storage unavailable: the draft just won't survive a reload.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(DRAFT_KEY))
  } catch {
    // Nothing to clear.
  }
}

export interface SavedMuseum { slug: string; editKey: string; recipientName: string; createdAt: number }

const isSaved = (v: unknown): v is SavedMuseum =>
  !!v && typeof v === 'object' && typeof (v as SavedMuseum).slug === 'string' && typeof (v as SavedMuseum).editKey === 'string'

export function listMyMuseums(): SavedMuseum[] {
  try {
    const raw = localStorage.getItem(MINE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isSaved) : []
  } catch {
    return []
  }
}

function writeMine(list: SavedMuseum[]): void {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 50)))
  } catch {
    // Storage unavailable; the manage link still works.
  }
}

export function rememberMuseum(m: SavedMuseum): void {
  writeMine([m, ...listMyMuseums().filter((x) => x.slug !== m.slug)])
}

export function forgetMuseum(slug: string): void {
  writeMine(listMyMuseums().filter((x) => x.slug !== slug))
}

export function findEditKey(slug: string): string | null {
  return listMyMuseums().find((x) => x.slug === slug)?.editKey ?? null
}
