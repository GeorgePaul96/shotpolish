import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True only when real Supabase credentials are present. When false (e.g. prod
 * today, with no env vars set), the client falls back to a dummy URL and every
 * auth/DB call fails with "Failed to fetch". The UI uses this flag to hide all
 * login/account features so anonymous visitors never hit a broken sign-in.
 * Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Vercel to re-enable auth.
 */
export const isSupabaseConfigured = !!(envUrl && envKey)

const supabaseUrl = envUrl || 'https://dummy.supabase.co'
const supabaseAnonKey = envKey || 'dummy-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
