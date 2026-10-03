# Museum of You — Design (Option A: swipe-through 2.5D gallery)

Status: approved direction (2026-10-03). Prototype that was approved:
https://claude.ai/artifact/WPpwsNPm9rMYCEoWk4vkwj (option A).

## 1. What we're building

A gift product inside ShotPolish. Someone builds a museum about a person they
love (photos + museum-style plaques) and sends it as a link. The recipient gets
a ticket, swipes through softly lit rooms, and in the final room an empty gold
frame turns on their front camera: **they are the Masterpiece**. They leave
"through the gift shop", which hands them a shareable card and a
"Build a museum for someone" button (the viral loop).

ShotPolish becomes a hub: the existing screenshot tool stays as-is; Museum of You
gets its own pages under `/museum` and `/m/:slug` with its own look.

### Decisions already made (from brainstorming)
| Topic | Decision |
|---|---|
| Renderer | **A**: DOM/CSS swipe gallery + scroll-driven parallax. B (Three.js) later as a second viewer over the same data. |
| Pricing | Free: up to **3 exhibits**, link open **7 days**, ShotPolish badge on share card. Full: **$3.99 one-time**, up to **20 exhibits**, open forever. |
| Accounts | **None.** Creator gets a secret edit key (stored on their device, also in a manage link). |
| Payments | Stripe Checkout, **test mode** until the account is activated. Reuse the existing `stripe-webhook`. |

### Defaults chosen during build (user asked to skip section-by-section review)
- Payment happens **at publish time** ("Open the museum"), not mid-build. The
  builder shows a note once the 4th exhibit is added.
- Recipient name required; curator name optional. Plaque fields: title
  (required), place, year, medium (with a "Suggest" button).
- Creator may add an optional photo of the recipient for the final frame, used
  when the camera is unavailable (denied, in-app browser, desktop without camera).
- Camera frames are never uploaded. The captured portrait only exists on the
  recipient's device (for their share card).
- Photos are resized client-side to max 1600px JPEG, which also strips EXIF/GPS.

## 2. Routes

| Route | Page | Notes |
|---|---|---|
| `/museum` | Landing | What it is, how it works, pricing line, "Build a museum", "See an example". |
| `/museum/example` | Viewer (sample data) | Painted sample photos, no backend. Marketing + demo. |
| `/museum/new` | Builder | Autosaves draft to IndexedDB. Preview opens the viewer with local data. |
| `/m/:slug` | Viewer (live) | Ticket → rooms → final room → gift shop. Closed/missing states. |
| `/museum/manage/:slug` | Manage | Link + copy/share, status, upgrade ($3.99), delete. Edit key from localStorage or `#k=` hash. |

All museum routes are lazy-loaded so the ShotPolish bundle doesn't grow.
`/museum*` and `/m/*` are served from a second HTML entry (`museum.html`) with
gift-appropriate Open Graph tags ("You're invited to a private exhibition"), so
links pasted into WhatsApp/iMessage don't preview as a screenshot tool. No
personal data goes into OG tags.

Hub: the ShotPolish homepage gets one "New: Museum of You" card linking to `/museum`.

## 3. Data model (migration `0005_museums.sql`)

```
museums
  id uuid pk, slug text unique (10-char base62, the public link id)
  edit_key_hash text (sha-256 hex of the secret edit key)
  recipient_name text (1..40), curator_name text (<=40, nullable)
  tier text 'free'|'full' (default free)
  status text 'draft'|'live' (default draft)
  exhibit_count int, has_final_photo bool
  published_at timestamptz, expires_at timestamptz (null = never)
  stripe_session_id text, created_at, updated_at
museum_exhibits
  id uuid pk, museum_id fk -> museums ON DELETE CASCADE, position int (unique per museum)
  title text (1..80), place (<=60), year (<=20), medium (<=100)
```
- RLS enabled on both tables with **no client policies**: only edge functions
  (service role) read/write. Clients never query these tables directly.
- Storage bucket `museums` (**private**). Paths: `{museum_id}/{position}.jpg`,
  `{museum_id}/final.jpg`. Uploads use **signed upload URLs** minted by
  `museum-create`; reads use **signed URLs (1 hour)** minted by `museum-get`
  only while the museum is open. No storage policies for anon/authenticated.

"Open" = `status = 'live' AND (expires_at IS NULL OR expires_at > now())`.

## 4. Edge functions (thin Deno shells over pure, tested logic)

Pure logic lives in `supabase/functions/_shared/museum.ts` (validation, slug/key
generation, hashing, open/closed state, payment-event mapping). Client rules
(limits, price) are duplicated in `src/lib/museum/rules.ts` per the repo's
"separate bundles" convention; a Vitest test asserts the two stay identical.

| Function | Input | Behavior |
|---|---|---|
| `museum-create` | recipientName, curatorName?, exhibits[{title,place?,year?,medium?}], hasFinalPhoto | Validate; create draft rows; return `{slug, editKey, uploads:[{path, token}]}`. |
| `museum-publish` | slug, editKey, tier | Verify key + that every expected photo exists. `free` (≤3 exhibits): status live, expires now+7d. `full`: create Stripe Checkout (price_data $3.99 USD, `metadata.kind='museum'`, `metadata.museum_id`), return `{checkoutUrl}`. Also used for "upgrade" from manage. |
| `museum-get` | slug, editKey? | Public: if open → names, exhibits with signed photo URLs, final photo URL. If closed → `{state:'closed', recipientName, curatorName}`. If missing → 404 shape. With a valid editKey → owner fields (tier, status, expiresAt, exhibitCount) even when closed/draft. |
| `museum-delete` | slug, editKey | Remove storage folder, delete rows. |
| `stripe-webhook` (extend) | Stripe event | If `checkout.session.completed` with `metadata.kind='museum'` → set tier full, status live, published_at (keep existing), expires_at null. Existing plan path untouched. Same idempotency + rollback semantics. |

