// Creates a draft museum and returns its secret edit key plus signed upload
// URLs for each photo. The key is shown once; only its SHA-256 is stored.
// Deploy: supabase functions deploy museum-create
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { expectedPhotoPaths, generateEditKey, generateSlug, hashEditKey, validateMuseumInput } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const parsed = validateMuseumInput(await readJson(req))
  if (!parsed.ok) return json(400, { error: parsed.error })
  const m = parsed.value

  const editKey = generateEditKey()
  const editKeyHash = await hashEditKey(editKey)
  let museum: { id: string; slug: string } | null = null
  for (let attempt = 0; attempt < 3 && !museum; attempt++) {
    const { data, error } = await admin.from('museums').insert({
      slug: generateSlug(),
      edit_key_hash: editKeyHash,
      recipient_name: m.recipientName,
      curator_name: m.curatorName,
      exhibit_count: m.exhibits.length,
      has_final_photo: m.hasFinalPhoto,
    }).select('id, slug').single()
    if (!error) museum = data
    else if (error.code !== '23505') { // anything but a slug collision
      console.error('museum-create insert failed', { error: error.message })
      return json(500, { error: 'Could not create the museum. Try again.' })
    }
  }
  if (!museum) return json(500, { error: 'Could not create the museum. Try again.' })
  const museumId = museum.id

  const fail = async (message: string, detail: string) => {
    console.error('museum-create failed', { museumId, detail })
    await admin.from('museums').delete().eq('id', museumId)
    return json(500, { error: message })
  }

  const { error: exErr } = await admin.from('museum_exhibits')
    .insert(m.exhibits.map((e, position) => ({ museum_id: museumId, position, ...e })))
  if (exErr) return fail('Could not save the exhibits. Try again.', exErr.message)

  const uploads: { path: string; token: string }[] = []
  for (const path of expectedPhotoPaths(museumId, m.exhibits.length, m.hasFinalPhoto)) {
    // upsert lets the client safely retry a photo whose first attempt half-landed.
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return fail('Could not prepare photo uploads. Try again.', error?.message ?? 'no data')
    uploads.push({ path, token: data.token })
  }
  return json(200, { slug: museum.slug, editKey, uploads })
})
