-- ==============================================================================
-- SCRIPT SQL: AUTOMATIZACIÓN DEL ESTADO 'COMPLETADO' VS 'EN PROCESO'
-- ==============================================================================
-- Evalúa automáticamente el estado del trámite: si tiene total_factura, 
-- honorarios o total_planilla > 0, se marca automáticamente como 'COMPLETADO'.
-- ==============================================================================

-- 1. Actualizar la función trigger para gastos_importacion
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    nuevo_estado TEXT;
BEGIN
    IF (TG_TABLE_NAME = 'facturas' OR TG_TABLE_NAME = 'facturas_provisionales') THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public."GASTOS_DESPACHOS_2026"
        WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(OLD.n_referencia));
        RETURN OLD;
    END IF;

    -- Determinar el estado automáticamente
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

-- 2. Actualización masiva del estado_tramite para todos los registros existentes
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = CASE 
    WHEN (COALESCE(total_factura, 0) > 0 
       OR COALESCE(monto_total_factura, 0) > 0 
       OR COALESCE(total_factura_con_comision, 0) > 0 
       OR COALESCE(honorarios_agencia, 0) > 0 
       OR COALESCE(total_planilla, 0) > 0) THEN 'COMPLETADO'
    ELSE 'EN PROCESO'
END;

-- 3. Recalcular la tabla de totales del Dashboard
SELECT public.recalcular_totales_dashboard_2026_fn();
