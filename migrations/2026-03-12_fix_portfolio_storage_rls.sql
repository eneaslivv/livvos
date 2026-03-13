-- =============================================
-- Fix portfolio-images storage RLS policies
-- =============================================

-- Drop all previous attempts
DROP POLICY IF EXISTS "portfolio_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_select" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_update" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_delete" ON storage.objects;

-- INSERT: any authenticated user can upload to portfolio-images
CREATE POLICY "portfolio_images_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portfolio-images');

-- SELECT: anyone can read (public bucket)
CREATE POLICY "portfolio_images_select"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'portfolio-images');

-- UPDATE: authenticated users can update files in portfolio-images (needed for upsert)
CREATE POLICY "portfolio_images_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'portfolio-images')
WITH CHECK (bucket_id = 'portfolio-images');

-- DELETE: authenticated users can delete files
CREATE POLICY "portfolio_images_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portfolio-images');
