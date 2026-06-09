import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { initDB, WORKSPACE_STORE, ASSET_STORE, type LaunchWorkspace, saveWorkspaceToDB } from '../lib/workspaceStore'

interface AuthContextType {
  user: User | null
  loading: boolean
  brandKit: any | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, brandKit: null, signOut: async () => {} })

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [brandKit, setBrandKit] = useState<any | null>(null)

  const migrateLocalToCloud = async (user: User) => {
    try {
      const db = await initDB()

      // 1. Fetch all local workspaces
      const localWorkspaces = await new Promise<LaunchWorkspace[]>((resolve, reject) => {
        const tx = db.transaction(WORKSPACE_STORE, 'readonly')
        const store = tx.objectStore(WORKSPACE_STORE)
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })

      if (localWorkspaces.length === 0) return

      console.log(`Migrating ${localWorkspaces.length} local workspaces to cloud...`)

      for (const ws of localWorkspaces) {
        // 2. Fetch local assets for this workspace
        const assetFiles: Record<string, File> = {}
        const slideAssetIds = ws.slides.map(s => s.assetId)

        if (slideAssetIds.length > 0) {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(ASSET_STORE, 'readonly')
            const store = tx.objectStore(ASSET_STORE)

            let completed = 0
            for (const assetId of slideAssetIds) {
              const request = store.get(assetId)
              request.onsuccess = () => {
                if (request.result) assetFiles[assetId] = request.result.file
                completed++
                if (completed === slideAssetIds.length) resolve()
              }
              request.onerror = () => reject(request.error)
            }
          })
        }

        // 3. Save to cloud (saveWorkspaceToDB checks user session automatically)
        await saveWorkspaceToDB(ws, assetFiles)

        // 4. Delete local workspace and assets after successful migration
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(WORKSPACE_STORE, 'readwrite')
          const store = tx.objectStore(WORKSPACE_STORE)
          const request = store.delete(ws.id)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })

        if (slideAssetIds.length > 0) {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(ASSET_STORE, 'readwrite')
            const store = tx.objectStore(ASSET_STORE)
            let completed = 0
            for (const assetId of slideAssetIds) {
              const request = store.delete(assetId)
              request.onsuccess = () => {
                completed++
                if (completed === slideAssetIds.length) resolve()
              }
              request.onerror = () => reject(request.error)
            }
          })
        }
      }

      console.log('Migration complete.')
    } catch (e) {
      console.error('Migration failed:', e)
    }
  }

  useEffect(() => {
    const fetchBrandKit = async (uid: string) => {
      const { data } = await supabase.from('brand_kits').select('*').eq('user_id', uid).limit(1).single()
      if (data) {
        setBrandKit({
          name: data.name,
          bg: '#000000', // Override based on brand kit or fallback
          accent: data.colors?.accent || '#818cf8',
          glow: `rgba(0,0,0,0)`, // Customize based on brand color if needed
          glowMid: `rgba(0,0,0,0)`,
          brandKit: true,
          shadowOpacity: data.visual_defaults?.shadow_opacity,
          padding: data.visual_defaults?.padding,
          borderRadius: data.visual_defaults?.border_radius,
          fontFamily: data.typography?.font_family
        })
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const activeUser = session?.user ?? null
      setUser(activeUser)
      setLoading(false)
      if (activeUser) {
        migrateLocalToCloud(activeUser)
        fetchBrandKit(activeUser.id)
      } else {
        setBrandKit(null)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const activeUser = session?.user ?? null
      setUser(activeUser)
      setLoading(false)
      if (activeUser) {
        migrateLocalToCloud(activeUser)
        fetchBrandKit(activeUser.id)
      } else {
        setBrandKit(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, brandKit, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
