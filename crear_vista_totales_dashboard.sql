-- ==============================================================================
-- SCRIPT SQL PARA CREAR LA VISTA DE TOTALES AGRUPADOS POR CLIENTE Y MES
-- "V_TOTALES_CLIENTES_DASHBOARD_2026" EN SUPABASE
-- 
-- Agrupa automáticamente por Cliente (razon_social) y Mes de Aceptación.
-- Calcula la suma total de tributos, CIF, items y cada uno de los conceptos de gasto.
-- Se actualiza EN TIEMPO REAL cada vez que se agrega o modifica un registro.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_totales_clientes_dashboard_2026 AS
SELECT 
    -- Agrupadores Principales
    COALESCE(NULLIF(TRIM(razon_social), ''), 'SIN CLIENTE ASIGNADO') AS cliente_razon_social,
    
    -- Extracción del Mes y Año de Aceptación
    CASE 
        WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN 
            SUBSTRING(fecha_aceptacion FROM 7 FOR 4) || '-' || SUBSTRING(fecha_aceptacion FROM 4 FOR 2)
        WHEN fecha_aceptacion ~ '^\d{4}-\d{2}-\d{2}' THEN 
            SUBSTRING(fecha_aceptacion FROM 1 FOR 7)
        ELSE 'SIN FECHA'
    END AS mes_aceptacion,

    -- Contadores y Métricas Globales
    COUNT(DISTINCT n_referencia) AS cantidad_despachos,
    COUNT(DISTINCT n_declaracion) AS cantidad_declaraciones,
    COUNT(DISTINCT aduana) AS cantidad_aduanas_distintas,
    
    -- Totales Físicos e Ítems
    SUM(COALESCE(CAST(NULLIF(regexp_replace(items, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0)) AS total_items,
    SUM(total_cif) AS suma_total_cif,
    SUM(total_tributos) AS suma_total_tributos,

    -- Desglose de Gastos en Despacho
    SUM(honorarios_agencia) AS total_honorarios_agencia,
    SUM(carpeta_p_archivo) AS total_carpeta_p_archivo,
    SUM(gastos_en_despacho) AS total_gastos_en_despacho,
    SUM(fotocopias_legalizadas) AS total_fotocopias_legalizadas,
    SUM(verificacion_y_etiquetado) AS total_verificacion_y_etiquetado,
    SUM(regularizacion_desp_anticipad) AS total_regularizacion_desp_anticipad,
    SUM(items_declarados_en_dim_y_dav) AS total_items_declarados_en_dim_y_dav,
    SUM(despacho_aduana_frontera) AS total_despacho_aduana_frontera,
    SUM(servicio_logistico) AS total_servicio_logistico,
    SUM(formulario_dam) AS total_formulario_dam,
    SUM(otros_servicios) AS total_otros_servicios,
    SUM(formulario_ritex) AS total_formulario_ritex,
    SUM(serv_de_tram_senasag_unalab) AS total_serv_de_tram_senasag_unalab,
    SUM(ingreso_y_recojo_tram_senasag) AS total_ingreso_y_recojo_tram_senasag,
    SUM(total_factura) AS suma_total_facturas,

    -- Tributos e Impuestos Desglosados
    SUM(impuesto_al_valor_agregado) AS total_impuesto_al_valor_agregado,
    SUM(imp_al_consumo_espcifico) AS total_imp_al_consumo_espcifico,
    SUM(imp_esp_a_los_hidrocarburos) AS total_imp_esp_a_los_hidrocarburos,
    SUM(formulario_digital) AS total_formulario_digital,
    SUM(imp_al_con_espec_al_deporte) AS total_imp_al_con_espec_al_deporte,
    SUM(levantamiento_de_abandono) AS total_levantamiento_de_abandono,
    
    -- TOTAL GENERAL DE PLANILLA
    SUM(total_planilla) AS suma_total_planilla

FROM public."GASTOS_DESPACHOS_2026"
GROUP BY 
    COALESCE(NULLIF(TRIM(razon_social), ''), 'SIN CLIENTE ASIGNADO'),
    CASE 
        WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN 
            SUBSTRING(fecha_aceptacion FROM 7 FOR 4) || '-' || SUBSTRING(fecha_aceptacion FROM 4 FOR 2)
        WHEN fecha_aceptacion ~ '^\d{4}-\d{2}-\d{2}' THEN 
            SUBSTRING(fecha_aceptacion FROM 1 FOR 7)
        ELSE 'SIN FECHA'
    END
ORDER BY mes_aceptacion DESC, suma_total_planilla DESC;
