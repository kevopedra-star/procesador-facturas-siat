-- ==============================================================================
-- SCRIPT PARA MARCAR DEFINITIVAMENTE 1914-26 COMO COMPLETADO Y RECALCULAR
-- ==============================================================================

-- 1. Marcar 1914-26 como COMPLETADO en GASTOS_DESPACHOS_2026
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO'
WHERE UPPER(TRIM(n_referencia)) = '1914-26'
   OR UPPER(TRIM(n_declaracion)) = 'DI-2026-201-2300383';

-- 2. Sincronizar la tabla complementaria control_estados_importacion
UPDATE public.control_estados_importacion c
SET 
    estado_general = g.estado_tramite,
    estado_factura = g.estado_tramite,
    estado_planilla = g.estado_tramite,
    updated_at = NOW()
FROM public."GASTOS_DESPACHOS_2026" g
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(g.n_referencia));

-- 3. Recalcular los Totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
