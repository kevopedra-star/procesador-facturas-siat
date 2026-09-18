-- ==============================================================================
-- SCRIPT DE CORRECCIÓN: FIX PARA ERROR "record 'new' has no field 'cliente'"
-- ==============================================================================
-- Ejecutar este script en el Editor SQL de Supabase para solucionar el error
-- al subir archivos de Excel de Gastos.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_gastos_to_control_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_cliente TEXT;
    v_decl TEXT;
    v_acept TEXT;
    v_m_exists BOOLEAN := FALSE;
    v_nuevo_estado TEXT := 'PENDIENTE';
    ref_key TEXT;
    prefix_key TEXT;
    digits7 TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.control_estados_importacion
        SET total_factura = 0, total_planilla = 0, estado_factura = 'PENDIENTE', estado_planilla = 'PENDIENTE', estado_general = 'PENDIENTE', updated_at = NOW()
        WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(OLD.n_referencia));
        RETURN OLD;
    END IF;

    ref_key := UPPER(TRIM(NEW.n_referencia));
    IF ref_key IS NOT NULL AND ref_key <> '' THEN
        prefix_key := SPLIT_PART(SPLIT_PART(ref_key, '-', 1), '/', 1);
    END IF;

    IF ref_key IS NULL OR ref_key = '' THEN
        RETURN NEW;
    END IF;

    -- Obtener la razón social del cliente desde la tabla principal importaciones
    SELECT razon_social, n_declaracion, fecha_aceptacion
    INTO v_cliente, v_decl, v_acept
    FROM public.importaciones
    WHERE UPPER(TRIM(n_referencia)) = ref_key
    LIMIT 1;

    -- Evaluar reglas para Minera San Cristóbal / trámites de Exportación (EXP)
    IF (UPPER(TRIM(COALESCE(v_cliente, ''))) LIKE '%MINERA SAN CRISTOBAL%' OR ref_key LIKE '%EXP%') THEN
        v_nuevo_estado := 'COMPLETADO';
    ELSE
        IF v_decl IS NOT NULL AND v_decl <> '' THEN
            digits7 := RIGHT(regexp_replace(v_decl, '[^0-9]', '', 'g'), 7);
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.mtodo m
            WHERE UPPER(TRIM(m.interno)) = ref_key
               OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(m.interno)), '-', 1), '/', 1) = prefix_key)
               OR (v_decl IS NOT NULL AND UPPER(TRIM(m.dim_n_ro)) = UPPER(TRIM(v_decl)))
               OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(m.dim_n_ro, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4))
        ) INTO v_m_exists;

        IF (COALESCE(NEW.total_factura, 0) > 0 OR COALESCE(NEW.total_planilla, 0) > 0 OR v_m_exists) THEN
            v_nuevo_estado := 'COMPLETADO';
        ELSE
            v_nuevo_estado := 'PENDIENTE';
        END IF;
    END IF;

    INSERT INTO public.control_estados_importacion (
        n_referencia,
        cliente,
        n_declaracion,
        fecha_aceptacion,
        total_factura,
        total_planilla,
        estado_factura,
        estado_planilla,
        estado_general,
        updated_at
    )
    VALUES (
        NEW.n_referencia,
        v_cliente,
        COALESCE(NEW.n_declaracion, v_decl),
        v_acept,
        COALESCE(NEW.total_factura, 0),
        COALESCE(NEW.total_planilla, 0),
        v_nuevo_estado,
        v_nuevo_estado,
        v_nuevo_estado,
        NOW()
    )
    ON CONFLICT (n_referencia) DO UPDATE SET
        total_factura = EXCLUDED.total_factura,
        total_planilla = EXCLUDED.total_planilla,
        estado_factura = EXCLUDED.estado_factura,
        estado_planilla = EXCLUDED.estado_planilla,
        estado_general = EXCLUDED.estado_general,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear el trigger en gastos_importacion
DROP TRIGGER IF EXISTS trg_sync_gastos_to_control ON public.gastos_importacion;
CREATE TRIGGER trg_sync_gastos_to_control
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_importacion
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_to_control_fn();
