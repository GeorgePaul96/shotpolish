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

-- ── Museum of You (migration 0005_museums.sql) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.museums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[0-9A-Za-z]{10}$'),
  edit_key_hash text NOT NULL CHECK (edit_key_hash ~ '^[0-9a-f]{64}$'),
  recipient_name text NOT NULL CHECK (char_length(recipient_name) BETWEEN 1 AND 40),
  curator_name text CHECK (curator_name IS NULL OR char_length(curator_name) <= 40),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'full')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  exhibit_count int NOT NULL CHECK (exhibit_count BETWEEN 1 AND 20),
  has_final_photo boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at timestamptz,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.museum_exhibits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  museum_id uuid NOT NULL REFERENCES public.museums(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position BETWEEN 0 AND 19),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  place text CHECK (place IS NULL OR char_length(place) <= 60),
  year text CHECK (year IS NULL OR char_length(year) <= 20),
  medium text CHECK (medium IS NULL OR char_length(medium) <= 100),
  UNIQUE (museum_id, position)
);

ALTER TABLE public.museums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.museum_exhibits ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: anon/authenticated clients get nothing.

-- Private bucket. Uploads use signed upload URLs and reads use short-lived
-- signed URLs, both minted by edge functions, so no storage policies are added.
INSERT INTO storage.buckets (id, name, public)
VALUES ('museums', 'museums', false)
ON CONFLICT (id) DO UPDATE SET public = false;
