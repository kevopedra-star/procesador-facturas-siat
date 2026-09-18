-- =================================================================
-- SCRIPT DE ELIMINACIÓN COMPLETA DE TABLA 'libro_diario' EN SUPABASE
-- =================================================================

-- 1. Eliminar disparadores (Triggers) si existen
DROP TRIGGER IF EXISTS trg_update_libro_diario_modtime ON public.libro_diario;

-- 2. Eliminar funciones auxiliares si existen
DROP FUNCTION IF EXISTS public.update_libro_diario_modtime();

-- 3. Eliminar la tabla por completo junto con sus índices y políticas RLS
DROP TABLE IF EXISTS public.libro_diario CASCADE;

-- Confirmación
SELECT 'Tabla libro_diario eliminada con éxito de Supabase' AS resultado;
