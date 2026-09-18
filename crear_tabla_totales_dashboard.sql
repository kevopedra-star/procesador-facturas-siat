-- ==============================================================================
-- CORREGIDO: SCRIPT DE TOTALES POR CLIENTE Y MES PARA SUPABASE
-- TABLA FÍSICA AUTOSINCRONIZADA "TOTALES_CLIENTES_DASHBOARD_2026"
-- ==============================================================================

-- 1. Crear Tabla Física de Totales
CREATE TABLE IF NOT EXISTS public."TOTALES_CLIENTES_DASHBOARD_2026" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_razon_social TEXT NOT NULL,
    mes_aceptacion TEXT NOT NULL,
    cantidad_despachos BIGINT DEFAULT 0,
    cantidad_declaraciones BIGINT DEFAULT 0,
    cantidad_aduanas_distintas BIGINT DEFAULT 0,
    total_items NUMERIC(15,2) DEFAULT 0,
    suma_total_cif NUMERIC(15,2) DEFAULT 0,
    suma_total_tributos NUMERIC(15,2) DEFAULT 0,
    total_honorarios_agencia NUMERIC(15,2) DEFAULT 0,
    total_carpeta_p_archivo NUMERIC(15,2) DEFAULT 0,
    total_gastos_en_despacho NUMERIC(15,2) DEFAULT 0,
    total_fotocopias_legalizadas NUMERIC(15,2) DEFAULT 0,
    total_verificacion_y_etiquetado NUMERIC(15,2) DEFAULT 0,
    total_regularizacion_desp_anticipad NUMERIC(15,2) DEFAULT 0,
    total_items_declarados_en_dim_y_dav NUMERIC(15,2) DEFAULT 0,
    total_despacho_aduana_frontera NUMERIC(15,2) DEFAULT 0,
    total_servicio_logistico NUMERIC(15,2) DEFAULT 0,
    total_formulario_dam NUMERIC(15,2) DEFAULT 0,
    total_otros_servicios NUMERIC(15,2) DEFAULT 0,
    total_formulario_ritex NUMERIC(15,2) DEFAULT 0,
    total_serv_de_tram_senasag_unalab NUMERIC(15,2) DEFAULT 0,
    total_ingreso_y_recojo_tram_senasag NUMERIC(15,2) DEFAULT 0,
    suma_total_facturas NUMERIC(15,2) DEFAULT 0,
    total_impuesto_al_valor_agregado NUMERIC(15,2) DEFAULT 0,
    total_imp_al_consumo_espcifico NUMERIC(15,2) DEFAULT 0,
    total_imp_esp_a_los_hidrocarburos NUMERIC(15,2) DEFAULT 0,
    total_formulario_digital NUMERIC(15,2) DEFAULT 0,
    total_imp_al_con_espec_al_deporte NUMERIC(15,2) DEFAULT 0,
    total_levantamiento_de_abandono NUMERIC(15,2) DEFAULT 0,
    suma_total_planilla NUMERIC(15,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_cliente_mes UNIQUE (cliente_razon_social, mes_aceptacion)
);

-- Habilitar RLS
ALTER TABLE public."TOTALES_CLIENTES_DASHBOARD_2026" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total a TOTALES_CLIENTES_DASHBOARD_2026" ON public."TOTALES_CLIENTES_DASHBOARD_2026";
CREATE POLICY "Acceso total a TOTALES_CLIENTES_DASHBOARD_2026" ON public."TOTALES_CLIENTES_DASHBOARD_2026" FOR ALL USING (true);

-- 2. Función Principal de Recálculo (Ejecutable directamente)
CREATE OR REPLACE FUNCTION public.recalcular_totales_dashboard_2026_fn()
RETURNS void AS $$
BEGIN
    TRUNCATE TABLE public."TOTALES_CLIENTES_DASHBOARD_2026";
    
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
        CASE 
            WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN 
                SUBSTRING(fecha_aceptacion FROM 7 FOR 4) || '-' || SUBSTRING(fecha_aceptacion FROM 4 FOR 2)
            WHEN fecha_aceptacion ~ '^\d{4}-\d{2}-\d{2}' THEN 
                SUBSTRING(fecha_aceptacion FROM 1 FOR 7)
            ELSE 'SIN FECHA'
        END AS mes_aceptacion,
        COUNT(DISTINCT n_referencia) AS cantidad_despachos,
        COUNT(DISTINCT n_declaracion) AS cantidad_declaraciones,
        COUNT(DISTINCT aduana) AS cantidad_aduanas_distintas,
        SUM(COALESCE(CAST(NULLIF(regexp_replace(items, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0)) AS total_items,
        SUM(total_cif) AS suma_total_cif,
        SUM(total_tributos) AS suma_total_tributos,
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
        SUM(impuesto_al_valor_agregado) AS total_impuesto_al_valor_agregado,
        SUM(imp_al_consumo_espcifico) AS total_imp_al_consumo_espcifico,
        SUM(imp_esp_a_los_hidrocarburos) AS total_imp_esp_a_los_hidrocarburos,
        SUM(formulario_digital) AS total_formulario_digital,
        SUM(imp_al_con_espec_al_deporte) AS total_imp_al_con_espec_al_deporte,
        SUM(levantamiento_de_abandono) AS total_levantamiento_de_abandono,
        SUM(total_planilla) AS suma_total_planilla,
        NOW()
    FROM public."GASTOS_DESPACHOS_2026"
    GROUP BY 
        COALESCE(NULLIF(TRIM(razon_social), ''), 'SIN CLIENTE ASIGNADO'),
        CASE 
            WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN 
                SUBSTRING(fecha_aceptacion FROM 7 FOR 4) || '-' || SUBSTRING(fecha_aceptacion FROM 4 FOR 2)
            WHEN fecha_aceptacion ~ '^\d{4}-\d{2}-\d{2}' THEN 
                SUBSTRING(fecha_aceptacion FROM 1 FOR 7)
            ELSE 'SIN FECHA'
        END;
END;
$$ LANGUAGE plpgsql;

-- 3. Wrapper para el Trigger
CREATE OR REPLACE FUNCTION public.trg_recalcular_totales_dashboard_2026_fn()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.recalcular_totales_dashboard_2026_fn();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear Triggers en la Tabla Principal
DROP TRIGGER IF EXISTS trigger_recalcular_totales_dashboard ON public."GASTOS_DESPACHOS_2026";
CREATE TRIGGER trigger_recalcular_totales_dashboard
AFTER INSERT OR UPDATE OR DELETE ON public."GASTOS_DESPACHOS_2026"
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_recalcular_totales_dashboard_2026_fn();

-- 5. Poblar los totales por primera vez
SELECT public.recalcular_totales_dashboard_2026_fn();
