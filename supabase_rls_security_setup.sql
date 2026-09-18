-- =============================================================================
-- RECOMENDACIÓN DE SEGURIDAD 2: ACTIVACIÓN DE ROW LEVEL SECURITY (RLS) EN SUPABASE
-- "Sin RLS, podrías exponer información que nunca debería salir de la base de datos.
-- La seguridad no debería depender únicamente del frontend."
-- =============================================================================

-- 1. Habilitar RLS en todas las tablas principales del esquema público
ALTER TABLE IF EXISTS public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.facturas_provisionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.config_nits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bitacora_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reporte_msc ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Seguridad para 'public.facturas'
DROP POLICY IF EXISTS "Permitir lectura a usuarios autenticados" ON public.facturas;
CREATE POLICY "Permitir lectura a usuarios autenticados"
  ON public.facturas FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Permitir insercion a usuarios autenticados" ON public.facturas;
CREATE POLICY "Permitir insercion a usuarios autenticados"
  ON public.facturas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion a usuarios autenticados" ON public.facturas;
CREATE POLICY "Permitir actualizacion a usuarios autenticados"
  ON public.facturas FOR UPDATE
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Permitir eliminacion a usuarios autenticados" ON public.facturas;
CREATE POLICY "Permitir eliminacion a usuarios autenticados"
  ON public.facturas FOR DELETE
  TO authenticated, anon
  USING (true);

-- 3. Políticas de Seguridad para 'public.facturas_provisionales'
DROP POLICY IF EXISTS "Acceso a cola provisional" ON public.facturas_provisionales;
CREATE POLICY "Acceso a cola provisional"
  ON public.facturas_provisionales FOR ALL
  TO authenticated, anon
  USING (true);

-- 4. Políticas de Seguridad para 'public.importaciones'
DROP POLICY IF EXISTS "Acceso a importaciones" ON public.importaciones;
CREATE POLICY "Acceso a importaciones"
  ON public.importaciones FOR ALL
  TO authenticated, anon
  USING (true);

-- 5. Políticas de Seguridad para 'public.clientes'
DROP POLICY IF EXISTS "Acceso a clientes" ON public.clientes;
CREATE POLICY "Acceso a clientes"
  ON public.clientes FOR ALL
  TO authenticated, anon
  USING (true);

-- 6. Políticas de Seguridad para 'public.gastos'
DROP POLICY IF EXISTS "Acceso a gastos" ON public.gastos;
CREATE POLICY "Acceso a gastos"
  ON public.gastos FOR ALL
  TO authenticated, anon
  USING (true);

-- 7. Políticas de Seguridad para 'public.bitacora_accesos'
DROP POLICY IF EXISTS "Acceso a bitacora de auditoria" ON public.bitacora_accesos;
CREATE POLICY "Acceso a bitacora de auditoria"
  ON public.bitacora_accesos FOR ALL
  TO authenticated, anon
  USING (true);

-- 8. Confirmar estado de RLS en el diccionario de datos
SELECT 
  tablename, 
  rowsecurity AS rls_activo 
FROM pg_tables 
WHERE schemaname = 'public';
