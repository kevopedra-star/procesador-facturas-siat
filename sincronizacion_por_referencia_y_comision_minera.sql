-- ==============================================================================
-- SCRIPT DE SINCRONIZACIÓN DEFINITIVO (INCLUYE EVALUACIÓN DE NÚMERO DE FACTURA TEXTO)
-- ==============================================================================
-- Explicación:
-- Trámites como `1914-26` tienen registrado el número de factura comercial en el campo `factura`
-- (ej. 'F006-000635').
-- Este script evalúa tanto el número de factura en texto como los montos numéricos, marcando
-- el trámite como COMPLETADO si existe número de factura registrado.
-- ==============================================================================

-- 1. Sincronizar montos desde 'gastos_importacion' por n_referencia o n_declaracion
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = gi.total_factura,
    total_planilla = gi.total_planilla,
    monto_total_factura = gi.total_factura::text,
    fecha_factura = gi.fecha_factura
FROM public.gastos_importacion gi
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(gi.n_referencia))
   OR (g.n_declaracion IS NOT NULL AND gi.n_declaracion IS NOT NULL AND UPPER(TRIM(gi.n_declaracion)) = UPPER(TRIM(g.n_declaracion)));

-- 2. Sincronizar montos desde 'reporte_unificado_data' (incluye COFAR 1914-26 por dim_id)
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
LEFT JOIN public.importaciones i ON ru.dim_id = i.id
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(ru.n_referencia))
   OR (i.n_referencia IS NOT NULL AND UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(i.n_referencia)));

-- 3. Sincronizar montos desde 'mtodo'
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    monto_total_factura = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )::text,
    total_factura_con_comision = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.total_factura_con_comision::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
        COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    ),
    total_planilla = GREATEST(
        COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0), 
        COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0)
    )
FROM public.mtodo m
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(m.interno))
   OR (g.n_declaracion IS NOT NULL AND m.dim_n_ro IS NOT NULL AND UPPER(TRIM(g.n_declaracion)) = UPPER(TRIM(m.dim_n_ro)));

-- 4. Marcar inicialmente todos como 'EN PROCESO'
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'EN PROCESO';

-- 5. Marcar como 'COMPLETADO' evaluando: Número de factura texto, montos numéricos y fuentes externas
UPDATE public."GASTOS_DESPACHOS_2026" g
SET estado_tramite = 'COMPLETADO'
WHERE 
    -- A. Minera San Cristóbal o Exportaciones siempre COMPLETADO
    (UPPER(COALESCE(g.razon_social, '')) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(COALESCE(g.n_referencia, '')) LIKE '%EXP%')

    -- B. TIENE NÚMERO DE FACTURA REGISTRADO EN TEXTO (ej: 'F006-000635' como el de 1914-26)
    OR (g.factura IS NOT NULL AND TRIM(g.factura) <> '' AND TRIM(g.factura) <> '-' AND UPPER(TRIM(g.factura)) <> 'NULL')

    -- C. Montos cargados en GASTOS_DESPACHOS_2026 (monto factura o planilla > 0)
    OR (COALESCE(NULLIF(regexp_replace(g.monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
    OR (COALESCE(NULLIF(regexp_replace(g.total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
    OR (COALESCE(NULLIF(regexp_replace(g.total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)

    -- D. Existe en gastos_importacion por n_referencia o n_declaracion
    OR EXISTS (
        SELECT 1 FROM public.gastos_importacion gi
        WHERE (UPPER(TRIM(gi.n_referencia)) = UPPER(TRIM(g.n_referencia)) OR (g.n_declaracion IS NOT NULL AND gi.n_declaracion IS NOT NULL AND UPPER(TRIM(gi.n_declaracion)) = UPPER(TRIM(g.n_declaracion))))
          AND (
              COALESCE(gi.total_factura, 0) > 0 
              OR COALESCE(gi.total_planilla, 0) > 0 
              OR COALESCE(gi.honorarios_agencia, 0) > 0
              OR COALESCE(gi.gastos_en_despacho, 0) > 0
          )
    )

    -- E. Existe en reporte_unificado_data por n_referencia O por dim_id
    OR EXISTS (
        SELECT 1 FROM public.reporte_unificado_data ru
        LEFT JOIN public.importaciones i ON ru.dim_id = i.id
        WHERE (UPPER(TRIM(ru.n_referencia)) = UPPER(TRIM(g.n_referencia)) OR (i.n_referencia IS NOT NULL AND UPPER(TRIM(i.n_referencia)) = UPPER(TRIM(g.n_referencia))))
          AND (
              COALESCE(NULLIF(regexp_replace(ru.total_gastos_logistica::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
              OR COALESCE(NULLIF(regexp_replace(ru.comision::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0
              OR COALESCE(NULLIF(regexp_replace(ru.gastos_puerto::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0
              OR COALESCE(NULLIF(regexp_replace(ru.otros_gastos::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0
          )
    )

    -- F. Existe en mtodo por n_referencia o n_declaracion
    OR EXISTS (
        SELECT 1 FROM public.mtodo m
        WHERE (UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia)) OR (g.n_declaracion IS NOT NULL AND m.dim_n_ro IS NOT NULL AND UPPER(TRIM(m.dim_n_ro)) = UPPER(TRIM(g.n_declaracion))))
          AND (
              COALESCE(NULLIF(regexp_replace(m.debito_excel::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
              OR COALESCE(NULLIF(regexp_replace(m.comision_bob::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0
          )
    )

    -- G. Existe en facturas por n_declaracion (registro_aduanero / doc_aduanero)
    OR EXISTS (
        SELECT 1 FROM public.facturas f
        WHERE (g.n_declaracion IS NOT NULL AND f.registro_aduanero IS NOT NULL AND UPPER(TRIM(f.registro_aduanero)) LIKE '%' || UPPER(TRIM(g.n_declaracion)) || '%')
           OR (g.n_declaracion IS NOT NULL AND f.doc_aduanero IS NOT NULL AND UPPER(TRIM(f.doc_aduanero)) LIKE '%' || UPPER(TRIM(g.n_declaracion)) || '%')
    );

-- 6. Sincronizar control_estados_importacion por n_referencia
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
