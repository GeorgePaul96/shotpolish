// Supabase Edge Function (Deno). Verifies Stripe signatures, dedupes events,
// and applies the pure mapStripeEvent() result to profiles using the
// service-role key. Deploy: supabase functions deploy stripe-webhook
import Stripe from 'npm:stripe@^17'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { mapStripeEvent } from '../_shared/mapStripeEvent.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('stripe-webhook signature verification failed', { error: (err as Error).message })
    return new Response('Invalid signature', { status: 400 })
  }

  // Idempotency: record the event id; a duplicate insert means already processed.
  const { error: dupeError } = await supabase
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })
  if (dupeError) {
    // Unique-violation -> we've already handled this event. Acknowledge and stop.
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
  }

  const update = mapStripeEvent(event as any)
  if (!update) {
    return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200 })
  }

  const patch: Record<string, unknown> = { plan: update.plan }
  if (update.stripeCustomerId) patch.stripe_customer_id = update.stripeCustomerId
  if (update.planRenewsAt !== undefined) patch.plan_renews_at = update.planRenewsAt

  // LTD: assign the next founders-wall seat ONLY if this profile has none yet,
  // so a reprocessed/retried checkout doesn't burn a new seat. (A fully
  // race-safe assignment needs a DB sequence/UNIQUE constraint — deferred.)
  if (update.plan === 'ltd' && update.userId) {
    const { data: me } = await supabase
      .from('profiles').select('ltd_seat').eq('id', update.userId).maybeSingle()
    if (me?.ltd_seat == null) {
      const { data: top } = await supabase
        .from('profiles').select('ltd_seat').not('ltd_seat', 'is', null)
        .order('ltd_seat', { ascending: false }).limit(1).maybeSingle()
      patch.ltd_seat = ((top?.ltd_seat as number | null) ?? 0) + 1
    }
  }

  const query = update.userId
    ? supabase.from('profiles').update(patch).eq('id', update.userId)
    : supabase.from('profiles').update(patch).eq('stripe_customer_id', update.stripeCustomerId!)

  const { error: updateError } = await query
  if (updateError) {
    // Roll back the idempotency marker so Stripe's retry reprocesses this event
    // instead of being short-circuited as a duplicate (which would strand a
    // paying customer on the free plan). Plan writes are idempotent; the LTD
    // seat assignment below is guarded by a null-check so reprocessing is safe.
    await supabase.from('stripe_events').delete().eq('id', event.id)
    console.error('stripe-webhook update failed', { eventId: event.id, type: event.type, error: updateError.message })
    return new Response('Update failed', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
