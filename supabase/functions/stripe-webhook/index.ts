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
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 })
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

  // LTD: assign the next founders-wall seat if not already set.
  if (update.plan === 'ltd') {
    const { data: top } = await supabase
      .from('profiles').select('ltd_seat').not('ltd_seat', 'is', null)
      .order('ltd_seat', { ascending: false }).limit(1).maybeSingle()
    patch.ltd_seat = ((top?.ltd_seat as number | null) ?? 0) + 1
  }

  const query = update.userId
    ? supabase.from('profiles').update(patch).eq('id', update.userId)
    : supabase.from('profiles').update(patch).eq('stripe_customer_id', update.stripeCustomerId!)

  const { error: updateError } = await query
  if (updateError) {
    return new Response(`DB update failed: ${updateError.message}`, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
