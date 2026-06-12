-- M0: Billing & Entitlements — add plan columns to profiles + webhook idempotency.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';      -- free | pro | ltd
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltd_seat INT;

-- Every processed Stripe event id is recorded once so re-deliveries are no-ops.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
