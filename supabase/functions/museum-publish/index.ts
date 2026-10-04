// Opens a museum. tier 'free': live for FREE_DAYS (only if <= FREE_EXHIBITS and
// not already live, so the free window can't be renewed). tier 'full': returns
// a Stripe Checkout URL; stripe-webhook flips it to full + open forever.
// Redirect URLs come from PUBLIC_SITE_URL, never from the request.
// Deploy: supabase functions deploy museum-publish
import Stripe from 'npm:stripe@^17'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight, readJson } from '../_shared/http.ts'
import {
  FREE_EXHIBITS, MAX_EXHIBITS, PRICE_CENTS, PRICE_CURRENCY, canPublishFree, expectedPhotoPaths, freeExpiry,
  isValidEditKey, isValidSlug, keyMatches, museumState,
} from '../_shared/museum.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const SITE = (Deno.env.get('PUBLIC_SITE_URL') || 'https://shotpolish.org').replace(/\/+$/, '')
const BUCKET = 'museums'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const body = await readJson(req)
  const slug = body?.slug, editKey = body?.editKey, tier = body?.tier
  if (!isValidSlug(slug) || !isValidEditKey(editKey) || (tier !== 'free' && tier !== 'full')) {
    return json(400, { error: 'Invalid request.' })
  }
  const { data: museum } = await admin.from('museums')
    .select('id, edit_key_hash, tier, status, exhibit_count, has_final_photo, expires_at')
    .eq('slug', slug).maybeSingle()
  // Same answer for "no such museum" and "wrong key" so slugs can't be probed.
  if (!museum || !(await keyMatches(museum.edit_key_hash, editKey))) return json(404, { error: 'Museum not found.' })

  const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(museum.id, { limit: MAX_EXHIBITS + 5 })
  const have = new Set((files ?? []).map((f) => `${museum.id}/${f.name}`))
  const missing = expectedPhotoPaths(museum.id, museum.exhibit_count, museum.has_final_photo).filter((p) => !have.has(p))
  if (listErr || missing.length) return json(409, { error: 'Some photos are still uploading. Try again in a moment.' })

  if (museum.tier === 'full') return json(200, { state: 'open', tier: 'full', expiresAt: null })

  if (tier === 'free') {
    if (!canPublishFree(museum.exhibit_count)) return json(400, { error: `Free museums hold up to ${FREE_EXHIBITS} exhibits.` })
    if (museum.status === 'live') {
      return json(200, { state: museumState(museum, new Date()), tier: 'free', expiresAt: museum.expires_at })
    }
    const now = new Date()
    const expiresAt = freeExpiry(now)
    const { error } = await admin.from('museums').update({
      status: 'live', published_at: now.toISOString(), expires_at: expiresAt, updated_at: now.toISOString(),
    }).eq('id', museum.id)
    if (error) {
      console.error('museum-publish update failed', { museumId: museum.id, error: error.message })
      return json(500, { error: 'Could not open the museum. Try again.' })
    }
    return json(200, { state: 'open', tier: 'free', expiresAt })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: PRICE_CURRENCY,
          unit_amount: PRICE_CENTS,
          product_data: { name: 'Museum of You: full museum', description: `Up to ${MAX_EXHIBITS} exhibits, open forever.` },
        },
      }],
      metadata: { kind: 'museum', museum_id: museum.id },
      success_url: `${SITE}/museum/manage/${slug}?paid=1`,
      cancel_url: `${SITE}/museum/manage/${slug}?canceled=1`,
    })
    await admin.from('museums').update({ stripe_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', museum.id)
    return json(200, { checkoutUrl: session.url })
  } catch (err) {
    console.error('museum-publish checkout failed', { museumId: museum.id, error: (err as Error).message })
    return json(502, { error: 'Payments are unavailable right now. Try again in a minute.' })
  }
})
