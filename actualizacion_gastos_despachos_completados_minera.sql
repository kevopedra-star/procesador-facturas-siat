-- ============================================================================
-- SCRIPT DE ACTUALIZACION DE VISTAS Y TABLAS PARA DASHBOARD 2026 EN SUPABASE
-- Creado: 2026-08-11
-- ============================================================================

-- 1. ASEGURAR QUE LA COLUMNA mes_aceptacion EXISTE EN GASTOS_DESPACHOS_2026
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'GASTOS_DESPACHOS_2026' 
        AND column_name = 'mes_aceptacion'
    ) THEN
        ALTER TABLE public."GASTOS_DESPACHOS_2026" ADD COLUMN mes_aceptacion TEXT;
    END IF;
END $$;

-- 2. FUNCIÓN TRIGGER PRINCIPAL PARA MANTENER GASTOS_DESPACHOS_2026 Y TOTALES_CLIENTES_DASHBOARD_2026
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    target_ref TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_ref := OLD.n_referencia;
    ELSE
        target_ref := NEW.n_referencia;
    END IF;

    IF target_ref IS NULL THEN
        RETURN NULL;
    END IF;

    -- ELIMINAR EL REGISTRO ANTERIOR PARA INSERTAR EL ACTUALIZADO
    DELETE FROM public."GASTOS_DESPACHOS_2026" WHERE n_referencia = target_ref;

    -- REINSERTAR EL REGISTRO CON EL MES DE FACTURACIÓN
    INSERT INTO public."GASTOS_DESPACHOS_2026" (
        n_referencia,
        n_declaracion,
        fecha_aceptacion,
        fecha_factura,
        mes_aceptacion,
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
        gravamen_arancelario,
        impuesto_al_valor_agregado,
        imp_al_consumo_espcifico,
        imp_esp_a_los_hidrocarburos,
        formulario_digital,
        imp_al_con_espec_al_deporte,
        levantamiento_de_abandono,
        cam_ind_y_com,
        recojo_guia,
        emision_certificado,
        transporte_local,
        almacenaje_dab,
        gastos_puerto,
        senasag,
        agemed,
        almacenaje_albo_villazon,
        permiso_e_inspeccion_senasag,
        ibnorca_ibmetro,
        inspeccion_previa,
        escaneo_de_facturas,
        contravenciones,
        almacenaje_albo,
        pago_prima_de_seguro,
        serv_transporte,
        reintergo_ga,
        reintegro_iva,
        reintegro_ice,
        carguio_y_descarguio,
        tramite_senasag_villazon,
        liberacion_contenedor,
        tramite_senasag,
        flete_maritimo,
        emision_de_b_l,
        sobreestadias,
        deposito_especial,
        tramites_aduana,
        analisis_laboratorio,
        gto_puerto_aspb,
        gtos_de_logistica,
        comision_banco_liberacion,
        serv_carguio_y_descarguio,
        seguro,
        proleche,
        inspeccion_senasag,
        total_planilla,
        estado_tramite,
        comision_bob,
        total_factura_con_comision,
        monto_total_factura
    )
    SELECT
        target_ref AS n_referencia,
        COALESCE(i.n_declaracion, g.n_declaracion) AS n_declaracion,
        i.fecha_aceptacion,
        g.fecha_factura,
        
        -- MES DE FACTURACIÓN (BASADO EN FECHA FACTURA DE GASTOS IMPORTACION)
        CASE 
            WHEN g.fecha_factura IS NOT NULL AND g.fecha_factura <> '' AND g.fecha_factura ~ '^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}' THEN 
                SPLIT_PART(SPLIT_PART(g.fecha_factura, ' ', 1), '/', 3) || '-' || LPAD(SPLIT_PART(SPLIT_PART(g.fecha_factura, ' ', 1), '/', 2), 2, '0')
            WHEN g.fecha_factura IS NOT NULL AND g.fecha_factura <> '' AND g.fecha_factura ~ '^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}' THEN 
                SUBSTRING(g.fecha_factura FROM 1 FOR 7)
            WHEN i.fecha_aceptacion IS NOT NULL AND i.fecha_aceptacion <> '' AND i.fecha_aceptacion ~ '^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}' THEN 
                SPLIT_PART(SPLIT_PART(i.fecha_aceptacion, ' ', 1), '/', 3) || '-' || LPAD(SPLIT_PART(SPLIT_PART(i.fecha_aceptacion, ' ', 1), '/', 2), 2, '0')
            WHEN i.fecha_aceptacion IS NOT NULL AND i.fecha_aceptacion <> '' AND i.fecha_aceptacion ~ '^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}' THEN 
                SUBSTRING(i.fecha_aceptacion FROM 1 FOR 7)
            ELSE 'SIN FECHA'
        END AS mes_aceptacion,

        COALESCE(i.razon_social, CASE WHEN target_ref LIKE '%EXP%' THEN 'MINERA SAN CRISTOBAL S.A.' ELSE 'DESCONOCIDO' END) AS razon_social,
        i.nit_importador,
        i.cliente_id,
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
        i.tipo_cambio,
        i.items,
        COALESCE(CAST(NULLIF(REGEXP_REPLACE(i.total_cif, '[^0-9\.]', '', 'g'), '') AS NUMERIC), 0) AS total_cif,
        COALESCE(CAST(NULLIF(REGEXP_REPLACE(i.gravamen, '[^0-9\.]', '', 'g'), '') AS NUMERIC), 0) AS gravamen,
        COALESCE(CAST(NULLIF(REGEXP_REPLACE(i.iva, '[^0-9\.]', '', 'g'), '') AS NUMERIC), 0) AS iva,
        COALESCE(CAST(NULLIF(REGEXP_REPLACE(i.total_tributos, '[^0-9\.]', '', 'g'), '') AS NUMERIC), 0) AS total_tributos,

        -- DATOS DE GASTOS
        COALESCE(g.honorarios_agencia, 0),
        COALESCE(g.carpeta_p_archivo, 0),
        COALESCE(g.gastos_en_despacho, 0),
        COALESCE(g.fotocopias_legalizadas, 0),
        COALESCE(g.verificacion_y_etiquetado, 0),
        COALESCE(g.regularizacion_desp_anticipad, 0),
        COALESCE(g.items_declarados_en_dim_y_dav, 0),
        COALESCE(g.despacho_aduana_frontera, 0),
        COALESCE(g.servicio_logistico, 0),
        COALESCE(g.formulario_dam, 0),
        COALESCE(g.otros_servicios, 0),
        COALESCE(g.formulario_ritex, 0),
        COALESCE(g.serv_de_tram_senasag_unalab, 0),
        COALESCE(g.ingreso_y_recojo_tram_senasag, 0),
        COALESCE(g.total_factura, 0),
        COALESCE(g.gravamen_arancelario, 0),
        COALESCE(g.impuesto_al_valor_agregado, 0),
        COALESCE(g.imp_al_consumo_espcifico, 0),
        COALESCE(g.imp_esp_a_los_hidrocarburos, 0),
        COALESCE(g.formulario_digital, 0),
        COALESCE(g.imp_al_con_espec_al_deporte, 0),
        COALESCE(g.levantamiento_de_abandono, 0),
        COALESCE(g.cam_ind_y_com, 0),
        COALESCE(g.recojo_guia, 0),
        COALESCE(g.emision_certificado, 0),
        COALESCE(g.transporte_local, 0),
        COALESCE(g.almacenaje_dab, 0),
        COALESCE(g.gastos_puerto, 0),
        COALESCE(g.senasag, 0),
        COALESCE(g.agemed, 0),
        COALESCE(g.almacenaje_albo_villazon, 0),
        COALESCE(g.permiso_e_inspeccion_senasag, 0),
        COALESCE(g.ibnorca_ibmetro, 0),
        COALESCE(g.inspeccion_previa, 0),
        COALESCE(g.escaneo_de_facturas, 0),
        COALESCE(g.contravenciones, 0),
        COALESCE(g.almacenaje_albo, 0),
        COALESCE(g.pago_prima_de_seguro, 0),
        COALESCE(g.serv_transporte, 0),
        COALESCE(g.reintergo_ga, 0),
        COALESCE(g.reintegro_iva, 0),
        COALESCE(g.reintegro_ice, 0),
        COALESCE(g.carguio_y_descarguio, 0),
        COALESCE(g.tramite_senasag_villazon, 0),
        COALESCE(g.liberacion_contenedor, 0),
        COALESCE(g.tramite_senasag, 0),
        COALESCE(g.flete_maritimo, 0),
        COALESCE(g.emision_de_b_l, 0),
        COALESCE(g.sobreestadias, 0),
        COALESCE(g.deposito_especial, 0),
        COALESCE(g.tramites_aduana, 0),
        COALESCE(g.analisis_laboratorio, 0),
        COALESCE(g.gto_puerto_aspb, 0),
        COALESCE(g.gtos_de_logistica, 0),
        COALESCE(g.comision_banco_liberacion, 0),
        COALESCE(g.serv_carguio_y_descarguio, 0),
        COALESCE(g.seguro, 0),
        COALESCE(g.proleche, 0),
        COALESCE(g.inspeccion_senasag, 0),
        COALESCE(g.total_planilla, 0),

        -- ESTADO Y COMISIÓN
        CASE 
            WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(m.comision_bob, 0) > 0) THEN 'COMPLETADO'
            ELSE 'EN PROCESO'
        END AS estado_tramite,

        COALESCE(m.comision_bob, 0) AS comision_bob,
        (COALESCE(g.total_factura, 0) + COALESCE(m.comision_bob, 0)) AS total_factura_con_comision,
        (COALESCE(g.total_factura, 0) + COALESCE(m.comision_bob, 0)) AS monto_total_factura

    FROM (SELECT target_ref AS n_referencia) ref_list
    LEFT JOIN public.importaciones i ON i.n_referencia = ref_list.n_referencia
    LEFT JOIN public.gastos_importacion g ON g.n_referencia = ref_list.n_referencia
    LEFT JOIN public.mtodo m ON m.n_referencia = ref_list.n_referencia;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
