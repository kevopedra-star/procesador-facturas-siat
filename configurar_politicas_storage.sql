-- =====================================================================
-- HABILITAR PERMISOS DE LECTURA, SUBIDA Y BORRADO EN 'facturas-pdf'
-- Ejecuta este script en el Editor SQL de Supabase (SQL Editor)
-- =====================================================================

-- 1. Permitir LECTURA (SELECT)
DROP POLICY IF EXISTS "Permitir select facturas-pdf" ON storage.objects;
CREATE POLICY "Permitir select facturas-pdf"
ON storage.objects FOR SELECT
TO public, anon, authenticated
USING (bucket_id = 'facturas-pdf');

-- 2. Permitir SUBIDA / CREACIÓN (INSERT)
DROP POLICY IF EXISTS "Permitir insert facturas-pdf" ON storage.objects;
CREATE POLICY "Permitir insert facturas-pdf"
ON storage.objects FOR INSERT
TO public, anon, authenticated
WITH CHECK (bucket_id = 'facturas-pdf');

-- 3. Permitir ACTUALIZACIÓN (UPDATE)
DROP POLICY IF EXISTS "Permitir update facturas-pdf" ON storage.objects;
CREATE POLICY "Permitir update facturas-pdf"
ON storage.objects FOR UPDATE
TO public, anon, authenticated
USING (bucket_id = 'facturas-pdf');

-- 4. Permitir ELIMINACIÓN DE FACTURAS PROCESADAS (DELETE)
DROP POLICY IF EXISTS "Permitir delete facturas-pdf" ON storage.objects;
CREATE POLICY "Permitir delete facturas-pdf"
ON storage.objects FOR DELETE
TO public, anon, authenticated
USING (bucket_id = 'facturas-pdf');
