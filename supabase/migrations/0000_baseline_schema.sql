-- Baseline migration: creates the initial schema for a fresh database.
-- Promoted from supabase/schema.sql, which was previously applied by hand and
-- never tracked as a migration (so 0001+ had no base tables to ALTER on a new
-- project). This file is the canonical first step; keep it in sync with
-- schema.sql. Safe to run once on an empty database.

-- UUID defaults use gen_random_uuid() (Postgres core, in pg_catalog) rather than
-- uuid_generate_v4() (uuid-ossp, lives in the `extensions` schema which is not on
-- the search_path during `supabase db push` -> "function does not exist").

-- Profiles (Tied to Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- M0 billing columns (also applied via migrations/0001_profiles_plan.sql)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';      -- free | pro | ltd
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_renews_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ltd_seat INT;

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Workspaces (Projects)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  context JSONB,
  slides JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own workspaces" ON workspaces FOR ALL USING (auth.uid() = user_id);

-- Brand Kits
CREATE TABLE brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colors JSONB, -- { primary, secondary, accent }
  typography JSONB, -- { font_family }
  visual_defaults JSONB, -- { padding, shadow_opacity, border_radius }
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for brand_kits
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own brand kits" ON brand_kits FOR ALL USING (auth.uid() = user_id);

-- Stripe webhook idempotency (written only by the service-role webhook).
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
