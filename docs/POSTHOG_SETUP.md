# PostHog Setup (post-deploy, ~5 min in the PostHog UI)

The app ships the instrumentation; the funnel/retention *views* are built in the
PostHog UI. Prereqs: a PostHog Cloud **EU** project; set `VITE_PUBLIC_POSTHOG_KEY`
(and optionally `VITE_PUBLIC_POSTHOG_HOST`) in the deploy env.

## Verify ingestion
1. Deploy with the key set. Open the site, click through a page or two, do an export.
2. In PostHog → Activity/Live events, confirm `$pageview`, `export_completed`, etc.
   arrive. In browser devtools → Application → Cookies, confirm NO PostHog cookies
   (data is in Local Storage instead).

## Funnels to create (Product → Funnels)
1. **Remix loop → intent:** `remix_landed` → `export_completed` → `pricing_tier_clicked`.
2. **Broad → intent:** `$pageview` → `export_completed` → `pricing_tier_clicked`.

## Retention (Product → Retention)
- Returning on **any event**, weekly, first 8 weeks.

## Notes
- Paid conversion is intentionally NOT a client event — read paid counts from Stripe.
- Autocapture, session replay, and heatmaps are disabled by design.
