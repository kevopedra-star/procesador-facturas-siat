-- ==============================================================================
-- SCRIPT SQL DEFINITIVO: RESTAURACIÓN Y SINCRONIZACIÓN FACTURAS -> MTODO
-- ==============================================================================

-- 1. Eliminar triggers accidentales en 'mtodo' y 'facturas'
DROP TRIGGER IF EXISTS trigger_sync_gastos ON public.mtodo;
DROP TRIGGER IF EXISTS trigger_sync_importaciones ON public.mtodo;
DROP TRIGGER IF EXISTS trigger_sync_facturas ON public.mtodo;

-- 2. Blindar la función sync_gastos_despachos_2026_fn para que SOLO actúe en 'gastos_importacion'
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    nuevo_estado TEXT;
BEGIN
    -- Si la función es llamada por cualquier otra tabla que no sea gastos_importacion, salir pacíficamente
    IF (TG_TABLE_NAME <> 'gastos_importacion') THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public."GASTOS_DESPACHOS_2026"
        WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(OLD.n_referencia));
        RETURN OLD;
    END IF;

    IF (COALESCE(NEW.total_factura, 0) > 0 OR COALESCE(NEW.honorarios_agencia, 0) > 0 OR COALESCE(NEW.total_planilla, 0) > 0) THEN
        nuevo_estado := 'COMPLETADO';
    ELSE
        nuevo_estado := 'EN PROCESO';
    END IF;

    INSERT INTO public."GASTOS_DESPACHOS_2026" (
        n_referencia,
        n_declaracion,
        fecha_factura,
        honorarios_agencia,
        carpeta_p_archivo,
        gastos_en_despacho,
        fotocopias_legalizadas,
        verificacion_y_etiquetado,
        regularizacion_desp_anticipad,
        items_declarados_en_dim_y_dav,
        despacho_aduana_frontera,
        servicio_logistico,
        formulario_dam,
        otros_servicios,
        formulario_ritex,
        serv_de_tram_senasag_unalab,
        ingreso_y_recojo_tram_senasag,
        total_factura,
        monto_total_factura,
        total_factura_con_comision,
        total_planilla,
        estado_tramite,
        updated_at
    ) VALUES (
        UPPER(TRIM(NEW.n_referencia)),
        NEW.n_declaracion,
        NEW.fecha_factura,
        COALESCE(NEW.honorarios_agencia, 0),
        COALESCE(NEW.carpeta_p_archivo, 0),
        COALESCE(NEW.gastos_en_despacho, 0),
        COALESCE(NEW.fotocopias_legalizadas, 0),
        COALESCE(NEW.verificacion_y_etiquetado, 0),
        COALESCE(NEW.regularizacion_desp_anticipad, 0),
        COALESCE(NEW.items_declarados_en_dim_y_dav, 0),
        COALESCE(NEW.despacho_aduana_frontera, 0),
        COALESCE(NEW.servicio_logistico, 0),
        COALESCE(NEW.formulario_dam, 0),
        COALESCE(NEW.otros_servicios, 0),
        COALESCE(NEW.formulario_ritex, 0),
        COALESCE(NEW.serv_de_tram_senasag_unalab, 0),
        COALESCE(NEW.ingreso_y_recojo_tram_senasag, 0),
        COALESCE(NEW.total_factura, 0),
        COALESCE(NEW.total_factura, 0),
        COALESCE(NEW.total_factura, 0),
        COALESCE(NEW.total_planilla, 0),
        nuevo_estado,
        NOW()
    )
    ON CONFLICT (n_referencia) DO UPDATE SET
        n_declaracion = COALESCE(EXCLUDED.n_declaracion, public."GASTOS_DESPACHOS_2026".n_declaracion),
        fecha_factura = COALESCE(EXCLUDED.fecha_factura, public."GASTOS_DESPACHOS_2026".fecha_factura),
        honorarios_agencia = EXCLUDED.honorarios_agencia,
        carpeta_p_archivo = EXCLUDED.carpeta_p_archivo,
        gastos_en_despacho = EXCLUDED.gastos_en_despacho,
        fotocopias_legalizadas = EXCLUDED.fotocopias_legalizadas,
        verificacion_y_etiquetado = EXCLUDED.verificacion_y_etiquetado,
        regularizacion_desp_anticipad = EXCLUDED.regularizacion_desp_anticipad,
        items_declarados_en_dim_y_dav = EXCLUDED.items_declarados_en_dim_y_dav,
        despacho_aduana_frontera = EXCLUDED.despacho_aduana_frontera,
        servicio_logistico = EXCLUDED.servicio_logistico,
        formulario_dam = EXCLUDED.formulario_dam,
        otros_servicios = EXCLUDED.otros_servicios,
        formulario_ritex = EXCLUDED.formulario_ritex,
        serv_de_tram_senasag_unalab = EXCLUDED.serv_de_tram_senasag_unalab,
        ingreso_y_recojo_tram_senasag = EXCLUDED.ingreso_y_recojo_tram_senasag,
        total_factura = EXCLUDED.total_factura,
        monto_total_factura = EXCLUDED.total_factura,
        total_factura_con_comision = EXCLUDED.total_factura,
        total_planilla = EXCLUDED.total_planilla,
        estado_tramite = CASE 
            WHEN (EXCLUDED.total_factura > 0 OR EXCLUDED.honorarios_agencia > 0 OR EXCLUDED.total_planilla > 0) THEN 'COMPLETADO'
            ELSE public."GASTOS_DESPACHOS_2026".estado_tramite
        END,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Función y Trigger de Sincronización Facturas -> mtodo
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

    IF target_imp_id IS NOT NULL THEN
        SELECT n_referencia INTO target_interno
        FROM public.importaciones
        WHERE id = target_imp_id;
    END IF;

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

    -- Actualizar mtodo directamente
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

-- 4. Asignar el trigger a la tabla 'facturas'
DROP TRIGGER IF EXISTS trigger_sync_facturas_to_mtodo ON public.facturas;
CREATE TRIGGER trigger_sync_facturas_to_mtodo
AFTER INSERT OR UPDATE OR DELETE ON public.facturas
FOR EACH ROW EXECUTE FUNCTION public.sync_facturas_to_mtodo_fn();

-- 5. Recalcular retroactivamente todas las facturas existentes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT DISTINCT importacion_id FROM public.facturas WHERE importacion_id IS NOT NULL) LOOP
        UPDATE public.facturas SET monto = monto WHERE importacion_id = r.importacion_id;
    END LOOP;
END $$;
