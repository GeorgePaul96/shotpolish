-- M2: account deletion. The profiles.id -> auth.users(id) FK had no ON DELETE
-- rule (defaults to NO ACTION), so deleting an auth user was BLOCKED by the
-- referencing profiles row and the delete-account function would fail at runtime.
-- Make it cascade so deleting the auth user removes profiles, which in turn
-- cascades workspaces and brand_kits (those already reference profiles ON DELETE CASCADE).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
