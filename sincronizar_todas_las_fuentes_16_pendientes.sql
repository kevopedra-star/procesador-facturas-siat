-- ==============================================================================
-- SCRIPT MULTI-FUENTE BLINDADO CONTRA ERRORES DE TIPO (TEXT / INTEGER)
-- ==============================================================================
-- Este script sincroniza GASTOS_DESPACHOS_2026 tomando en cuenta las 3 fuentes
-- de facturación (gastos_importacion, reporte_unificado_data y mtodo) 
-- realizando un cast seguro a ::numeric en todos los campos para evitar 
-- errores 42804 de PostgreSQL.
-- ==============================================================================

-- 1. Sincronizar montos desde 'gastos_importacion'
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = gi.total_factura,
    total_planilla = gi.total_planilla,
    monto_total_factura = gi.total_factura::text,
    fecha_factura = gi.fecha_factura
FROM public.gastos_importacion gi
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(gi.n_referencia));

-- 2. Sincronizar montos desde 'reporte_unificado_data' (ej. COFAR / 1914-26 / DI-2026-201-2300383)
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_planilla = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(ru.total_gastos_logistica::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    monto_total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(ru.comision::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )::text
FROM public.reporte_unificado_data ru
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(ru.n_referencia));

-- 3. Sincronizar montos desde 'mtodo'
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_planilla = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    monto_total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )::text
FROM public.mtodo m
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(m.interno));

-- 4. Marcar COMPLETADO a despachos con facturación en gastos_importacion, reporte_unificado_data o mtodo
UPDATE public."GASTOS_DESPACHOS_2026" g
SET estado_tramite = 'COMPLETADO'
WHERE (COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
    OR COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
   OR (UPPER(g.razon_social) LIKE '%MINERA SAN CRISTOBAL%')
   OR EXISTS (
       SELECT 1 FROM public.reporte_unificado_data ru 
       WHERE UPPER(TRIM(ru.n_referencia)) = UPPER(TRIM(g.n_referencia))
         AND (COALESCE(NULLIF(regexp_replace(ru.total_gastos_logistica::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
           OR COALESCE(NULLIF(regexp_replace(ru.comision::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
   )
   OR EXISTS (
       SELECT 1 FROM public.mtodo m 
       WHERE UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia))
         AND (COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
           OR COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
   );

-- 5. Marcar EN PROCESO únicamente a trámites sin gastos en NINGUNA de las 3 tablas
UPDATE public."GASTOS_DESPACHOS_2026" g
SET estado_tramite = 'EN PROCESO'
WHERE (COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (g.razon_social IS NULL OR UPPER(g.razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%')
  AND NOT EXISTS (
       SELECT 1 FROM public.reporte_unificado_data ru 
       WHERE UPPER(TRIM(ru.n_referencia)) = UPPER(TRIM(g.n_referencia))
         AND (COALESCE(NULLIF(regexp_replace(ru.total_gastos_logistica::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
           OR COALESCE(NULLIF(regexp_replace(ru.comision::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
  )
  AND NOT EXISTS (
       SELECT 1 FROM public.mtodo m 
       WHERE UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia))
         AND (COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
           OR COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
  );

-- 6. Sincronizar la tabla complementaria control_estados_importacion
UPDATE public.control_estados_importacion c
SET 
    estado_general = g.estado_tramite,
    estado_factura = g.estado_tramite,
    estado_planilla = g.estado_tramite,
    updated_at = NOW()
FROM public."GASTOS_DESPACHOS_2026" g
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(g.n_referencia));

-- 7. Recalcular los Totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
