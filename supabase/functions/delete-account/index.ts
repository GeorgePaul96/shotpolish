// Supabase Edge Function (Deno). Deletes ONLY the user identified by the
// caller's verified JWT — never an id from the request body — so a caller can
// only ever delete their own account. Cascading FKs remove profiles/workspaces/
// brand_kits. Deploy: supabase functions deploy delete-account
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Recursively remove everything under assets/{userId}/. DB rows cascade on auth
// delete, but Storage objects do not, so without this the user's uploaded
// screenshots would persist after account deletion. Best-effort.
async function deleteUserAssets(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const bucket = admin.storage.from('assets')
  const toVisit = [userId]
  const toRemove: string[] = []
  while (toVisit.length) {
    const prefix = toVisit.pop()!
    const { data, error } = await bucket.list(prefix, { limit: 1000 })
    if (error || !data) continue
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`
      // supabase-js reports folders with a null id; files have an id.
      if (entry.id === null) toVisit.push(path)
      else toRemove.push(path)
    }
  }
  if (toRemove.length) await bucket.remove(toRemove)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'Missing authorization header' })
  const token = authHeader.replace('Bearer ', '')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify the token and resolve the user; the id comes ONLY from here.
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return json(401, { error: 'Invalid or expired token' })

  // Purge Storage first (best-effort) so a failure here doesn't block the
  // identity delete; orphaned objects are recoverable, a stuck account is worse.
  try {
    await deleteUserAssets(admin, user.id)
  } catch (err) {
    console.error('delete-account asset cleanup failed', { userId: user.id, error: (err as Error).message })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('delete-account failed', { userId: user.id, error: deleteError.message })
    return json(500, { error: 'Account deletion failed' })
  }

  return json(200, { deleted: true })
})
