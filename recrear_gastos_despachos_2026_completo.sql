-- ==============================================================================
-- SCRIPT CORREGIDO: LIMPIEZA DE DUPLICADOS Y SINCRONIZACIÓN AUTOMÁTICA
-- ==============================================================================
-- Este script elimina duplicados previos en GASTOS_DESPACHOS_2026 y activa 
-- la sincronización por N° Declaración O N° Referencia sin errores de llave única.
-- ==============================================================================

-- 1. Eliminar filas duplicadas anteriores en GASTOS_DESPACHOS_2026 manteniendo la más reciente
DELETE FROM public."GASTOS_DESPACHOS_2026" g1
WHERE EXISTS (
    SELECT 1 FROM public."GASTOS_DESPACHOS_2026" g2
    WHERE g2.id <> g1.id
      AND g2.created_at > g1.created_at
      AND (
          (g1.n_declaracion IS NOT NULL AND g1.n_declaracion <> '' AND UPPER(TRIM(g1.n_declaracion)) = UPPER(TRIM(g2.n_declaracion)))
          OR (g1.n_referencia IS NOT NULL AND g1.n_referencia <> '' AND UPPER(TRIM(g1.n_referencia)) = UPPER(TRIM(g2.n_referencia)))
      )
);

-- 2. Crear / Reemplazar la función trigger de sincronización inteligente
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    ref_val TEXT;
    decl_val TEXT;
    target_id UUID;
    rec_imp RECORD;
    rec_gasto RECORD;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        ref_val := UPPER(TRIM(OLD.n_referencia));
        decl_val := UPPER(TRIM(OLD.n_declaracion));
        DELETE FROM public."GASTOS_DESPACHOS_2026"
        WHERE (n_referencia IS NOT NULL AND ref_val IS NOT NULL AND UPPER(TRIM(n_referencia)) = ref_val)
           OR (n_declaracion IS NOT NULL AND decl_val IS NOT NULL AND UPPER(TRIM(n_declaracion)) = decl_val);
        RETURN OLD;
    END IF;

    ref_val := UPPER(TRIM(NEW.n_referencia));
    decl_val := UPPER(TRIM(NEW.n_declaracion));

    -- 1. Buscar registro origen en importaciones por DIM o Referencia
    SELECT * INTO rec_imp
    FROM public.importaciones
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- 2. Buscar registro origen en gastos_importacion por DIM o Referencia
    SELECT * INTO rec_gasto
    FROM public.gastos_importacion
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- 3. Identificar la fila existente en GASTOS_DESPACHOS_2026
    SELECT id INTO target_id
    FROM public."GASTOS_DESPACHOS_2026"
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- 4. Actualizar o Insertar con manejo de conflicto
    IF target_id IS NOT NULL THEN
        UPDATE public."GASTOS_DESPACHOS_2026" SET
            n_referencia = COALESCE(NULLIF(ref_val, ''), rec_imp.n_referencia, rec_gasto.n_referencia, n_referencia),
            n_declaracion = COALESCE(NULLIF(decl_val, ''), rec_imp.n_declaracion, rec_gasto.n_declaracion, n_declaracion),
            fecha_aceptacion = COALESCE(rec_imp.fecha_aceptacion, fecha_aceptacion),
            fecha_factura = COALESCE(rec_gasto.fecha_factura, fecha_factura),
            razon_social = COALESCE(rec_imp.razon_social, razon_social),
            nit_importador = COALESCE(rec_imp.nit_importador, nit_importador),
            cliente_id = COALESCE(rec_imp.cliente_id, cliente_id),
            aduana = COALESCE(rec_imp.aduana, aduana),
            factura = COALESCE(rec_imp.factura, factura),
            proveedor = COALESCE(rec_imp.proveedor, proveedor),
            modalidad = COALESCE(rec_imp.modalidad, modalidad),
            pedido = COALESCE(rec_imp.pedido, pedido),
            oi = COALESCE(rec_imp.oi, oi),
            oc = COALESCE(rec_imp.oc, oc),
            guia_embarque = COALESCE(rec_imp.guia_embarque, guia_embarque),
            contenedor = COALESCE(rec_imp.contenedor, contenedor),
            peso_bruto = COALESCE(rec_imp.peso_bruto, peso_bruto),
            tipo_cambio = COALESCE(rec_imp.tipo_cambio, tipo_cambio, 6.96),
            items = COALESCE(rec_imp.items, items),
            total_cif = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_cif, '[^0-9.]', '', 'g'), '') AS NUMERIC), total_cif, 0),
            gravamen = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.gravamen, '[^0-9.]', '', 'g'), '') AS NUMERIC), gravamen, 0),
            iva = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.iva, '[^0-9.]', '', 'g'), '') AS NUMERIC), iva, 0),
            total_tributos = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_tributos, '[^0-9.]', '', 'g'), '') AS NUMERIC), total_tributos, 0),
            honorarios_agencia = COALESCE(rec_gasto.honorarios_agencia, honorarios_agencia, 0),
            total_planilla = COALESCE(rec_gasto.total_planilla, total_planilla, 0),
            updated_at = NOW()
        WHERE id = target_id;
    ELSE
        INSERT INTO public."GASTOS_DESPACHOS_2026" (
            n_referencia, n_declaracion, fecha_aceptacion, fecha_factura, razon_social, nit_importador, cliente_id, aduana, factura, proveedor, modalidad, pedido, oi, oc, guia_embarque, contenedor, peso_bruto, tipo_cambio, items, total_cif, gravamen, iva, total_tributos, honorarios_agencia, total_planilla
        ) VALUES (
            COALESCE(ref_val, rec_imp.n_referencia, rec_gasto.n_referencia, 'SIN-REF'),
            COALESCE(decl_val, rec_imp.n_declaracion, rec_gasto.n_declaracion),
            rec_imp.fecha_aceptacion, rec_gasto.fecha_factura, rec_imp.razon_social, rec_imp.nit_importador, rec_imp.cliente_id, rec_imp.aduana, rec_imp.factura, rec_imp.proveedor, rec_imp.modalidad, rec_imp.pedido, rec_imp.oi, rec_imp.oc, rec_imp.guia_embarque, rec_imp.contenedor, rec_imp.peso_bruto, COALESCE(rec_imp.tipo_cambio, 6.96), rec_imp.items,
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_cif, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.gravamen, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.iva, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_tributos, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(rec_gasto.honorarios_agencia, 0), COALESCE(rec_gasto.total_planilla, 0)
        )
        ON CONFLICT (n_referencia) DO UPDATE SET
            n_declaracion = EXCLUDED.n_declaracion,
            fecha_aceptacion = EXCLUDED.fecha_aceptacion,
            razon_social = EXCLUDED.razon_social,
            aduana = EXCLUDED.aduana,
            total_cif = EXCLUDED.total_cif,
            total_tributos = EXCLUDED.total_tributos,
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Triggers
DROP TRIGGER IF EXISTS trigger_sync_importaciones ON public.importaciones;
CREATE TRIGGER trigger_sync_importaciones
AFTER INSERT OR UPDATE OR DELETE ON public.importaciones
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_despachos_2026_fn();

DROP TRIGGER IF EXISTS trigger_sync_gastos ON public.gastos_importacion;
CREATE TRIGGER trigger_sync_gastos
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_importacion
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_despachos_2026_fn();

-- 4. Recalcular los totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
