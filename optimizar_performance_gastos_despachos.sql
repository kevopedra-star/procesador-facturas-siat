-- ==============================================================================
-- SCRIPT SQL PARA OPTIMIZAR EL RENDIMIENTO DE GASTOS_DESPACHOS_2026 Y EVITAR STATEMENT TIMEOUT
-- ==============================================================================

-- 1. Crear índices de alto rendimiento para acelerar las consultas y búsquedas por referencia
CREATE INDEX IF NOT EXISTS idx_gastos_desp_n_ref ON public."GASTOS_DESPACHOS_2026" (n_referencia);
CREATE INDEX IF NOT EXISTS idx_gastos_desp_n_decl ON public."GASTOS_DESPACHOS_2026" (n_declaracion);
CREATE INDEX IF NOT EXISTS idx_gastos_desp_razon ON public."GASTOS_DESPACHOS_2026" (razon_social);
CREATE INDEX IF NOT EXISTS idx_gastos_imp_n_ref ON public.gastos_importacion (n_referencia);

-- 2. Recalcular la tabla de totales del dashboard de manera inmediata
SELECT public.recalcular_totales_dashboard_2026_fn();
