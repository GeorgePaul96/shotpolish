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

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('delete-account failed', { userId: user.id, error: deleteError.message })
    return json(500, { error: deleteError.message })
  }

  return json(200, { deleted: true })
})
