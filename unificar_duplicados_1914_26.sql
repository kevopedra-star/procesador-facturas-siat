-- ==============================================================================
-- SCRIPT DE UNIFICACIÓN Y LIMPIEZA DE DUPLICADO 1914-26 (CAST SEGURO DE TIPOS)
-- ==============================================================================

-- 1. Normalizar referencias con espacio después del guion en todas las tablas
UPDATE public.importaciones
SET n_referencia = REPLACE(n_referencia, '1914- 26', '1914-26')
WHERE n_referencia LIKE '%1914-%';

UPDATE public.gastos_importacion
SET n_referencia = REPLACE(n_referencia, '1914- 26', '1914-26')
WHERE n_referencia LIKE '%1914-%';

UPDATE public.control_estados_importacion
SET n_referencia = REPLACE(n_referencia, '1914- 26', '1914-26')
WHERE n_referencia LIKE '%1914-%';

UPDATE public.mtodo
SET interno = REPLACE(interno, '1914- 26', '1914-26')
WHERE interno LIKE '%1914-%';

UPDATE public.reporte_unificado_data
SET n_referencia = REPLACE(n_referencia, '1914- 26', '1914-26')
WHERE n_referencia LIKE '%1914-%';

-- 2. Fusionar los datos de '1914- 26' hacia '1914-26' en GASTOS_DESPACHOS_2026 (con cast seguro a ::numeric)
UPDATE public."GASTOS_DESPACHOS_2026" g_target
SET 
    n_declaracion = COALESCE(NULLIF(g_target.n_declaracion, ''), g_source.n_declaracion),
    fecha_factura = COALESCE(NULLIF(g_target.fecha_factura, ''), g_source.fecha_factura),
    fecha_aceptacion = COALESCE(NULLIF(g_target.fecha_aceptacion, ''), g_source.fecha_aceptacion),
    razon_social = COALESCE(NULLIF(g_target.razon_social, ''), g_source.razon_social),
    aduana = COALESCE(NULLIF(g_target.aduana, ''), g_source.aduana),
    factura = COALESCE(NULLIF(g_target.factura, ''), g_source.factura),
    proveedor = COALESCE(NULLIF(g_target.proveedor, ''), g_source.proveedor),
    total_cif = GREATEST(
        COALESCE(NULLIF(regexp_replace(g_target.total_cif::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(g_source.total_cif::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    total_tributos = GREATEST(
        COALESCE(NULLIF(regexp_replace(g_target.total_tributos::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(g_source.total_tributos::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g_target.total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(g_source.total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    total_planilla = GREATEST(
        COALESCE(NULLIF(regexp_replace(g_target.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(g_source.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    monto_total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g_target.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(g_source.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )::text,
    estado_tramite = 'COMPLETADO',
    updated_at = NOW()
FROM public."GASTOS_DESPACHOS_2026" g_source
WHERE UPPER(TRIM(g_target.n_referencia)) = '1914-26'
  AND (UPPER(TRIM(g_source.n_referencia)) = '1914- 26' OR UPPER(TRIM(g_source.n_referencia)) = '1914-26 ')
  AND g_target.id <> g_source.id;

-- 3. Eliminar la fila duplicada con espacio '1914- 26'
DELETE FROM public."GASTOS_DESPACHOS_2026"
WHERE n_referencia = '1914- 26' 
   OR n_referencia = '1914-26 '
   OR n_referencia LIKE '%1914-%26%';

-- 4. Asegurar que la referencia limpia quede como COMPLETADO
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO'
WHERE UPPER(TRIM(n_referencia)) = '1914-26';

-- 5. Sincronizar la tabla complementaria control_estados_importacion
UPDATE public.control_estados_importacion c
SET 
    estado_general = g.estado_tramite,
    estado_factura = g.estado_tramite,
    estado_planilla = g.estado_tramite,
    updated_at = NOW()
FROM public."GASTOS_DESPACHOS_2026" g
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(g.n_referencia));

-- 6. Recalcular Totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
