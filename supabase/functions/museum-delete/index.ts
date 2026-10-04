// Permanently deletes a museum (photos, then rows). Requires the edit key.
// Deploy: supabase functions deploy museum-delete
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { isValidEditKey, isValidSlug, keyMatches } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const body = await readJson(req)
  const slug = body?.slug, editKey = body?.editKey
  if (!isValidSlug(slug) || !isValidEditKey(editKey)) return json(404, { error: 'Museum not found.' })
  const { data: row } = await admin.from('museums').select('id, edit_key_hash').eq('slug', slug).maybeSingle()
  if (!row || !(await keyMatches(row.edit_key_hash, editKey))) return json(404, { error: 'Museum not found.' })

  const { data: files } = await admin.storage.from(BUCKET).list(row.id, { limit: 100 })
  if (files?.length) {
    const { error } = await admin.storage.from(BUCKET).remove(files.map((f) => `${row.id}/${f.name}`))
    if (error) {
      console.error('museum-delete storage failed', { museumId: row.id, error: error.message })
      return json(500, { error: 'Could not delete the photos. Try again.' })
    }
  }
  const { error } = await admin.from('museums').delete().eq('id', row.id)
  if (error) {
    console.error('museum-delete row failed', { museumId: row.id, error: error.message })
    return json(500, { error: 'Could not delete the museum. Try again.' })
  }
  return json(200, { deleted: true })
})
