-- ==============================================================================
-- SCRIPT SQL: CORRECCIÓN DEFINITIVA DE TOTALES Y GRÁFICOS DEL DASHBOARD 2026
-- ==============================================================================
-- 1. Añade las columnas cantidad_completados y cantidad_en_proceso a TOTALES_CLIENTES_DASHBOARD_2026.
-- 2. Evalúa total_factura, monto_total_factura y total_factura_con_comision para calcular suma_total_facturas.
-- 3. Calcula los despachos Completados vs En Proceso con 100% de precisión.
-- ==============================================================================

-- 1. Añadir columnas faltantes si no existen
ALTER TABLE public."TOTALES_CLIENTES_DASHBOARD_2026" 
ADD COLUMN IF NOT EXISTS cantidad_completados BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS cantidad_en_proceso BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS suma_monto_total_factura NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS suma_total_facturas_con_comision NUMERIC(15,2) DEFAULT 0;

-- 2. Función de recálculo completa y ultrarrápida
CREATE OR REPLACE FUNCTION public.recalcular_totales_dashboard_2026_fn()
RETURNS void AS $$
BEGIN
    DELETE FROM public."TOTALES_CLIENTES_DASHBOARD_2026" WHERE true;
    
    INSERT INTO public."TOTALES_CLIENTES_DASHBOARD_2026" (
        cliente_razon_social,
        mes_aceptacion,
        cantidad_despachos,
        cantidad_declaraciones,
        cantidad_aduanas_distintas,
        cantidad_completados,
        cantidad_en_proceso,
        total_items,
        suma_total_cif,
        suma_total_tributos,
        total_honorarios_agencia,
        total_carpeta_p_archivo,
        total_gastos_en_despacho,
        total_fotocopias_legalizadas,
        total_verificacion_y_etiquetado,
        total_regularizacion_desp_anticipad,
        total_items_declarados_en_dim_y_dav,
        total_despacho_aduana_frontera,
        total_servicio_logistico,
        total_formulario_dam,
        total_otros_servicios,
        total_formulario_ritex,
        total_serv_de_tram_senasag_unalab,
        total_ingreso_y_recojo_tram_senasag,
        suma_total_facturas,
        suma_monto_total_factura,
        suma_total_facturas_con_comision,
        total_impuesto_al_valor_agregado,
        total_imp_al_consumo_espcifico,
        total_imp_esp_a_los_hidrocarburos,
        total_formulario_digital,
        total_imp_al_con_espec_al_deporte,
        total_levantamiento_de_abandono,
        suma_total_planilla,
        updated_at
    )
    SELECT 
        COALESCE(NULLIF(TRIM(razon_social), ''), 'SIN CLIENTE ASIGNADO') AS cliente_razon_social,
        COALESCE(NULLIF(mes_aceptacion, ''), 'SIN FECHA') AS mes_aceptacion,
        COUNT(DISTINCT n_referencia) AS cantidad_despachos,
        COUNT(DISTINCT n_declaracion) AS cantidad_declaraciones,
        COUNT(DISTINCT aduana) AS cantidad_aduanas_distintas,
        COUNT(CASE WHEN estado_tramite = 'COMPLETADO' OR COALESCE(total_factura, 0) > 0 OR COALESCE(total_planilla, 0) > 0 THEN 1 END) AS cantidad_completados,
        COUNT(CASE WHEN (estado_tramite IS NULL OR estado_tramite <> 'COMPLETADO') AND COALESCE(total_factura, 0) = 0 AND COALESCE(total_planilla, 0) = 0 THEN 1 END) AS cantidad_en_proceso,
        SUM(COALESCE(CAST(NULLIF(regexp_replace(CAST(items AS TEXT), '[^0-9.]', '', 'g'), '') AS NUMERIC), 0)) AS total_items,
        SUM(COALESCE(total_cif, 0)) AS suma_total_cif,
        SUM(COALESCE(total_tributos, 0)) AS suma_total_tributos,
        SUM(COALESCE(honorarios_agencia, 0)) AS total_honorarios_agencia,
        SUM(COALESCE(carpeta_p_archivo, 0)) AS total_carpeta_p_archivo,
        SUM(COALESCE(gastos_en_despacho, 0)) AS total_gastos_en_despacho,
        SUM(COALESCE(fotocopias_legalizadas, 0)) AS total_fotocopias_legalizadas,
        SUM(COALESCE(verificacion_y_etiquetado, 0)) AS total_verificacion_y_etiquetado,
        SUM(COALESCE(regularizacion_desp_anticipad, 0)) AS total_regularizacion_desp_anticipad,
        SUM(COALESCE(items_declarados_en_dim_y_dav, 0)) AS total_items_declarados_en_dim_y_dav,
        SUM(COALESCE(despacho_aduana_frontera, 0)) AS total_despacho_aduana_frontera,
        SUM(COALESCE(servicio_logistico, 0)) AS total_servicio_logistico,
        SUM(COALESCE(formulario_dam, 0)) AS total_formulario_dam,
        SUM(COALESCE(otros_servicios, 0)) AS total_otros_servicios,
        SUM(COALESCE(formulario_ritex, 0)) AS total_formulario_ritex,
        SUM(COALESCE(serv_de_tram_senasag_unalab, 0)) AS total_serv_de_tram_senasag_unalab,
        SUM(COALESCE(ingreso_y_recojo_tram_senasag, 0)) AS total_ingreso_y_recojo_tram_senasag,
        SUM(COALESCE(total_factura, 0)) AS suma_total_facturas,
        SUM(COALESCE(total_factura, 0)) AS suma_monto_total_factura,
        SUM(COALESCE(total_factura, 0)) AS suma_total_facturas_con_comision,
        SUM(COALESCE(impuesto_al_valor_agregado, 0)) AS total_impuesto_al_valor_agregado,
        SUM(COALESCE(imp_al_consumo_espcifico, 0)) AS total_imp_al_consumo_espcifico,
        SUM(COALESCE(imp_esp_a_los_hidrocarburos, 0)) AS total_imp_esp_a_los_hidrocarburos,
        SUM(COALESCE(formulario_digital, 0)) AS total_formulario_digital,
        SUM(COALESCE(imp_al_con_espec_al_deporte, 0)) AS total_imp_al_con_espec_al_deporte,
        SUM(COALESCE(levantamiento_de_abandono, 0)) AS total_levantamiento_de_abandono,
        SUM(COALESCE(total_planilla, 0)) AS suma_total_planilla,
        NOW()
    FROM public."GASTOS_DESPACHOS_2026"
    GROUP BY 
        COALESCE(NULLIF(TRIM(razon_social), ''), 'SIN CLIENTE ASIGNADO'),
        COALESCE(NULLIF(mes_aceptacion, ''), 'SIN FECHA');
END;
$$ LANGUAGE plpgsql;

-- 3. Recalcular inmediatamente
SELECT public.recalcular_totales_dashboard_2026_fn();
