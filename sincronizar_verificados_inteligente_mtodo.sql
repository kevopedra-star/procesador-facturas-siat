-- ==============================================================================
-- SCRIPT SQL: COMPARACIÓN INTELIGENTE DE DECLARACIONES Y ESTADO 'VERIFICADO'
-- ==============================================================================
-- Utiliza comparar_declaraciones() y comparar_guias() para contrastar automáticamente
-- el documento aduanero de la factura (ej: 5432026D2265509) contra la declaración
-- de importación (ej: DI-2026-543-2265509) y marcar el estado como 'VERIFICADO'.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_facturas_to_mtodo_fn()
RETURNS TRIGGER AS $$
DECLARE
    target_imp_id BIGINT;
    target_interno TEXT;
    rec_imp RECORD;
    rec_albo RECORD;
    rec_ip RECORD;
    rec_guias RECORD;
    rec_puertos RECORD;
    rec_otros RECORD;

    v_albo_verif TEXT;
    v_ip_verif TEXT;
    v_guias_verif TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_imp_id := OLD.importacion_id;
    ELSE
        target_imp_id := NEW.importacion_id;
    END IF;

    IF target_imp_id IS NOT NULL THEN
        SELECT id, n_referencia, n_declaracion, examen_previo, guia_embarque INTO rec_imp
        FROM public.importaciones
        WHERE id = target_imp_id;
        
        target_interno := rec_imp.n_referencia;
    END IF;

    IF target_interno IS NULL AND (TG_OP <> 'DELETE' AND NEW.registro_aduanero IS NOT NULL AND NEW.registro_aduanero <> '') THEN
        SELECT id, n_referencia, n_declaracion, examen_previo, guia_embarque INTO rec_imp
        FROM public.importaciones
        WHERE n_declaracion = NEW.registro_aduanero
           OR guia_embarque = NEW.registro_aduanero
        LIMIT 1;
        
        IF rec_imp.id IS NOT NULL THEN
            target_imp_id := rec_imp.id;
            target_interno := rec_imp.n_referencia;
        END IF;
    END IF;

    IF target_interno IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 1. ALBO / DAB
    SELECT 
        COALESCE(SUM(f.monto), 0) AS monto,
        STRING_AGG(f.n_factura, ', ') AS factura,
        MAX(f.fecha) AS fecha,
        MAX(f.codigo_qr) AS enlace,
        MAX(f.registro_aduanero) AS doc_aduanero,
        STRING_AGG(COALESCE(c.codigo, CAST(f.consecutivo AS TEXT)), ', ') AS cod
    INTO rec_albo
    FROM public.facturas f
    LEFT JOIN public.config_nits c ON c.nit = f.nit
    WHERE f.importacion_id = target_imp_id
      AND (
          UPPER(TRIM(f.tipo)) LIKE '%ALBO%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%DAB%'
      );

    -- 2. INSPECCIÓN PREVIA (IP)
    SELECT 
        COALESCE(SUM(f.monto), 0) AS monto,
        STRING_AGG(f.n_factura, ', ') AS factura,
        MAX(f.fecha) AS fecha,
        MAX(f.codigo_qr) AS enlace,
        MAX(f.registro_aduanero) AS doc_aduanero,
        STRING_AGG(COALESCE(c.codigo, CAST(f.consecutivo AS TEXT)), ', ') AS cod
    INTO rec_ip
    FROM public.facturas f
    LEFT JOIN public.config_nits c ON c.nit = f.nit
    WHERE f.importacion_id = target_imp_id
      AND (
          UPPER(TRIM(f.tipo)) LIKE '%IP%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%PREVIA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%INSPEC%'
      );

    -- 3. GUÍAS
    SELECT 
        COALESCE(SUM(f.monto), 0) AS monto,
        STRING_AGG(f.n_factura, ', ') AS factura,
        MAX(f.fecha) AS fecha,
        MAX(f.codigo_qr) AS enlace,
        MAX(f.registro_aduanero) AS doc_aduanero,
        STRING_AGG(COALESCE(c.codigo, CAST(f.consecutivo AS TEXT)), ', ') AS cod
    INTO rec_guias
    FROM public.facturas f
    LEFT JOIN public.config_nits c ON c.nit = f.nit
    WHERE f.importacion_id = target_imp_id
      AND (
          UPPER(TRIM(f.tipo)) LIKE '%GUIA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%GUÍA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%COURIER%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%EMBARQUE%'
      );

    -- 4. PUERTOS
    SELECT 
        COALESCE(SUM(f.monto), 0) AS monto,
        STRING_AGG(f.n_factura, ', ') AS factura,
        MAX(f.fecha) AS fecha,
        STRING_AGG(COALESCE(c.codigo, CAST(f.consecutivo AS TEXT)), ', ') AS cod
    INTO rec_puertos
    FROM public.facturas f
    LEFT JOIN public.config_nits c ON c.nit = f.nit
    WHERE f.importacion_id = target_imp_id
      AND (
          UPPER(TRIM(f.tipo)) LIKE '%PUERTO%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%MARITIM%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%MARÍTIM%'
      );

    -- 5. OTROS
    SELECT 
        COALESCE(SUM(f.monto), 0) AS monto,
        STRING_AGG(f.n_factura, ', ') AS factura,
        MAX(f.fecha) AS fecha,
        MAX(f.codigo_qr) AS enlace,
        STRING_AGG(COALESCE(c.codigo, CAST(f.consecutivo AS TEXT)), ', ') AS cod
    INTO rec_otros
    FROM public.facturas f
    LEFT JOIN public.config_nits c ON c.nit = f.nit
    WHERE f.importacion_id = target_imp_id
      AND NOT (
          UPPER(TRIM(f.tipo)) LIKE '%ALBO%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%DAB%' OR
          UPPER(TRIM(f.tipo)) LIKE '%IP%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%PREVIA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%INSPEC%' OR
          UPPER(TRIM(f.tipo)) LIKE '%GUIA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%GUÍA%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%COURIER%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%EMBARQUE%' OR
          UPPER(TRIM(f.tipo)) LIKE '%PUERTO%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%MARITIM%' OR 
          UPPER(TRIM(f.tipo)) LIKE '%MARÍTIM%'
      );

    -- EVALUAR VERIFICACIÓN ALBO
    IF rec_albo.monto IS NULL OR rec_albo.monto = 0 THEN
        v_albo_verif := '-';
    ELSIF public.comparar_declaraciones(rec_imp.n_declaracion, rec_albo.doc_aduanero) THEN
        v_albo_verif := 'VERIFICADO';
    ELSE
        v_albo_verif := 'NO VERIFICADO';
    END IF;

    -- EVALUAR VERIFICACIÓN IP
    IF rec_ip.monto IS NULL OR rec_ip.monto = 0 THEN
        v_ip_verif := '-';
    ELSIF rec_imp.examen_previo IS NULL OR rec_imp.examen_previo = '' OR rec_imp.examen_previo = '-' THEN
        v_ip_verif := 'SIN EXAMEN PREVIO';
    ELSIF public.comparar_declaraciones(rec_imp.examen_previo, rec_ip.doc_aduanero) OR public.comparar_declaraciones(rec_imp.n_declaracion, rec_ip.doc_aduanero) THEN
        v_ip_verif := 'VERIFICADO';
    ELSE
        v_ip_verif := 'NO VERIFICADO';
    END IF;

    -- EVALUAR VERIFICACIÓN GUÍAS
    IF rec_guias.monto IS NULL OR rec_guias.monto = 0 THEN
        v_guias_verif := '-';
    ELSIF public.comparar_guias(rec_imp.guia_embarque, rec_guias.doc_aduanero) OR public.comparar_declaraciones(rec_imp.n_declaracion, rec_guias.doc_aduanero) THEN
        v_guias_verif := 'VERIFICADO';
    ELSE
        v_guias_verif := 'NO VERIFICADO';
    END IF;

    -- Actualizar mtodo directamente con los nuevos estados de VERIFICACIÓN
    UPDATE public.mtodo SET
        albo_monto = NULLIF(rec_albo.monto, 0),
        albo_factura = rec_albo.factura,
        albo_fecha = rec_albo.fecha,
        albo_enlace = rec_albo.enlace,
        albo_n_declaracion_imp = public.transformar_declaracion(rec_imp.n_declaracion),
        albo_doc_aduanero_fac = rec_albo.doc_aduanero,
        albo_cod = rec_albo.cod,
        albo_verificado = v_albo_verif,

        ip_monto = NULLIF(rec_ip.monto, 0),
        ip_factura = rec_ip.factura,
        ip_fecha = rec_ip.fecha,
        ip_enlace = rec_ip.enlace,
        ip_examen_previo_imp = COALESCE(rec_imp.examen_previo, '-'),
        ip_doc_aduanero_fac = rec_ip.doc_aduanero,
        ip_cod = rec_ip.cod,
        ip_verificado = v_ip_verif,

        guias_monto = NULLIF(rec_guias.monto, 0),
        guias_factura = rec_guias.factura,
        guias_fecha = rec_guias.fecha,
        guias_enlace = rec_guias.enlace,
        guias_guia_embarque_imp = COALESCE(rec_imp.guia_embarque, rec_imp.n_declaracion),
        guias_ref_guia_fac = rec_guias.doc_aduanero,
        guias_cod = rec_guias.cod,
        guias_verificado = v_guias_verif,

        puertos_monto = NULLIF(rec_puertos.monto, 0),
        puertos_comprobante = rec_puertos.factura,
        puertos_fecha = rec_puertos.fecha,

        otros_monto = NULLIF(rec_otros.monto, 0),
        otros_factura = rec_otros.factura,
        otros_fecha = rec_otros.fecha,
        otros_enlace = rec_otros.enlace,
        otros_cod = rec_otros.cod,

        updated_at = NOW()
    WHERE UPPER(TRIM(interno)) = UPPER(TRIM(target_interno));

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Asegurar que el trigger esté activo en public.facturas
DROP TRIGGER IF EXISTS trigger_sync_facturas_to_mtodo ON public.facturas;
CREATE TRIGGER trigger_sync_facturas_to_mtodo
AFTER INSERT OR UPDATE OR DELETE ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public.sync_facturas_to_mtodo_fn();

-- 3. Recalcular retroactivamente TODAS las facturas para actualizar los verificado inmediatamente
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT DISTINCT importacion_id FROM public.facturas WHERE importacion_id IS NOT NULL) LOOP
        UPDATE public.facturas SET monto = monto WHERE importacion_id = r.importacion_id;
    END LOOP;
END $$;
