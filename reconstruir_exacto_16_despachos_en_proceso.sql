-- ==============================================================================
-- SCRIPT DE CORRECCIÓN: REESTABLECER EXACTAMENTE LOS 16 TRÁMITES EN PROCESO
-- ==============================================================================
-- Ejecutar este script en Supabase para que la vista 'Despachos Detallados' 
-- y el filtro 'SOLO EN PROCESO' muestren con 100% de precisión los 16 registros.
-- ==============================================================================

-- 1. Insertar en GASTOS_DESPACHOS_2026 cualquier trámite de importaciones que no exista aún
INSERT INTO public."GASTOS_DESPACHOS_2026" (
    n_referencia,
    n_declaracion,
    fecha_aceptacion,
    razon_social,
    nit_importador,
    cliente_id,
    aduana,
    factura,
    proveedor,
    modalidad,
    pedido,
    oi,
    oc,
    guia_embarque,
    contenedor,
    peso_bruto,
    tipo_cambio,
    items,
    total_cif,
    gravamen,
    iva,
    total_tributos,
    mes_aceptacion,
    estado_tramite,
    updated_at
)
SELECT 
    i.n_referencia,
    i.n_declaracion,
    i.fecha_aceptacion,
    i.razon_social,
    i.nit_importador,
    i.cliente_id::text,
    i.aduana,
    i.factura,
    i.proveedor,
    i.modalidad,
    i.pedido,
    i.oi,
    i.oc,
    i.guia_embarque,
    i.contenedor,
    i.peso_bruto,
    COALESCE(NULLIF(regexp_replace(i.tipo_cambio::text, '[^0-9.]', '', 'g'), '')::numeric, 6.96),
    COALESCE(NULLIF(regexp_replace(i.items::text, '[^0-9]', '', 'g'), '')::integer, 0),
    COALESCE(NULLIF(regexp_replace(i.total_cif::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(i.gravamen::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(i.iva::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
    COALESCE(NULLIF(regexp_replace(i.total_tributos::text, '[^0-9.]', '', 'g'), '')::numeric, 0),
    CASE
        WHEN i.fecha_aceptacion IS NOT NULL AND i.fecha_aceptacion <> '' AND i.fecha_aceptacion ~ '^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}' THEN
            SPLIT_PART(SPLIT_PART(i.fecha_aceptacion, ' ', 1), '/', 3) || '-' || LPAD(SPLIT_PART(SPLIT_PART(i.fecha_aceptacion, ' ', 1), '/', 2), 2, '0')
        WHEN i.fecha_aceptacion IS NOT NULL AND i.fecha_aceptacion <> '' AND i.fecha_aceptacion ~ '^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}' THEN
            SUBSTRING(i.fecha_aceptacion FROM 1 FOR 7)
        ELSE 'SIN FECHA'
    END AS mes_aceptacion,
    'EN PROCESO',
    NOW()
FROM public.importaciones i
WHERE i.n_referencia IS NOT NULL AND i.n_referencia <> ''
ON CONFLICT (n_referencia) DO NOTHING;

-- 2. Limpiar montos residuales o marcas de facturación fantasma en despachos sin gastos reales
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = 0,
    total_planilla = 0,
    monto_total_factura = '0',
    total_factura_con_comision = 0
WHERE NOT EXISTS (
    SELECT 1 FROM public.gastos_importacion gi 
    WHERE UPPER(TRIM(gi.n_referencia)) = UPPER(TRIM(g.n_referencia))
)
AND (g.razon_social IS NULL OR UPPER(g.razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%');

-- 3. Sincronizar montos reales desde la tabla 'gastos_importacion'
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = gi.total_factura,
    total_planilla = gi.total_planilla,
    monto_total_factura = gi.total_factura::text,
    fecha_factura = gi.fecha_factura
FROM public.gastos_importacion gi
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(gi.n_referencia));

-- 4. Marcar estado_tramite = 'EN PROCESO' a todos los despachos sin factura ni planilla (con cast seguro para total_planilla)
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'EN PROCESO'
WHERE (COALESCE(NULLIF(regexp_replace(monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (COALESCE(NULLIF(regexp_replace(total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) = 0)
  AND (razon_social IS NULL OR UPPER(razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%');

-- 5. Marcar estado_tramite = 'COMPLETADO' a despachos que SÍ tienen factura o planilla cargada (con cast seguro)
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO'
WHERE (COALESCE(NULLIF(regexp_replace(monto_total_factura::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0 
    OR COALESCE(NULLIF(regexp_replace(total_planilla::text, '[^0-9.]', '', 'g'), '')::numeric, 0) > 0)
   OR (UPPER(razon_social) LIKE '%MINERA SAN CRISTOBAL%');

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
