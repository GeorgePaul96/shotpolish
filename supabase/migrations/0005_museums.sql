-- Museum of You: gift museums built without an account. Only edge functions
-- (service role) read or write these; RLS is on with no client policies.
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