Invariants: edit key is never stored in plaintext; slug alone never grants
write access; service-role key only inside functions; webhook signature check
and dedupe unchanged. Redirect URLs come from `PUBLIC_SITE_URL` env (fallback
`https://shotpolish.org`), never from the request.

## 5. Client structure

```
src/lib/museum/
  rules.ts         limits, price label, requiredTier(), validateDraft(), daysLeft(), medium suggestions (pure)
  image.ts         fitWithin() (pure) + prepareImage(file) -> JPEG Blob (resize, EXIF strip)
  draftStore.ts    IndexedDB draft (text + photo blobs); myMuseums list in localStorage
  api.ts           createMuseum/publishMuseum/getMuseum/deleteMuseum + signed uploads
  shareCard.ts     renderShareCard(image, name) -> canvas (gold frame, plaque, badge)
  samples.ts       painted sample photos for /museum/example
src/components/museum/
  museum.css       scoped under .mu (gallery green, gilt, Cormorant Garamond + Jost)
  Ticket, Gallery (scroll-snap track + parallax), Room, Plaque, FinalRoom (camera/photo/upload),
  GiftShop, ExhibitEditor, MuseumHeader
src/pages/
  MuseumLandingPage, MuseumBuilderPage, MuseumViewerPage, MuseumManagePage
```
The viewer component takes a `ViewerMuseum` (names, exhibits with photo URLs,
optional final photo URL) so the same component renders preview, example, and
live museums, and a future 3D viewer can consume the same shape.

## 6. Key flows

**Build → publish (free):** builder autosaves → "Open the museum" → choose Free
→ `museum-create` → upload photos to signed URLs (progress n/m) →
`museum-publish(free)` → save `{slug, editKey}` to localStorage → manage page
shows the link + "Copy" / "Share".

**Build → publish (full):** same until publish → `museum-publish(full)` returns
`checkoutUrl` → Stripe → success to `/museum/manage/:slug?paid=1` → manage page
polls `museum-get` (every 2s, up to 30s) until tier is full → "Your museum is
open forever." Cancel returns to manage with the option to retry or (if ≤3
exhibits) open for free.

**Recipient:** `/m/:slug` → `museum-get` → ticket ("ADMIT ONE · {name} ·
Opening night · curated by {curator}") → rooms → final room "Step closer" →
camera (mirrored live video in the frame, "Take my portrait") → reveal →
gift shop card (share via Web Share API with file, or save image) →
"Build a museum for someone" → `/museum/new`. Camera unavailable → creator's
final photo if present, else "Choose a photo".

**Closed (expired free) museum:** "This museum has closed. Free museums stay
open for 7 days. {Curator} can reopen it for good." + "Build your own museum".

## 7. Error handling
- Backend not configured (`isSupabaseConfigured` false): builder still works
  (draft + preview); publishing shows "Publishing isn't switched on yet."
- Upload failure: retry the failed file up to 2 times, then show which photo
  failed with a retry button. Draft is never cleared until publish succeeds.
- Unreadable image file: inline error on that exhibit.
- Camera denied/absent: silent fallback (no scary error), as above.
- Payment webhook slow: manage page polling message, then "Payment received;
  it can take a minute. Refresh this page." after 30s.

## 8. Analytics (via existing `track()`)
`museum_builder_started`, `museum_exhibit_added`, `museum_preview_opened`,
`museum_publish_clicked{tier}`, `museum_published{tier}`, `museum_checkout_started`,
`museum_paid_confirmed`, `museum_viewer_opened{state}`, `museum_entered`,
`museum_final_reveal{source: camera|photo|upload}`, `museum_card_shared{method}`,
`museum_build_own_clicked`. No names, captions, or photos in event props.

## 9. Privacy & legal
Privacy page gains a "Museum of You" section: museum photos and text are
stored (private bucket, unlisted link, signed URLs); free museums close after 7
days; the creator can delete anytime from the manage link; camera frames never
leave the recipient's device; images are re-encoded without location data.

## 10. Testing
- Vitest (pure): rules (tiers, validation, days left), rules sync client↔edge,
  slug/key format + hashing, open/closed state, museum payment event mapping,
  `mapStripeEvent` still ignores museum sessions, image `fitWithin`.
- Manual (dev server, no backend): `/museum`, `/museum/example`, builder →
  preview → final room fallback → gift shop, mobile width.
- Backend smoke test after deploy (user): create free museum, open link on
  phone, pay with Stripe test card, delete.

## 11. Out of scope (follow-ups)
- Scheduled cleanup of expired free museums and abandoned drafts (storage).
- Rate limiting `museum-create` per IP.
- Editing a published museum (MVP: delete and rebuild).
- Background music, scheduled "opening night" unlock, group wing, 3D viewer (B).
- Report/abuse flow beyond a contact line; Stripe Tax.
