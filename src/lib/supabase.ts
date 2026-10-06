import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True only when real Supabase credentials are present. When false, the client
 * falls back to a dummy URL and every auth/DB call fails with "Failed to fetch".
 * Museum of You publishing needs this; ShotPolish accounts additionally need
 * accountsEnabled (below), so anonymous visitors never hit a half-set-up sign-in.
 */
export const isSupabaseConfigured = !!(envUrl && envKey)

/**
 * ShotPolish sign-in, /pricing, /account and brand kits. Separate from
 * isSupabaseConfigured because Museum of You needs Supabase without accounts:
 * setting the Supabase env vars alone must not expose sign-in or the (still
 * unpriced) pricing page. Set VITE_ENABLE_ACCOUNTS=true to turn them on.
 */
export const accountsEnabled = isSupabaseConfigured && import.meta.env.VITE_ENABLE_ACCOUNTS === 'true'

const supabaseUrl = envUrl || 'https://dummy.supabase.co'
const supabaseAnonKey = envKey || 'dummy-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
