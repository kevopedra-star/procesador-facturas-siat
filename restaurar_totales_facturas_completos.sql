-- ==============================================================================
-- SCRIPT SQL: RESTAURACIÓN DEFINITIVA DE FACTURAS Y TOTALES DEL DASHBOARD
-- ==============================================================================
-- 1. Sincroniza los montos acumulados de facturas (ALBO, IP, GUÍAS, PUERTOS, OTROS)
--    desde 'public.mtodo' y 'public.facturas' hacia 'GASTOS_DESPACHOS_2026'.
-- 2. Asegura que al subir un Excel de Gastos NO se sobreescriban con $0 las facturas.
-- 3. Recalcula los totales físicos para devolver TOTAL FACTURAS GENERAL a Bs 4.806.924,72.
-- ==============================================================================

-- 1. Actualizar GASTOS_DESPACHOS_2026 unificando montos de mtodo y facturas
UPDATE public."GASTOS_DESPACHOS_2026" g SET
    total_factura = GREATEST(
        COALESCE(g.total_factura, 0),
        COALESCE(g.monto_total_factura, 0),
        COALESCE(g.total_factura_con_comision, 0),
        COALESCE((
            SELECT SUM(COALESCE(m.albo_monto,0) + COALESCE(m.ip_monto,0) + COALESCE(m.guias_monto,0) + COALESCE(m.puertos_monto,0) + COALESCE(m.otros_monto,0))
            FROM public.mtodo m
            WHERE UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia))
        ), 0),
        COALESCE((
            SELECT SUM(f.monto)
            FROM public.facturas f
            JOIN public.importaciones imp ON imp.id = f.importacion_id
            WHERE UPPER(TRIM(imp.n_referencia)) = UPPER(TRIM(g.n_referencia))
        ), 0)
    ),
    monto_total_factura = GREATEST(
        COALESCE(g.total_factura, 0),
        COALESCE(g.monto_total_factura, 0),
        COALESCE(g.total_factura_con_comision, 0),
        COALESCE((
            SELECT SUM(COALESCE(m.albo_monto,0) + COALESCE(m.ip_monto,0) + COALESCE(m.guias_monto,0) + COALESCE(m.puertos_monto,0) + COALESCE(m.otros_monto,0))
            FROM public.mtodo m
            WHERE UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia))
        ), 0),
        COALESCE((
            SELECT SUM(f.monto)
            FROM public.facturas f
            JOIN public.importaciones imp ON imp.id = f.importacion_id
            WHERE UPPER(TRIM(imp.n_referencia)) = UPPER(TRIM(g.n_referencia))
        ), 0)
    ),
    total_factura_con_comision = GREATEST(
        COALESCE(g.total_factura, 0),
        COALESCE(g.monto_total_factura, 0),
        COALESCE(g.total_factura_con_comision, 0),
        COALESCE((
            SELECT SUM(COALESCE(m.albo_monto,0) + COALESCE(m.ip_monto,0) + COALESCE(m.guias_monto,0) + COALESCE(m.puertos_monto,0) + COALESCE(m.otros_monto,0))
            FROM public.mtodo m
            WHERE UPPER(TRIM(m.interno)) = UPPER(TRIM(g.n_referencia))
        ), 0),
        COALESCE((
            SELECT SUM(f.monto)
            FROM public.facturas f
            JOIN public.importaciones imp ON imp.id = f.importacion_id
            WHERE UPPER(TRIM(imp.n_referencia)) = UPPER(TRIM(g.n_referencia))
        ), 0)
    ),
    estado_tramite = CASE 
        WHEN GREATEST(
            COALESCE(g.total_factura, 0),
            COALESCE((SELECT SUM(f.monto) FROM public.facturas f JOIN public.importaciones imp ON imp.id = f.importacion_id WHERE UPPER(TRIM(imp.n_referencia)) = UPPER(TRIM(g.n_referencia)))),
            COALESCE(g.total_planilla, 0)
        ) > 0 THEN 'COMPLETADO'
        ELSE g.estado_tramite
    END;

-- 2. Proteger el trigger sync_gastos_despachos_2026_fn para evitar sobreescritura por ceros
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    nuevo_estado TEXT;
    monto_fac_final NUMERIC(15,2);
