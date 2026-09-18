-- ==============================================================================
-- SCRIPT SQL: SINCRONIZACIÓN EN TIEMPO REAL DESDE TABLA 'facturas' A 'mtodo'
-- ==============================================================================
-- Este script crea la función trigger que actualiza automáticamente mtodo (ALBO/DAB, IP, GUÍAS, PUERTOS, OTROS)
-- cuando se crea, edita o elimina cualquier factura en la tabla 'public.facturas'.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_facturas_to_mtodo_fn()
RETURNS TRIGGER AS $$
DECLARE
    target_imp_id BIGINT;
    target_interno TEXT;
    rec_albo RECORD;
    rec_ip RECORD;
    rec_guias RECORD;
    rec_puertos RECORD;
    rec_otros RECORD;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_imp_id := OLD.importacion_id;
    ELSE
        target_imp_id := NEW.importacion_id;
    END IF;

    -- Obtener el número interno/referencia desde importaciones
    IF target_imp_id IS NOT NULL THEN
        SELECT n_referencia INTO target_interno
        FROM public.importaciones
        WHERE id = target_imp_id;
    END IF;

    -- Búsqueda secundaria por registro aduanero si no se halló por importacion_id
    IF target_interno IS NULL AND (TG_OP <> 'DELETE' AND NEW.registro_aduanero IS NOT NULL AND NEW.registro_aduanero <> '') THEN
        SELECT n_referencia INTO target_interno
        FROM public.importaciones
        WHERE n_declaracion = NEW.registro_aduanero
           OR guia_embarque = NEW.registro_aduanero
        LIMIT 1;
    END IF;

    IF target_interno IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 1. ALBO / DAB
    SELECT 
        COALESCE(SUM(monto), 0) AS monto,
        STRING_AGG(n_factura, ', ') AS factura,
        MAX(fecha) AS fecha,
        MAX(codigo_qr) AS enlace,
        MAX(registro_aduanero) AS doc_aduanero
    INTO rec_albo
    FROM public.facturas
    WHERE importacion_id = target_imp_id
      AND UPPER(tipo) IN ('ALBO', 'DAB');

    -- 2. INSPECCIÓN PREVIA (IP)
    SELECT 
        COALESCE(SUM(monto), 0) AS monto,
        STRING_AGG(n_factura, ', ') AS factura,
        MAX(fecha) AS fecha,
        MAX(codigo_qr) AS enlace,
        MAX(registro_aduanero) AS doc_aduanero
    INTO rec_ip
    FROM public.facturas
    WHERE importacion_id = target_imp_id
      AND UPPER(tipo) IN ('IP', 'INSP PREVIA', 'INSPECCIÓN PREVIA');

    -- 3. GUÍAS
    SELECT 
        COALESCE(SUM(monto), 0) AS monto,
        STRING_AGG(n_factura, ', ') AS factura,
        MAX(fecha) AS fecha,
        MAX(codigo_qr) AS enlace,
        MAX(registro_aduanero) AS doc_aduanero
    INTO rec_guias
    FROM public.facturas
    WHERE importacion_id = target_imp_id
      AND UPPER(tipo) IN ('GUIA', 'GUIAS', 'GUÍA', 'GUÍAS');

    -- 4. PUERTOS
    SELECT 
        COALESCE(SUM(monto), 0) AS monto,
        STRING_AGG(n_factura, ', ') AS factura,
        MAX(fecha) AS fecha
    INTO rec_puertos
    FROM public.facturas
    WHERE importacion_id = target_imp_id
      AND UPPER(tipo) IN ('PUERTO', 'PUERTOS');

    -- 5. OTROS
    SELECT 
        COALESCE(SUM(monto), 0) AS monto,
        STRING_AGG(n_factura, ', ') AS factura,
        MAX(fecha) AS fecha,
        MAX(codigo_qr) AS enlace
    INTO rec_otros
    FROM public.facturas
    WHERE importacion_id = target_imp_id
      AND UPPER(tipo) NOT IN ('ALBO', 'DAB', 'IP', 'INSP PREVIA', 'INSPECCIÓN PREVIA', 'GUIA', 'GUIAS', 'GUÍA', 'GUÍAS', 'PUERTO', 'PUERTOS');

    -- Actualizar mtodo directamente para esa carpeta interna
    UPDATE public.mtodo SET
        albo_monto = NULLIF(rec_albo.monto, 0),
        albo_factura = rec_albo.factura,
        albo_fecha = rec_albo.fecha,
        albo_enlace = rec_albo.enlace,
        albo_doc_aduanero_fac = rec_albo.doc_aduanero,

        ip_monto = NULLIF(rec_ip.monto, 0),
        ip_factura = rec_ip.factura,
        ip_fecha = rec_ip.fecha,
        ip_enlace = rec_ip.enlace,
        ip_doc_aduanero_fac = rec_ip.doc_aduanero,

        guias_monto = NULLIF(rec_guias.monto, 0),
        guias_factura = rec_guias.factura,
        guias_fecha = rec_guias.fecha,
        guias_enlace = rec_guias.enlace,
        guias_ref_guia_fac = rec_guias.doc_aduanero,

        puertos_monto = NULLIF(rec_puertos.monto, 0),
        puertos_comprobante = rec_puertos.factura,
        puertos_fecha = rec_puertos.fecha,

        otros_monto = NULLIF(rec_otros.monto, 0),
        otros_factura = rec_otros.factura,
        otros_fecha = rec_otros.fecha,
        otros_enlace = rec_otros.enlace,

        updated_at = NOW()
    WHERE UPPER(TRIM(interno)) = UPPER(TRIM(target_interno));

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Asignar el trigger a la tabla 'facturas'
DROP TRIGGER IF EXISTS trigger_sync_facturas_to_mtodo ON public.facturas;
CREATE TRIGGER trigger_sync_facturas_to_mtodo
AFTER INSERT OR UPDATE OR DELETE ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public.sync_facturas_to_mtodo_fn();

-- 3. Recalcular retroactivamente todas las facturas existentes sin error de columnas
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT DISTINCT importacion_id FROM public.facturas WHERE importacion_id IS NOT NULL) LOOP
        UPDATE public.facturas SET monto = monto WHERE importacion_id = r.importacion_id;
    END LOOP;
END $$;
