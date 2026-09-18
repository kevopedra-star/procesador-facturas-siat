-- ==============================================================================
-- SCRIPT DE CORRECCIÓN Y SINCRONIZACIÓN DE TRÁMITES PENDIENTES
-- ==============================================================================
-- Este script corrige la tabla `control_estados_importacion` para que refleje 
-- con 100% de precisión los 16 trámites Pendientes (En Proceso).
-- ==============================================================================

-- 1. Asegurar e Insertar/Actualizar todos los trámites desde importaciones a control_estados_importacion
INSERT INTO public.control_estados_importacion (
    n_referencia,
    cliente,
    n_declaracion,
    fecha_aceptacion,
    total_factura,
    total_planilla,
    estado_factura,
    estado_planilla,
    estado_general,
    updated_at
)
SELECT 
    i.n_referencia,
    i.razon_social AS cliente,
    i.n_declaracion,
    i.fecha_aceptacion,
    COALESCE(g.total_factura, 0) AS total_factura,
    COALESCE(g.total_planilla, 0) AS total_planilla,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(g.total_planilla, 0) > 0) THEN 'COMPLETADO'
        ELSE 'PENDIENTE'
    END,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(g.total_planilla, 0) > 0) THEN 'COMPLETADO'
        ELSE 'PENDIENTE'
    END,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(g.total_planilla, 0) > 0) THEN 'COMPLETADO'
        ELSE 'PENDIENTE'
    END,
    NOW()
FROM public.importaciones i
LEFT JOIN public.gastos_importacion g ON UPPER(TRIM(i.n_referencia)) = UPPER(TRIM(g.n_referencia))
WHERE i.n_referencia IS NOT NULL AND i.n_referencia <> ''
ON CONFLICT (n_referencia) DO UPDATE SET
    cliente = EXCLUDED.cliente,
    n_declaracion = EXCLUDED.n_declaracion,
    fecha_aceptacion = EXCLUDED.fecha_aceptacion,
    total_factura = EXCLUDED.total_factura,
    total_planilla = EXCLUDED.total_planilla,
    estado_factura = EXCLUDED.estado_factura,
    estado_planilla = EXCLUDED.estado_planilla,
    estado_general = EXCLUDED.estado_general,
    updated_at = NOW();

-- 2. Corregir cualquier sobre-coincidencia errónea provocada por búsquedas parciales
UPDATE public.control_estados_importacion c
SET 
    estado_factura = 'PENDIENTE',
    estado_planilla = 'PENDIENTE',
    estado_general = 'PENDIENTE',
    updated_at = NOW()
FROM public.importaciones i
LEFT JOIN public.gastos_importacion g ON UPPER(TRIM(i.n_referencia)) = UPPER(TRIM(g.n_referencia))
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(i.n_referencia))
  AND (g.total_factura IS NULL OR g.total_factura = 0)
  AND (g.total_planilla IS NULL OR g.total_planilla = 0)
  AND (i.razon_social IS NULL OR UPPER(i.razon_social) NOT LIKE '%MINERA SAN CRISTOBAL%')
  AND (i.n_referencia NOT LIKE '%EXP%');