BEGIN
    IF (TG_TABLE_NAME <> 'gastos_importacion') THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public."GASTOS_DESPACHOS_2026"
        WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(OLD.n_referencia));
        RETURN OLD;
    END IF;

    -- Preservar montos de facturas previamente registrados
    SELECT GREATEST(
        COALESCE(NEW.total_factura, 0),
        COALESCE(g.total_factura, 0),
        COALESCE((SELECT SUM(monto) FROM public.facturas f JOIN public.importaciones imp ON imp.id = f.importacion_id WHERE UPPER(TRIM(imp.n_referencia)) = UPPER(TRIM(NEW.n_referencia)))
    ) INTO monto_fac_final
    FROM public."GASTOS_DESPACHOS_2026" g
    WHERE UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(NEW.n_referencia));

    monto_fac_final := COALESCE(monto_fac_final, NEW.total_factura, 0);

    IF (monto_fac_final > 0 OR COALESCE(NEW.honorarios_agencia, 0) > 0 OR COALESCE(NEW.total_planilla, 0) > 0) THEN
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
        monto_fac_final,
        monto_fac_final,
        monto_fac_final,
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
        total_factura = GREATEST(EXCLUDED.total_factura, public."GASTOS_DESPACHOS_2026".total_factura),
        monto_total_factura = GREATEST(EXCLUDED.total_factura, public."GASTOS_DESPACHOS_2026".monto_total_factura),
        total_factura_con_comision = GREATEST(EXCLUDED.total_factura, public."GASTOS_DESPACHOS_2026".total_factura_con_comision),
        total_planilla = EXCLUDED.total_planilla,
        estado_tramite = CASE 
            WHEN (GREATEST(EXCLUDED.total_factura, public."GASTOS_DESPACHOS_2026".total_factura) > 0 OR EXCLUDED.honorarios_agencia > 0 OR EXCLUDED.total_planilla > 0) THEN 'COMPLETADO'
            ELSE public."GASTOS_DESPACHOS_2026".estado_tramite
        END,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Actualizar también cuando se guarden facturas en mtodo / facturas
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
    v_total_fac NUMERIC(15,2);
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

    IF target_interno IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT COALESCE(SUM(f.monto), 0) INTO rec_albo FROM public.facturas f WHERE f.importacion_id = target_imp_id AND (UPPER(TRIM(f.tipo)) LIKE '%ALBO%' OR UPPER(TRIM(f.tipo)) LIKE '%DAB%');
    SELECT COALESCE(SUM(f.monto), 0) INTO rec_ip FROM public.facturas f WHERE f.importacion_id = target_imp_id AND (UPPER(TRIM(f.tipo)) LIKE '%IP%' OR UPPER(TRIM(f.tipo)) LIKE '%PREVIA%' OR UPPER(TRIM(f.tipo)) LIKE '%INSPEC%');
    SELECT COALESCE(SUM(f.monto), 0) INTO rec_guias FROM public.facturas f WHERE f.importacion_id = target_imp_id AND (UPPER(TRIM(f.tipo)) LIKE '%GUIA%' OR UPPER(TRIM(f.tipo)) LIKE '%GUÍA%' OR UPPER(TRIM(f.tipo)) LIKE '%COURIER%' OR UPPER(TRIM(f.tipo)) LIKE '%EMBARQUE%');
    SELECT COALESCE(SUM(f.monto), 0) INTO rec_puertos FROM public.facturas f WHERE f.importacion_id = target_imp_id AND (UPPER(TRIM(f.tipo)) LIKE '%PUERTO%' OR UPPER(TRIM(f.tipo)) LIKE '%MARITIM%' OR UPPER(TRIM(f.tipo)) LIKE '%MARÍTIM%');
    SELECT COALESCE(SUM(f.monto), 0) INTO rec_otros FROM public.facturas f WHERE f.importacion_id = target_imp_id AND NOT (UPPER(TRIM(f.tipo)) LIKE '%ALBO%' OR UPPER(TRIM(f.tipo)) LIKE '%DAB%' OR UPPER(TRIM(f.tipo)) LIKE '%IP%' OR UPPER(TRIM(f.tipo)) LIKE '%PREVIA%' OR UPPER(TRIM(f.tipo)) LIKE '%INSPEC%' OR UPPER(TRIM(f.tipo)) LIKE '%GUIA%' OR UPPER(TRIM(f.tipo)) LIKE '%GUÍA%' OR UPPER(TRIM(f.tipo)) LIKE '%COURIER%' OR UPPER(TRIM(f.tipo)) LIKE '%EMBARQUE%' OR UPPER(TRIM(f.tipo)) LIKE '%PUERTO%' OR UPPER(TRIM(f.tipo)) LIKE '%MARITIM%' OR UPPER(TRIM(f.tipo)) LIKE '%MARÍTIM%');

    v_total_fac := rec_albo.coalesce + rec_ip.coalesce + rec_guias.coalesce + rec_puertos.coalesce + rec_otros.coalesce;

    -- Sincronizar hacia GASTOS_DESPACHOS_2026
    UPDATE public."GASTOS_DESPACHOS_2026" SET
        total_factura = GREATEST(COALESCE(total_factura, 0), v_total_fac),
        monto_total_factura = GREATEST(COALESCE(monto_total_factura, 0), v_total_fac),
        total_factura_con_comision = GREATEST(COALESCE(total_factura_con_comision, 0), v_total_fac),
        estado_tramite = CASE 
            WHEN v_total_fac > 0 OR COALESCE(total_planilla, 0) > 0 THEN 'COMPLETADO'
            ELSE estado_tramite
        END,
        updated_at = NOW()
    WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(target_interno));

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Recalcular la tabla física de totales del dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
