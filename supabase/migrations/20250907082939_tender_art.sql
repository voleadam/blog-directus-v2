/*
  # Setup RLS Policies for Blog

  1. New Security Policies
    - Enable RLS on `public.blogs` table
    - Enable RLS on `public.directus_files` table  
    - Enable RLS on `storage.objects` table
    - Create read-only policies for anonymous and authenticated users
    - Restrict storage access to 'pictures' bucket only

  2. Security Features
    - Blog posts are publicly readable
    - File metadata is accessible for joins
    - Storage objects limited to pictures bucket
    - No write access via RLS (server-side only)
    - Service role bypasses RLS for admin operations
*/

-- ------------------------------------------------------------
-- RLS: Read-only public blog with Directus files metadata and
--      Storage reads limited to the `pictures` bucket
-- ------------------------------------------------------------
BEGIN;

-- === BLOG CONTENT ===
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blogs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blogs' AND policyname = 'blogs_public_read_anon'
  ) THEN
    CREATE POLICY "blogs_public_read_anon"
      ON public.blogs
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blogs' AND policyname = 'blogs_public_read_authenticated'
  ) THEN
    CREATE POLICY "blogs_public_read_authenticated"
      ON public.blogs
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END$$;

-- (Optional hardening) Ensure nobody can write via SQL privileges either.
-- REVOKE INSERT, UPDATE, DELETE ON public.blogs FROM anon, authenticated;

-- === DIRECTUS FILES METADATA (for joins to blogs.picture) ===
-- If your frontend never queries directus_files directly, you may omit this section.
ALTER TABLE public.directus_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directus_files FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'directus_files' AND policyname = 'files_public_read_anon'
  ) THEN
    CREATE POLICY "files_public_read_anon"
      ON public.directus_files
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'directus_files' AND policyname = 'files_public_read_authenticated'
  ) THEN
    CREATE POLICY "files_public_read_authenticated"
      ON public.directus_files
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END$$;

-- (Optional hardening)
-- REVOKE INSERT, UPDATE, DELETE ON public.directus_files FROM anon, authenticated;

-- === SUPABASE STORAGE: allow public read of ONLY the `pictures` bucket ===
-- Note: The `storage` schema and `objects` table exist in Supabase projects.
-- If you are not using Supabase Storage, you can remove this section.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pictures_bucket_read_anon'
  ) THEN
    CREATE POLICY "pictures_bucket_read_anon"
      ON storage.objects
      FOR SELECT
      TO anon
      USING (bucket_id = 'pictures');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pictures_bucket_read_authenticated'
  ) THEN
    CREATE POLICY "pictures_bucket_read_authenticated"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'pictures');
  END IF;
END$$;

-- (Optional hardening)
-- REVOKE INSERT, UPDATE, DELETE ON storage.objects FROM anon, authenticated;

COMMIT;

-- -----------------------
-- Quick sanity checklist:
-- - No INSERT/UPDATE/DELETE policies are present => client writes are blocked by RLS.
-- - Service role (server-side) bypasses RLS for Directus/S3 ingestion.
-- - Storage reads are permitted only for bucket_id = 'pictures'.
-- -----------------------