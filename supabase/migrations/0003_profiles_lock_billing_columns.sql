-- M2 security fix: lock billing columns on profiles.
--
-- The "Users can update own profile" RLS policy (schema.sql) grants row-level
-- UPDATE on the user's own profile. But Postgres column privileges default to
-- ALL columns, so a signed-in user could self-assign plan='pro'/'ltd' with the
-- public anon key + their own JWT — bypassing Stripe entirely:
--   supabase.from('profiles').update({ plan: 'ltd' }).eq('id', myId)  // would succeed
--
-- profiles.plan is the only server-enforced source of truth for entitlements,
-- so this defeated billing. The client never writes to profiles (it only reads
-- `plan` in AuthProvider), so restricting column UPDATE privileges is safe.
--
-- After this migration, plan / stripe_customer_id / plan_renews_at / ltd_seat
-- are writable ONLY by the service-role webhook (service_role bypasses RLS and
-- retains full privileges). Clients may still edit full_name.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (full_name) ON public.profiles TO authenticated;
