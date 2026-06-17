# DATABASE.md — ShotPolish (Supabase / Postgres)

Canonical source: `supabase/schema.sql`. Applied incrementally via
`supabase/migrations/`. All app tables have Row Level Security enabled.

## Tables

### profiles  (1:1 with auth.users)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → `auth.users(id)` **ON DELETE CASCADE** (added in 0002) |
| email | text NOT NULL | |
| full_name | text | |
| plan | text NOT NULL default `'free'` | `free` \| `pro` \| `ltd` |
| stripe_customer_id | text | set by webhook |
| plan_renews_at | timestamptz | set/cleared by webhook |
| ltd_seat | int | founders-wall seat (assigned once) |
| created_at | timestamptz default now() | |

RLS: SELECT/UPDATE only where `auth.uid() = id`. **Column privileges (0003):**
clients may UPDATE only `full_name`; `plan` / `stripe_customer_id` /
`plan_renews_at` / `ltd_seat` are writable solely by the service-role webhook —
this prevents a user from self-assigning a paid plan.
Trigger: `handle_new_user()` (SECURITY DEFINER) inserts a profile AFTER INSERT
on `auth.users`.

### workspaces  (user projects)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK default uuid_generate_v4() | |
| user_id | uuid | FK → `profiles(id)` ON DELETE CASCADE |
| name | text NOT NULL | |
| context | jsonb | product context |
| slides | jsonb | story slides |
| created_at / updated_at | timestamptz | |

RLS: ALL where `auth.uid() = user_id`.

### brand_kits
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → `profiles(id)` ON DELETE CASCADE |
| name | text NOT NULL | |
| colors | jsonb | `{ primary, secondary, accent }` |
| typography | jsonb | `{ font_family }` |
| visual_defaults | jsonb | `{ padding, shadow_opacity, border_radius }` |
| logo_url | text | |
| created_at / updated_at | timestamptz | |

RLS: ALL where `auth.uid() = user_id`.

### stripe_events  (webhook idempotency ledger)
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Stripe event id; duplicate insert ⇒ already processed |
| type | text | |
| processed_at | timestamptz default now() | |

Written ONLY by `stripe-webhook` (service role). Not user-facing, no RLS policy
for clients.

## Cascade chain
Delete `auth.users` row → `profiles` (CASCADE, via 0002) → `workspaces` +
`brand_kits` (CASCADE). This is what makes `delete-account` fully remove a user.

## Migrations
| File | Effect |
|------|--------|
| `0001_profiles_plan.sql` | Add plan/stripe columns to profiles; create stripe_events. |
| `0002_profiles_cascade.sql` | Replace profiles_id_fkey with ON DELETE CASCADE (deletion was previously blocked). |
| `0003_profiles_lock_billing_columns.sql` | Revoke client UPDATE on billing columns; grant only `full_name` (closes plan self-upgrade). |
| `0004_storage_assets_policies.sql` | Make the `assets` Storage bucket private + owner-scoped CRUD policies. |

## Storage
Bucket `assets` (private). User screenshots live at `assets/{user_id}/{ws_id}/{asset_id}`
(written by `workspaceStore.ts`). Policies (0004) scope every operation to the
owner via `(storage.foldername(name))[1] = auth.uid()`. `delete-account` purges
the user's `assets/{user_id}/` tree on account deletion (Storage doesn't cascade).

## Access patterns (where queried)
- `AuthProvider.tsx` — `profiles.plan`, first `brand_kits` row.
- `workspaceStore.ts` — `workspaces` upsert/select/delete (auth only).
- `BrandKitPage.tsx` — `brand_kits` insert/update.
- `stripe-webhook` — `profiles` update + `stripe_events` insert/delete (service role).
