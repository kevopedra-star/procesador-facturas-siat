-- =========================================================================
-- SCRIPT DE BASE DE DATOS: OPTIMIZACIÓN DE RENDIMIENTO CON RESUMEN AGREGADO
-- =========================================================================
-- Ejecuta este script en el editor de SQL de Supabase para crear una tabla
-- de resumen que se mantiene sincronizada automáticamente mediante Triggers.
-- =========================================================================

-- 1. Crear la tabla de resumen si no existe
CREATE TABLE IF NOT EXISTS public.dashboard_summary (
    key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Habilitar permisos de lectura pública para la tabla de resumen
ALTER TABLE public.dashboard_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de dashboard_summary" ON public.dashboard_summary;
CREATE POLICY "Permitir lectura publica de dashboard_summary" 
ON public.dashboard_summary FOR SELECT 
USING (true);

-- 2. Función principal para recalcular resúmenes (se puede llamar con SELECT)
CREATE OR REPLACE FUNCTION public.refresh_dashboard_summary_data()
RETURNS void AS $$
DECLARE
    v_total_docs bigint;
    v_total_ga numeric;
    v_total_iva numeric;
    v_total_tributos numeric;
    v_tributos_mensuales jsonb;
    v_top_clientes jsonb;
    
    v_total_factura numeric;
    v_total_planilla numeric;
    v_liquido numeric;
    v_tramites_listos bigint;
    v_gastos_clientes jsonb;
    v_gastos_mensuales jsonb;
BEGIN
    -- A. KPIs de Importaciones (GA, IVA, Tributos)
    SELECT 
        count(*),
        coalesce(sum(coalesce(replace(gravamen, ',', '')::numeric, 0)), 0),
        coalesce(sum(coalesce(replace(iva, ',', '')::numeric, 0)), 0),
        coalesce(sum(coalesce(replace(total_tributos, ',', '')::numeric, 0)), 0)
    INTO v_total_docs, v_total_ga, v_total_iva, v_total_tributos
    FROM public.importaciones;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES (
        'declaraciones_kpis', 
        jsonb_build_object(
            'total_docs', v_total_docs,
            'total_ga', v_total_ga,
            'total_iva', v_total_iva,
            'total_tributos', v_total_tributos
        ),
        now()
    )
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    -- B. Tributos Mensuales
    SELECT jsonb_agg(row_to_json(t)) INTO v_tributos_mensuales
    FROM (
        SELECT 
            CASE 
                WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN
                    substring(fecha_aceptacion, 4, 2) || '/' || substring(fecha_aceptacion, 7, 4)
                ELSE 'Desconocido'
            END as label,
            sum(coalesce(replace(total_tributos, ',', '')::numeric, 0)) as total,
            CASE 
                WHEN fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN
                    substring(fecha_aceptacion, 7, 4) || substring(fecha_aceptacion, 4, 2)
                ELSE '000000'
            END as sort_key
        FROM public.importaciones
        GROUP BY label, sort_key
        ORDER BY sort_key ASC
    ) t;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES ('tributos_mensuales', coalesce(v_tributos_mensuales, '[]'::jsonb), now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    -- C. Top Clientes (Tributos y CIF)
    SELECT jsonb_agg(row_to_json(t)) INTO v_top_clientes
    FROM (
        SELECT 
            coalesce(nullif(trim(upper(razon_social)), ''), 'DESCONOCIDO') as name,
            count(*) as count,
            sum(coalesce(replace(total_cif, ',', '')::numeric, 0)) as cif,
            sum(coalesce(replace(total_tributos, ',', '')::numeric, 0)) as tributos
        FROM public.importaciones
        GROUP BY name
        ORDER BY tributos DESC
        LIMIT 20
    ) t;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES ('top_clientes_tributos', coalesce(v_top_clientes, '[]'::jsonb), now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    -- D. KPIs de Gastos de Importación (Facturado, Planillas, Líquido)
    SELECT 
        coalesce(sum(coalesce(total_factura, 0)), 0),
        coalesce(sum(coalesce(total_planilla, 0)), 0),
        coalesce(sum(coalesce(total_factura, 0) * 0.87), 0)
    INTO v_total_factura, v_total_planilla, v_liquido
    FROM public.gastos_importacion;
    
    SELECT count(DISTINCT n_referencia) INTO v_tramites_listos
    FROM public.gastos_importacion
    WHERE total_factura > 0 OR total_planilla > 0;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES (
        'gastos_kpis', 
        jsonb_build_object(
            'total_facturado', v_total_factura,
            'liquido_87', v_liquido,
            'total_planillas', v_total_planilla,
            'tramites_listos', v_tramites_listos
        ),
        now()
    )
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    -- E. Gastos por Cliente (Planilla vs Factura)
    SELECT jsonb_agg(row_to_json(t)) INTO v_gastos_clientes
    FROM (
        SELECT 
            coalesce(nullif(trim(upper(i.razon_social)), ''), 'SIN CLIENTE') as client,
            sum(coalesce(g.total_factura, 0)) as fac,
            sum(coalesce(g.total_planilla, 0)) as plan
        FROM public.gastos_importacion g
        LEFT JOIN public.importaciones i ON g.n_referencia = i.n_referencia
        GROUP BY client
        ORDER BY plan DESC, fac DESC
        LIMIT 20
    ) t;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES ('gastos_clientes', coalesce(v_gastos_clientes, '[]'::jsonb), now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

    -- F. Gastos Mensuales
    SELECT jsonb_agg(row_to_json(t)) INTO v_gastos_mensuales
    FROM (
        SELECT 
            CASE 
                WHEN i.fecha_aceptacion ~ '^\d{2}/\d{2}/\d{4}' THEN
                    substring(i.fecha_aceptacion, 7, 4) || '-' || substring(i.fecha_aceptacion, 4, 2)
                ELSE '1900-01'
            END as month,
            sum(coalesce(g.total_factura, 0)) as fac,
            sum(coalesce(g.total_planilla, 0)) as plan
        FROM public.gastos_importacion g
        LEFT JOIN public.importaciones i ON g.n_referencia = i.n_referencia
        GROUP BY month
        ORDER BY month ASC
    ) t;

    INSERT INTO public.dashboard_summary (key, data, updated_at)
    VALUES ('gastos_mensuales', coalesce(v_gastos_mensuales, '[]'::jsonb), now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función Disparadora que invoca a la función principal
CREATE OR REPLACE FUNCTION public.refresh_dashboard_summary_trigger()
RETURNS trigger AS $$
BEGIN
    PERFORM public.refresh_dashboard_summary_data();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Crear disparadores automáticos (Triggers)
DROP TRIGGER IF EXISTS trg_refresh_summary_importaciones ON public.importaciones;
CREATE TRIGGER trg_refresh_summary_importaciones
AFTER INSERT OR UPDATE OR DELETE ON public.importaciones
FOR EACH STATEMENT
EXECUTE FUNCTION public.refresh_dashboard_summary_trigger();

DROP TRIGGER IF EXISTS trg_refresh_summary_gastos ON public.gastos_importacion;
CREATE TRIGGER trg_refresh_summary_gastos
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_importacion
FOR EACH STATEMENT
EXECUTE FUNCTION public.refresh_dashboard_summary_trigger();

-- 5. Ejecutar el primer cálculo inicial
SELECT public.refresh_dashboard_summary_data();
