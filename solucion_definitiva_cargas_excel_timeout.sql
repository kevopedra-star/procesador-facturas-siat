-- ==============================================================================
-- SCRIPT SQL: SOLUCIÓN DEFINITIVA A 'STATEMENT TIMEOUT' EN CARGA DE EXCEL
-- ==============================================================================
-- Optimiza la función trigger sync_gastos_despachos_2026_fn() para que no ejecute
-- recálculos masivos de tabla completa por cada fila individual.
-- ==============================================================================

-- 1. Optimizar la función trigger de sincronización (sin recálculos repetitivos por fila)
CREATE OR REPLACE FUNCTION public.sync_gastos_despachos_2026_fn()
RETURNS TRIGGER AS $$
DECLARE
    ref_val TEXT;
    decl_val TEXT;
    target_id UUID;
    rec_imp RECORD;
    rec_gasto RECORD;
BEGIN
    -- Ignorar si la función se ejecuta en tablas no correspondientes
    IF (TG_TABLE_NAME = 'facturas' OR TG_TABLE_NAME = 'facturas_provisionales') THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        ref_val := UPPER(TRIM(OLD.n_referencia));
        decl_val := UPPER(TRIM(OLD.n_declaracion));
        DELETE FROM public."GASTOS_DESPACHOS_2026"
        WHERE (n_referencia IS NOT NULL AND ref_val IS NOT NULL AND UPPER(TRIM(n_referencia)) = ref_val)
           OR (n_declaracion IS NOT NULL AND decl_val IS NOT NULL AND UPPER(TRIM(n_declaracion)) = decl_val);
        RETURN OLD;
    END IF;

    ref_val := UPPER(TRIM(NEW.n_referencia));
    decl_val := UPPER(TRIM(NEW.n_declaracion));

    -- Buscar registro origen en importaciones
    SELECT * INTO rec_imp
    FROM public.importaciones
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- Buscar registro origen en gastos_importacion
    SELECT * INTO rec_gasto
    FROM public.gastos_importacion
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- Identificar la fila destino en GASTOS_DESPACHOS_2026
    SELECT id INTO target_id
    FROM public."GASTOS_DESPACHOS_2026"
    WHERE (decl_val IS NOT NULL AND decl_val <> '' AND UPPER(TRIM(n_declaracion)) = decl_val)
       OR (ref_val IS NOT NULL AND ref_val <> '' AND UPPER(TRIM(n_referencia)) = ref_val)
    LIMIT 1;

    -- Actualizar o Insertar de forma directa y ultrarrápida
    IF target_id IS NOT NULL THEN
        UPDATE public."GASTOS_DESPACHOS_2026" SET
            n_referencia = COALESCE(NULLIF(ref_val, ''), rec_imp.n_referencia, rec_gasto.n_referencia, n_referencia),
            n_declaracion = COALESCE(NULLIF(decl_val, ''), rec_imp.n_declaracion, rec_gasto.n_declaracion, n_declaracion),
            fecha_aceptacion = COALESCE(rec_imp.fecha_aceptacion, fecha_aceptacion),
            fecha_factura = COALESCE(rec_gasto.fecha_factura, fecha_factura),
            razon_social = COALESCE(rec_imp.razon_social, razon_social),
            nit_importador = COALESCE(rec_imp.nit_importador, nit_importador),
            cliente_id = COALESCE(rec_imp.cliente_id, cliente_id),
            aduana = COALESCE(rec_imp.aduana, aduana),
            factura = COALESCE(rec_imp.factura, factura),
            proveedor = COALESCE(rec_imp.proveedor, proveedor),
            modalidad = COALESCE(rec_imp.modalidad, modalidad),
            pedido = COALESCE(rec_imp.pedido, pedido),
            oi = COALESCE(rec_imp.oi, oi),
            oc = COALESCE(rec_imp.oc, oc),
            guia_embarque = COALESCE(rec_imp.guia_embarque, guia_embarque),
            contenedor = COALESCE(rec_imp.contenedor, contenedor),
            peso_bruto = COALESCE(rec_imp.peso_bruto, peso_bruto),
            tipo_cambio = COALESCE(rec_imp.tipo_cambio, tipo_cambio, 6.96),
            items = COALESCE(rec_imp.items, items),
            total_cif = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_cif, '[^0-9.]', '', 'g'), '') AS NUMERIC), total_cif, 0),
            gravamen = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.gravamen, '[^0-9.]', '', 'g'), '') AS NUMERIC), gravamen, 0),
            iva = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.iva, '[^0-9.]', '', 'g'), '') AS NUMERIC), iva, 0),
            total_tributos = COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_tributos, '[^0-9.]', '', 'g'), '') AS NUMERIC), total_tributos, 0),
            honorarios_agencia = COALESCE(rec_gasto.honorarios_agencia, honorarios_agencia, 0),
            carpeta_p_archivo = COALESCE(rec_gasto.carpeta_p_archivo, carpeta_p_archivo, 0),
            gastos_en_despacho = COALESCE(rec_gasto.gastos_en_despacho, gastos_en_despacho, 0),
            fotocopias_legalizadas = COALESCE(rec_gasto.fotocopias_legalizadas, fotocopias_legalizadas, 0),
            verificacion_y_etiquetado = COALESCE(rec_gasto.verificacion_y_etiquetado, verificacion_y_etiquetado, 0),
            regularizacion_desp_anticipad = COALESCE(rec_gasto.regularizacion_desp_anticipad, regularizacion_desp_anticipad, 0),
            items_declarados_en_dim_y_dav = COALESCE(rec_gasto.items_declarados_en_dim_y_dav, items_declarados_en_dim_y_dav, 0),
            despacho_aduana_frontera = COALESCE(rec_gasto.despacho_aduana_frontera, despacho_aduana_frontera, 0),
            servicio_logistico = COALESCE(rec_gasto.servicio_logistico, servicio_logistico, 0),
            formulario_dam = COALESCE(rec_gasto.formulario_dam, formulario_dam, 0),
            otros_servicios = COALESCE(rec_gasto.otros_servicios, otros_servicios, 0),
            formulario_ritex = COALESCE(rec_gasto.formulario_ritex, formulario_ritex, 0),
            serv_de_tram_senasag_unalab = COALESCE(rec_gasto.serv_de_tram_senasag_unalab, serv_de_tram_senasag_unalab, 0),
            ingreso_y_recojo_tram_senasag = COALESCE(rec_gasto.ingreso_y_recojo_tram_senasag, ingreso_y_recojo_tram_senasag, 0),
            total_factura = COALESCE(rec_gasto.total_factura, total_factura, 0),
            total_planilla = COALESCE(rec_gasto.total_planilla, total_planilla, 0),
            updated_at = NOW()
        WHERE id = target_id;
    ELSE
        INSERT INTO public."GASTOS_DESPACHOS_2026" (
            n_referencia, n_declaracion, fecha_aceptacion, fecha_factura, razon_social, nit_importador, cliente_id, aduana, factura, proveedor, modalidad, pedido, oi, oc, guia_embarque, contenedor, peso_bruto, tipo_cambio, items, total_cif, gravamen, iva, total_tributos, honorarios_agencia, carpeta_p_archivo, gastos_en_despacho, fotocopias_legalizadas, verificacion_y_etiquetado, regularizacion_desp_anticipad, items_declarados_en_dim_y_dav, despacho_aduana_frontera, servicio_logistico, formulario_dam, otros_servicios, formulario_ritex, serv_de_tram_senasag_unalab, ingreso_y_recojo_tram_senasag, total_factura, total_planilla
        ) VALUES (
            COALESCE(ref_val, rec_imp.n_referencia, rec_gasto.n_referencia, 'SIN-REF'),
            COALESCE(decl_val, rec_imp.n_declaracion, rec_gasto.n_declaracion),
            rec_imp.fecha_aceptacion, rec_gasto.fecha_factura, rec_imp.razon_social, rec_imp.nit_importador, rec_imp.cliente_id, rec_imp.aduana, rec_imp.factura, rec_imp.proveedor, rec_imp.modalidad, rec_imp.pedido, rec_imp.oi, rec_imp.oc, rec_imp.guia_embarque, rec_imp.contenedor, rec_imp.peso_bruto, COALESCE(rec_imp.tipo_cambio, 6.96), rec_imp.items,
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_cif, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.gravamen, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.iva, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(CAST(NULLIF(regexp_replace(rec_imp.total_tributos, '[^0-9.]', '', 'g'), '') AS NUMERIC), 0),
            COALESCE(rec_gasto.honorarios_agencia, 0), COALESCE(rec_gasto.carpeta_p_archivo, 0), COALESCE(rec_gasto.gastos_en_despacho, 0), COALESCE(rec_gasto.fotocopias_legalizadas, 0), COALESCE(rec_gasto.verificacion_y_etiquetado, 0), COALESCE(rec_gasto.regularizacion_desp_anticipad, 0), COALESCE(rec_gasto.items_declarados_en_dim_y_dav, 0), COALESCE(rec_gasto.despacho_aduana_frontera, 0), COALESCE(rec_gasto.servicio_logistico, 0), COALESCE(rec_gasto.formulario_dam, 0), COALESCE(rec_gasto.otros_servicios, 0), COALESCE(rec_gasto.formulario_ritex, 0), COALESCE(rec_gasto.serv_de_tram_senasag_unalab, 0), COALESCE(rec_gasto.ingreso_y_recojo_tram_senasag, 0), COALESCE(rec_gasto.total_factura, 0), COALESCE(rec_gasto.total_planilla, 0)
        )
        ON CONFLICT (n_referencia) DO UPDATE SET
            n_declaracion = EXCLUDED.n_declaracion,
            fecha_aceptacion = EXCLUDED.fecha_aceptacion,
            razon_social = EXCLUDED.razon_social,
            aduana = EXCLUDED.aduana,
            total_cif = EXCLUDED.total_cif,
            total_tributos = EXCLUDED.total_tributos,
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Asegurar que el trigger de recálculo de totales sea POR SENTENCIA (STATEMENT), NO POR FILA
DROP TRIGGER IF EXISTS trigger_recalcular_totales_dashboard ON public."GASTOS_DESPACHOS_2026";
CREATE TRIGGER trigger_recalcular_totales_dashboard
AFTER INSERT OR UPDATE OR DELETE ON public."GASTOS_DESPACHOS_2026"
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_recalcular_totales_dashboard_2026_fn();

-- 3. Crear Índices de Alto Rendimiento
CREATE INDEX IF NOT EXISTS idx_gastos_desp_n_ref ON public."GASTOS_DESPACHOS_2026" (n_referencia);
CREATE INDEX IF NOT EXISTS idx_gastos_desp_n_decl ON public."GASTOS_DESPACHOS_2026" (n_declaracion);
CREATE INDEX IF NOT EXISTS idx_gastos_imp_n_ref ON public.gastos_importacion (n_referencia);

-- 4. Ejecutar el recálculo inicial una sola vez
SELECT public.recalcular_totales_dashboard_2026_fn();
