-- ==============================================================================
-- SCRIPT SQL: ELIMINACIÓN DEFINITIVA DE LOCKS, TIMEOUTS Y ERROR DELETE
-- ==============================================================================
-- 1. Utiliza DELETE ... WHERE true para cumplir la regla de Supabase sin bloqueos.
-- 2. Elimina bloqueos de tabla EXCLUSIVOS para que el Excel suba en segundos.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_totales_dashboard_2026_fn()
RETURNS void AS $$
BEGIN
    -- Utilizar DELETE WHERE true para cumplir la exigencia de Supabase sin causar lock exclusivo
    DELETE FROM public."TOTALES_CLIENTES_DASHBOARD_2026" WHERE true;
    
    INSERT INTO public."TOTALES_CLIENTES_DASHBOARD_2026" (
        cliente_razon_social,
        mes_aceptacion,
        cantidad_despachos,
        cantidad_declaraciones,
        cantidad_aduanas_distintas,
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

-- 2. Asegurar que el trigger de recálculo sea STATEMENT level
DROP TRIGGER IF EXISTS trigger_recalcular_totales_dashboard ON public."GASTOS_DESPACHOS_2026";
CREATE TRIGGER trigger_recalcular_totales_dashboard
AFTER INSERT OR UPDATE OR DELETE ON public."GASTOS_DESPACHOS_2026"
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_recalcular_totales_dashboard_2026_fn();

-- 3. Ejecutar el recálculo inicial
SELECT public.recalcular_totales_dashboard_2026_fn();
