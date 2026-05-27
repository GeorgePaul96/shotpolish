// IndexedDB Launch Workspace Store — persists screenshots, draft canvases, and timelines locally.
// Prevents standard localStorage 5MB capacity errors by writing binary Files and preview data to a local DB.

import type { ProductContext } from './contextEngine'
import type { StorySlide } from '../pages/StoryModePage'
import type { NarrativeSuggestion } from './narrativeSuggestions'
import type { LaunchTimeline } from './launchTimeline'

export interface WorkspaceVersion {
  versionId: string
  timestamp: number
  note: string
}

export interface ExportHistory {
  id: string
  timestamp: number
  formatId: string
  filename: string
}

export interface LaunchWorkspace {
  id: string
  createdAt: number
  updatedAt: number
  context: ProductContext
  slides: StorySlide[]
  exports: ExportHistory[]
  narrativeSuggestions: NarrativeSuggestion[]
  timeline?: LaunchTimeline | null
  versions: WorkspaceVersion[]
}

const DB_NAME = 'ShotPolishWorkspaceDB'
const DB_VERSION = 1
const WORKSPACE_STORE = 'workspaces'
const ASSET_STORE = 'assets'

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE, { keyPath: 'id' })
      }
    }
  })
}

// ─── Workspace DB APIs ──────────────────────────────────────────────────────────

export async function saveWorkspaceToDB(
  ws: LaunchWorkspace,
  assetFiles: Record<string, File>
): Promise<void> {
  const db = await initDB()
  
  // 1. Save Workspace Metadata
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite')
    const store = tx.objectStore(WORKSPACE_STORE)
    const request = store.put(ws)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

  // 2. Save Heavy Assets (Binary files)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite')
    const store = tx.objectStore(ASSET_STORE)

    let completed = 0
    const keys = Object.keys(assetFiles)
    
    if (keys.length === 0) {
      resolve()
      return
    }

    for (const assetId of keys) {
      const file = assetFiles[assetId]
      const request = store.put({ id: assetId, file })

      request.onsuccess = () => {
        completed++
        if (completed === keys.length) resolve()
      }
      request.onerror = () => reject(request.error)
    }
  })

  // 3. Update localStorage pointers
  localStorage.setItem('shotpolish_last_active_ws', ws.id)
}

export async function loadWorkspaceFromDB(
  id: string
): Promise<{ workspace: LaunchWorkspace; assetFiles: Record<string, File> } | null> {
  const db = await initDB()

  // 1. Fetch Metadata
  const workspace = await new Promise<LaunchWorkspace | null>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readonly')
    const store = tx.objectStore(WORKSPACE_STORE)
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })

  if (!workspace) return null

  // 2. Fetch Assets
  const assetFiles = await new Promise<Record<string, File>>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly')
    const store = tx.objectStore(ASSET_STORE)
    
    const files: Record<string, File> = {}
    const slideAssetIds = workspace.slides.map(s => s.assetId)
    
    if (slideAssetIds.length === 0) {
      resolve(files)
      return
    }

    let completed = 0
    for (const assetId of slideAssetIds) {
      const request = store.get(assetId)
      request.onsuccess = () => {
        if (request.result) {
          files[assetId] = request.result.file
        }
        completed++
        if (completed === slideAssetIds.length) resolve(files)
      }
      request.onerror = () => reject(request.error)
    }
  })

  return { workspace, assetFiles }
}

export async function listWorkspacesFromDB(): Promise<Array<{ id: string; updatedAt: number; productName: string; description: string }>> {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readonly')
    const store = tx.objectStore(WORKSPACE_STORE)
    const request = store.getAll()

    request.onsuccess = () => {
      const list = (request.result || []) as LaunchWorkspace[]
      resolve(
        list.map(ws => ({
          id: ws.id,
          updatedAt: ws.updatedAt,
          productName: ws.context.productName,
          description: ws.context.shortDescription
        })).sort((a, b) => b.updatedAt - a.updatedAt)
      )
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteWorkspaceFromDB(id: string): Promise<void> {
  const db = await initDB()
  
  // Load workspace first to identify assetIds to delete
  const workspaceData = await loadWorkspaceFromDB(id)
  
  // Delete Workspace Meta
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite')
    const store = tx.objectStore(WORKSPACE_STORE)
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

  if (!workspaceData) return

  // Delete Assets
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite')
    const store = tx.objectStore(ASSET_STORE)
    
    const assetIds = workspaceData.workspace.slides.map(s => s.assetId)
    if (assetIds.length === 0) {
      resolve()
      return
    }

    let completed = 0
    for (const assetId of assetIds) {
      const request = store.delete(assetId)
      request.onsuccess = () => {
        completed++
        if (completed === assetIds.length) resolve()
      }
      request.onerror = () => reject(request.error)
    }
  })

  if (localStorage.getItem('shotpolish_last_active_ws') === id) {
    localStorage.removeItem('shotpolish_last_active_ws')
  }
}

// ─── localStorage pointers ─────────────────────────────────────────────────────

export function getLastActiveWorkspaceId(): string | null {
  return localStorage.getItem('shotpolish_last_active_ws')
}

export function saveLastActiveWorkspaceId(id: string): void {
  localStorage.setItem('shotpolish_last_active_ws', id)
}

export function clearLastActiveWorkspacePointer(): void {
  localStorage.removeItem('shotpolish_last_active_ws')
}
