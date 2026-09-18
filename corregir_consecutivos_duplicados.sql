-- ============================================================================
-- SCRIPT SQL: CORREGIR Y REORDENAR CONSECUTIVOS DUPLICADOS EN TABLA FACTURAS
-- ============================================================================
-- Este script renumera todas las facturas existentes en la tabla 'public.facturas'
-- ordenadas cronológicamente por fecha de creación (created_at) e ID.
-- Elimina duplicados de consecutivas (397, 395, 393, etc.) y asigna números
-- secuenciales únicos desde 1 hasta N sin vacíos ni repeticiones.
-- ============================================================================

WITH renumbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS nuevo_consecutivo
    FROM public.facturas
)
UPDATE public.facturas f
SET consecutivo = r.nuevo_consecutivo
FROM renumbered r
WHERE f.id = r.id;

-- Verificar los últimos 20 consecutivos corregidos
SELECT consecutivo, n_factura, ref_guia, created_at 
FROM public.facturas 
ORDER BY consecutivo DESC 
LIMIT 20;
