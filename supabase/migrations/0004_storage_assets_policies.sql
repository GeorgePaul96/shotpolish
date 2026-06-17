-- M2 security fix: private, owner-scoped policies for the 'assets' Storage bucket.
--
-- workspaceStore.ts uploads user screenshots to assets/{user_id}/{ws_id}/{asset_id}.
-- Supabase Storage is NOT covered by table RLS, so without bucket policies the
-- objects could be world-readable / writable by path enumeration. Scope every
-- operation to the owning user's top-level folder (first path segment == uid).

-- Ensure the bucket exists and is private (no anonymous public read).
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Idempotent: drop prior versions before recreating.
DROP POLICY IF EXISTS "assets owner select" ON storage.objects;
DROP POLICY IF EXISTS "assets owner insert" ON storage.objects;
DROP POLICY IF EXISTS "assets owner update" ON storage.objects;
DROP POLICY IF EXISTS "assets owner delete" ON storage.objects;

CREATE POLICY "assets owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "assets owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "assets owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "assets owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);
