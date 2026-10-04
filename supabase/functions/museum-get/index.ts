// Public read of a museum by slug. Photos come back as 1-hour signed URLs and
// only while the museum is open. A valid editKey adds owner fields (used by
// the manage page), including for drafts and closed museums.
// Deploy: supabase functions deploy museum-get
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import { finalPhotoPath, isValidEditKey, isValidSlug, keyMatches, museumState, photoPath } from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BUCKET = 'museums'
const URL_TTL = 3600

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const body = await readJson(req)
  const slug = body?.slug, editKey = body?.editKey
  if (!isValidSlug(slug)) return json(404, { state: 'missing' })
  const { data: row } = await admin.from('museums')
    .select('id, edit_key_hash, recipient_name, curator_name, tier, status, exhibit_count, has_final_photo, published_at, expires_at')
    .eq('slug', slug).maybeSingle()
  if (!row) return json(404, { state: 'missing' })

  const isOwner = isValidEditKey(editKey) && (await keyMatches(row.edit_key_hash, editKey))
  const state = museumState(row, new Date())
  const owner = isOwner
    ? { owner: { tier: row.tier, status: row.status, expiresAt: row.expires_at, publishedAt: row.published_at, exhibitCount: row.exhibit_count } }
    : {}
  const names = { recipientName: row.recipient_name, curatorName: row.curator_name }

  if (state === 'draft') return isOwner ? json(200, { state, ...names, ...owner }) : json(404, { state: 'missing' })
  if (state === 'closed') return json(200, { state, ...names, ...owner })

  const { data: exhibits, error: exErr } = await admin.from('museum_exhibits')
    .select('position, title, place, year, medium').eq('museum_id', row.id).order('position')
  if (exErr || !exhibits) return json(500, { error: 'Could not load this museum. Refresh to try again.' })
  const paths = exhibits.map((e) => photoPath(row.id, e.position))
  if (row.has_final_photo) paths.push(finalPhotoPath(row.id))
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrls(paths, URL_TTL)
  if (signErr || !signed) return json(500, { error: 'Could not load the photos. Refresh to try again.' })
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]))

  return json(200, {
    state,
    ...names,
    branded: row.tier === 'free',
    exhibits: exhibits.map((e) => ({
      title: e.title, place: e.place, year: e.year, medium: e.medium,
      photoUrl: urlFor.get(photoPath(row.id, e.position)) ?? '',
    })),
    finalPhotoUrl: row.has_final_photo ? urlFor.get(finalPhotoPath(row.id)) ?? null : null,
    ...owner,
  })
})
