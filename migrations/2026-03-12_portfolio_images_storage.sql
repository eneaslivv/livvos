-- =============================================
-- Create portfolio-images storage bucket + RLS policies
-- =============================================

-- 1. Create the bucket (public so images can be viewed on the website)
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-images', 'portfolio-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "portfolio_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_select" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_update" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_images_delete" ON storage.objects;

-- 3. Authenticated users can upload to portfolio-images
CREATE POLICY "portfolio_images_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portfolio-images');

-- 4. Anyone can view (public bucket for website)
CREATE POLICY "portfolio_images_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'portfolio-images');

-- 5. Authenticated users can update their uploads
CREATE POLICY "portfolio_images_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'portfolio-images');

-- 6. Authenticated users can delete their uploads
CREATE POLICY "portfolio_images_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portfolio-images');
