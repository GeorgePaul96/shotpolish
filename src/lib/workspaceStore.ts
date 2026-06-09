import type { ProductContext } from './contextEngine'
import type { StorySlide } from '../pages/StoryModePage'
import type { LaunchTimeline } from './launchTimeline'
import { supabase } from './supabase'

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
  timeline?: LaunchTimeline | null
  versions: WorkspaceVersion[]
  user_id?: string
}

// ─── IndexedDB Fallback (Local Store) ───────────────────────────────────────
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

// ─── Cloud & Hybrid APIs ───────────────────────────────────────────────────

export async function saveWorkspaceToDB(
  ws: LaunchWorkspace,
  assetFiles: Record<string, File>
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  if (user) {
    // 1. Cloud Save: Upload Assets to Supabase Storage
    const uploadPromises = Object.entries(assetFiles).map(async ([assetId, file]) => {
      const filePath = `${user.id}/${ws.id}/${assetId}`
      const { error } = await supabase.storage.from('assets').upload(filePath, file, { upsert: true })
      if (error) throw new Error(`Asset upload error: ${error.message}`)
    })
    await Promise.all(uploadPromises)

    // 2. Cloud Save: Upsert Workspace Meta
    const { error } = await supabase.from('workspaces').upsert({
      id: ws.id,
      user_id: user.id,
      name: ws.context.productName || 'Untitled Project',
      context: ws.context,
      slides: ws.slides,
      created_at: new Date(ws.createdAt).toISOString(),
      updated_at: new Date(ws.updatedAt).toISOString()
    })
    if (error) throw new Error(`Workspace cloud save error: ${error.message}`)

  } else {
    // Fallback: Local Save
    const db = await initDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, 'readwrite')
      const store = tx.objectStore(WORKSPACE_STORE)
      const request = store.put(ws)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite')
      const store = tx.objectStore(ASSET_STORE)

      let completed = 0
      const keys = Object.keys(assetFiles)
      if (keys.length === 0) return resolve()

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
  }

  // Update localStorage pointer
  localStorage.setItem('shotpolish_last_active_ws', ws.id)
}

export async function loadWorkspaceFromDB(
  id: string
): Promise<{ workspace: LaunchWorkspace; assetFiles: Record<string, File> } | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  if (user) {
    // Cloud Load
    const { data: workspaceData, error } = await supabase.from('workspaces').select('*').eq('id', id).single()
    if (error || !workspaceData) return null

    const ws: LaunchWorkspace = {
      id: workspaceData.id,
      createdAt: new Date(workspaceData.created_at).getTime(),
      updatedAt: new Date(workspaceData.updated_at).getTime(),
      context: workspaceData.context,
      slides: workspaceData.slides,
      exports: [],
      versions: [],
      user_id: workspaceData.user_id
    }

    const assetFiles: Record<string, File> = {}
    const slideAssetIds = ws.slides.map(s => s.assetId)
    
    const downloadPromises = slideAssetIds.map(async (assetId) => {
      const filePath = `${user.id}/${ws.id}/${assetId}`
      const { data: blob, error: downloadError } = await supabase.storage.from('assets').download(filePath)
      if (blob) {
        assetFiles[assetId] = new File([blob], assetId, { type: blob.type })
      }
    })
    await Promise.all(downloadPromises)

    return { workspace: ws, assetFiles }

  } else {
    // Local Load
    const db = await initDB()
    const workspace = await new Promise<LaunchWorkspace | null>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, 'readonly')
      const store = tx.objectStore(WORKSPACE_STORE)
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })

    if (!workspace) return null

    const assetFiles = await new Promise<Record<string, File>>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readonly')
      const store = tx.objectStore(ASSET_STORE)

      const files: Record<string, File> = {}
      const slideAssetIds = workspace.slides.map(s => s.assetId)

      if (slideAssetIds.length === 0) return resolve(files)

      let completed = 0
      for (const assetId of slideAssetIds) {
        const request = store.get(assetId)
        request.onsuccess = () => {
          if (request.result) files[assetId] = request.result.file
          completed++
          if (completed === slideAssetIds.length) resolve(files)
        }
        request.onerror = () => reject(request.error)
      }
    })

    return { workspace, assetFiles }
  }
}

export async function listWorkspacesFromDB(): Promise<Array<{ id: string; updatedAt: number; productName: string; description: string }>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  if (user) {
    const { data, error } = await supabase.from('workspaces').select('id, updated_at, context').order('updated_at', { ascending: false })
    if (error) return []
    return data.map((ws: any) => ({
      id: ws.id,
      updatedAt: new Date(ws.updated_at).getTime(),
      productName: ws.context.productName,
      description: ws.context.shortDescription
    }))
  } else {
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
}

export async function deleteWorkspaceFromDB(id: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  if (user) {
    // Supabase will automatically cascade delete the database row if set up,
    // but storage bucket files need manual deletion. For now, deleting row is sufficient for validation.
    await supabase.from('workspaces').delete().eq('id', id)
  } else {
    const db = await initDB()
    const workspaceData = await loadWorkspaceFromDB(id)

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, 'readwrite')
      const store = tx.objectStore(WORKSPACE_STORE)
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    if (!workspaceData) return

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite')
      const store = tx.objectStore(ASSET_STORE)

      const assetIds = workspaceData.workspace.slides.map(s => s.assetId)
      if (assetIds.length === 0) return resolve()

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
  }

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

// Export initDB for migration script
export { initDB, WORKSPACE_STORE, ASSET_STORE }
