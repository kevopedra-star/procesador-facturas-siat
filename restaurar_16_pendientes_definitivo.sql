-- ==============================================================================
-- SCRIPT DE RESTAURACIÓN DEFINITIVA: REGRESA A LOS 16 PENDIENTES REALES
-- ==============================================================================

-- 1. Sincronizar montos reales desde 'gastos_importacion' por n_referencia
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = gi.total_factura,
    total_planilla = gi.total_planilla,
    monto_total_factura = gi.total_factura::text,
    fecha_factura = gi.fecha_factura
FROM public.gastos_importacion gi
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(gi.n_referencia));

-- 2. Sincronizar montos desde 'reporte_unificado_data' por n_referencia
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

-- 3. Sincronizar montos desde 'mtodo' por n_referencia
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    monto_total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )::text,
    total_planilla = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )
FROM public.mtodo m
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(m.interno));

-- 4. Marcar estado_tramite = 'EN PROCESO' a despachos sin factura de agencia ni planilla
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'EN PROCESO'
WHERE (COALESCE(NULLIF(regexp_replace(monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (COALESCE(NULLIF(regexp_replace(total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (razon_social IS NULL OR UPPER(razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%')
  AND (n_referencia IS NULL OR UPPER(n_referencia) NOT LIKE '%EXP%');

-- 5. Marcar estado_tramite = 'COMPLETADO' a despachos con factura o planilla de agencia cargada
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO'
WHERE (COALESCE(NULLIF(regexp_replace(monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
    OR COALESCE(NULLIF(regexp_replace(total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
   OR (UPPER(razon_social) LIKE '%MINERA SAN CRISTOBAL%')
   OR (UPPER(n_referencia) LIKE '%EXP%');

-- 6. Sincronizar la tabla complementaria control_estados_importacion
UPDATE public.control_estados_importacion c
SET 
    estado_general = g.estado_tramite,
    estado_factura = g.estado_tramite,
    estado_planilla = g.estado_tramite,
    updated_at = NOW()
FROM public."GASTOS_DESPACHOS_2026" g
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(g.n_referencia));

-- 7. Recalcular Totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
