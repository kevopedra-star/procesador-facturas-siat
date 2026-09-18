-- SCRIPT DEFINITIVO Y BLINDADO (CREA ÍNDICE ÚNICO Y SINCRONIZA LOS 11 DESPACHOS)
-- Resuelve el error 42P10 (there is no unique constraint matching ON CONFLICT)

-- 1. Eliminar duplicados en GASTOS_DESPACHOS_2026 si existieran
DELETE FROM public."GASTOS_DESPACHOS_2026" a
USING public."GASTOS_DESPACHOS_2026" b
WHERE a.id < b.id 
  AND UPPER(TRIM(a.n_referencia)) = UPPER(TRIM(b.n_referencia))
  AND a.n_referencia IS NOT NULL AND a.n_referencia <> '';

-- 2. Crear el índice único requerido por PostgreSQL para ON CONFLICT (n_referencia)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_desp_n_ref ON public."GASTOS_DESPACHOS_2026" (n_referencia);

-- 3. Insertar / Actualizar despachos desde la tabla 'importaciones'
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
    'EN PROCESO' AS estado_tramite,
    NOW()
FROM public.importaciones i
WHERE i.n_referencia IS NOT NULL AND i.n_referencia <> ''
ON CONFLICT (n_referencia) DO UPDATE SET
    n_declaracion = EXCLUDED.n_declaracion,
    fecha_aceptacion = EXCLUDED.fecha_aceptacion,
    razon_social = EXCLUDED.razon_social,
    mes_aceptacion = EXCLUDED.mes_aceptacion,
    updated_at = NOW();

-- 4. Vincular montos desde 'gastos_importacion'
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    total_factura = gi.total_factura,
    total_planilla = gi.total_planilla,
    monto_total_factura = gi.total_factura::text,
    fecha_factura = gi.fecha_factura
FROM public.gastos_importacion gi
WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(gi.n_referencia));

-- 5. Marcar como 'EN PROCESO' todos los despachos con Factura = 0 y Planilla = 0
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'EN PROCESO'
WHERE (COALESCE(NULLIF(monto_total_factura, '')::numeric, 0) = 0)
  AND (COALESCE(NULLIF(total_planilla::text, '')::numeric, 0) = 0)
  AND (razon_social IS NULL OR UPPER(razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%');

-- 6. Marcar como 'COMPLETADO' los despachos que ya tengan factura o planilla mayor a 0
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO'
WHERE (COALESCE(NULLIF(monto_total_factura, '')::numeric, 0) > 0 OR COALESCE(NULLIF(total_planilla::text, '')::numeric, 0) > 0);

-- 7. Recalcular Totales de la vista de resumen del Dashboard
SELECT recalcular_totales_dashboard_2026_fn();
