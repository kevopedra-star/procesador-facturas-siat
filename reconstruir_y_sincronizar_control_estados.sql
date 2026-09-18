-- ============================================================================
-- SCRIPT ANTI-DEADLOCK Y ANTI-DUPLICADOS DEFINITIVO
-- TABLA: public.control_estados_importacion, public.GASTOS_DESPACHOS_2026, public.mtodo
-- ============================================================================

-- DESACTIVAR TEMPORALMENTE TRIGGERS DE SESIÓN Y BLOQUEAR TABLAS PARA EVITAR DEADLOCKS
SET session_replication_role = 'replica';

-- BLOQUEAR LAS TABLAS AL INICIO EN UN SOLO PASO PARA EVITAR DEADLOCKS CON OTRAS CONEXIONES ACTIVAS
LOCK TABLE public.control_estados_importacion, public."GASTOS_DESPACHOS_2026" IN EXCLUSIVE MODE;

-- 1. Eliminar duplicados si existieran en control_estados_importacion
DELETE FROM public.control_estados_importacion a
USING public.control_estados_importacion b
WHERE a.ctid < b.ctid 
  AND UPPER(TRIM(a.n_referencia)) = UPPER(TRIM(b.n_referencia));

-- 2. Asegurar el índice único en n_referencia
CREATE UNIQUE INDEX IF NOT EXISTS uq_control_estados_n_ref ON public.control_estados_importacion (n_referencia);

-- 3. VACIAR LA TABLA CONTROL DE ESTADOS CON DELETE (EVITA EL LOCK EXCLUSIVO DE DDL DE TRUNCATE)
DELETE FROM public.control_estados_importacion;

-- 4. POBLAR INICIALMENTE DESDE 'importaciones' CON DISTINCT ON PARA EVITAR DUPLICADOS (ERROR 21000)
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
SELECT DISTINCT ON (UPPER(TRIM(i.n_referencia)))
    i.n_referencia,
    i.razon_social AS cliente,
    i.n_declaracion,
    i.fecha_aceptacion,
    COALESCE(g.total_factura, 0) AS total_factura,
    COALESCE(g.total_planilla, 0) AS total_planilla,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(g.total_planilla, 0) > 0) THEN 'COMPLETADO' 
        ELSE 'PENDIENTE' 
    END,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_planilla, 0) > 0 OR COALESCE(g.total_factura, 0) > 0) THEN 'COMPLETADO' 
        ELSE 'PENDIENTE' 
    END,
    CASE 
        WHEN (UPPER(TRIM(i.razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(i.n_referencia)) LIKE '%EXP%') THEN 'COMPLETADO'
        WHEN (COALESCE(g.total_factura, 0) > 0 OR COALESCE(g.total_planilla, 0) > 0) THEN 'COMPLETADO' 
        ELSE 'PENDIENTE' 
    END,
    NOW()
FROM public.importaciones i
LEFT JOIN public.gastos_importacion g ON UPPER(TRIM(i.n_referencia)) = UPPER(TRIM(g.n_referencia))
WHERE i.n_referencia IS NOT NULL AND i.n_referencia <> ''
ORDER BY UPPER(TRIM(i.n_referencia)), i.id DESC
ON CONFLICT (n_referencia) DO UPDATE SET
    cliente = EXCLUDED.cliente,
    n_declaracion = EXCLUDED.n_declaracion,
    fecha_aceptacion = EXCLUDED.fecha_aceptacion,
    total_factura = EXCLUDED.total_factura,
    total_planilla = EXCLUDED.total_planilla,
    estado_factura = EXCLUDED.estado_factura,
    estado_planilla = EXCLUDED.estado_planilla,
    estado_general = EXCLUDED.estado_general,
    updated_at = NOW();

-- 4.1 ACTUALIZAR ESTADOS EN CONTROL DESDE MTODO

-- Match Exacto por Referencia
UPDATE public.control_estados_importacion c
SET estado_factura = 'COMPLETADO', estado_planilla = 'COMPLETADO', estado_general = 'COMPLETADO', updated_at = NOW()
FROM public.mtodo m
WHERE UPPER(TRIM(c.n_referencia)) = UPPER(TRIM(m.interno));

-- Match por Prefijo Numérico de Referencia (ej. 2197-26 ↔ 2197)
UPDATE public.control_estados_importacion c
SET estado_factura = 'COMPLETADO', estado_planilla = 'COMPLETADO', estado_general = 'COMPLETADO', updated_at = NOW()
FROM public.mtodo m
WHERE c.estado_general <> 'COMPLETADO'
  AND c.n_referencia IS NOT NULL AND c.n_referencia <> '' AND m.interno IS NOT NULL AND m.interno <> ''
  AND (
      SPLIT_PART(SPLIT_PART(UPPER(TRIM(c.n_referencia)), '-', 1), '/', 1) = SPLIT_PART(SPLIT_PART(UPPER(TRIM(m.interno)), '-', 1), '/', 1)
      OR UPPER(TRIM(c.n_referencia)) LIKE '%' || UPPER(TRIM(m.interno)) || '%'
      OR UPPER(TRIM(m.interno)) LIKE '%' || UPPER(TRIM(c.n_referencia)) || '%'
  );

-- Match por N° Declaración DIM (exacta o últimos dígitos)
UPDATE public.control_estados_importacion c
SET estado_factura = 'COMPLETADO', estado_planilla = 'COMPLETADO', estado_general = 'COMPLETADO', updated_at = NOW()
FROM public.mtodo m
WHERE c.estado_general <> 'COMPLETADO'
  AND c.n_declaracion IS NOT NULL AND c.n_declaracion <> '' AND m.dim_n_ro IS NOT NULL AND m.dim_n_ro <> ''
  AND (
      UPPER(TRIM(c.n_declaracion)) = UPPER(TRIM(m.dim_n_ro))
      OR (
          LENGTH(regexp_replace(c.n_declaracion, '[^0-9]', '', 'g')) >= 4
          AND LENGTH(regexp_replace(m.dim_n_ro, '[^0-9]', '', 'g')) >= 4
          AND RIGHT(regexp_replace(c.n_declaracion, '[^0-9]', '', 'g'), 4) = RIGHT(regexp_replace(m.dim_n_ro, '[^0-9]', '', 'g'), 4)
      )
  );

-- GARANTIZAR QUE TODO TRÁMITE DE MINERA SAN CRISTOBAL S.A. QUEDE MARCADO COMO COMPLETADO
UPDATE public.control_estados_importacion
SET estado_factura = 'COMPLETADO',
    estado_planilla = 'COMPLETADO',
    estado_general = 'COMPLETADO',
    updated_at = NOW()
WHERE UPPER(TRIM(cliente)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(n_referencia)) LIKE '%EXP%';

-- 5. TRIGGER 1: SINCRONIZACIÓN EN TIEMPO REAL DESDE 'importaciones'
CREATE OR REPLACE FUNCTION public.sync_importaciones_to_control_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_total_fac NUMERIC := 0;
    v_total_plan NUMERIC := 0;
    v_m_exists BOOLEAN := FALSE;
    v_nuevo_estado TEXT := 'PENDIENTE';
    ref_key TEXT;
    prefix_key TEXT;
    decl_key TEXT;
    digits7 TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.control_estados_importacion WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(OLD.n_referencia));
        RETURN OLD;
    END IF;

    ref_key := UPPER(TRIM(NEW.n_referencia));
    IF ref_key IS NOT NULL AND ref_key <> '' THEN
        prefix_key := SPLIT_PART(SPLIT_PART(ref_key, '-', 1), '/', 1);
    END IF;

    decl_key := UPPER(TRIM(NEW.n_declaracion));
    IF decl_key IS NOT NULL AND decl_key <> '' THEN
        digits7 := RIGHT(regexp_replace(decl_key, '[^0-9]', '', 'g'), 7);
    END IF;

    IF ref_key IS NULL OR ref_key = '' THEN
        RETURN NEW;
    END IF;

    IF (UPPER(TRIM(COALESCE(NEW.razon_social, ''))) LIKE '%MINERA SAN CRISTOBAL%' OR ref_key LIKE '%EXP%') THEN
        v_nuevo_estado := 'COMPLETADO';
    ELSE
        SELECT COALESCE(total_factura, 0), COALESCE(total_planilla, 0)
        INTO v_total_fac, v_total_plan
        FROM public.gastos_importacion
        WHERE UPPER(TRIM(n_referencia)) = ref_key
        LIMIT 1;

        SELECT EXISTS (
            SELECT 1 FROM public.mtodo m
            WHERE UPPER(TRIM(m.interno)) = ref_key
               OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(m.interno)), '-', 1), '/', 1) = prefix_key)
               OR (decl_key IS NOT NULL AND UPPER(TRIM(m.dim_n_ro)) = decl_key)
               OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(m.dim_n_ro, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4))
        ) INTO v_m_exists;

        IF (COALESCE(v_total_fac, 0) > 0 OR COALESCE(v_total_plan, 0) > 0 OR v_m_exists) THEN
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
        NEW.razon_social,
        NEW.n_declaracion,
        NEW.fecha_aceptacion,
        COALESCE(v_total_fac, 0),
        COALESCE(v_total_plan, 0),
        v_nuevo_estado,
        v_nuevo_estado,
        v_nuevo_estado,
        NOW()
    )
    ON CONFLICT (n_referencia) DO UPDATE SET
        cliente = EXCLUDED.cliente,
        n_declaracion = EXCLUDED.n_declaracion,
        fecha_aceptacion = EXCLUDED.fecha_aceptacion,
        estado_factura = EXCLUDED.estado_factura,
        estado_planilla = EXCLUDED.estado_planilla,
        estado_general = EXCLUDED.estado_general,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_importaciones_to_control ON public.importaciones;
CREATE TRIGGER trg_sync_importaciones_to_control
AFTER INSERT OR UPDATE OR DELETE ON public.importaciones
FOR EACH ROW EXECUTE FUNCTION public.sync_importaciones_to_control_fn();

-- 6. TRIGGER 2: SINCRONIZACIÓN EN TIEMPO REAL DESDE 'gastos_importacion'
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

    SELECT razon_social, n_declaracion, fecha_aceptacion
    INTO v_cliente, v_decl, v_acept
    FROM public.importaciones
    WHERE UPPER(TRIM(n_referencia)) = ref_key
    LIMIT 1;

    IF v_cliente IS NULL THEN
        v_cliente := NULL;
    END IF;

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

DROP TRIGGER IF EXISTS trg_sync_gastos_to_control ON public.gastos_importacion;
CREATE TRIGGER trg_sync_gastos_to_control
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_importacion
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_to_control_fn();

-- 7. TRIGGER 3: SINCRONIZACIÓN EN TIEMPO REAL DESDE 'mtodo' (MINERA SAN CRISTÓBAL)
CREATE OR REPLACE FUNCTION public.sync_mtodo_to_control_fn()
RETURNS TRIGGER AS $$
DECLARE
    ref_key TEXT;
    prefix_key TEXT;
    decl_key TEXT;
    digits7 TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        ref_key := UPPER(TRIM(OLD.interno));
        IF ref_key IS NOT NULL AND ref_key <> '' THEN
            prefix_key := SPLIT_PART(SPLIT_PART(ref_key, '-', 1), '/', 1);
        END IF;

        decl_key := UPPER(TRIM(OLD.dim_n_ro));
        IF decl_key IS NOT NULL AND decl_key <> '' THEN
            digits7 := RIGHT(regexp_replace(decl_key, '[^0-9]', '', 'g'), 7);
        END IF;

        UPDATE public.control_estados_importacion
        SET estado_factura = 'PENDIENTE', estado_planilla = 'PENDIENTE', estado_general = 'PENDIENTE', updated_at = NOW()
        WHERE (UPPER(TRIM(cliente)) NOT LIKE '%MINERA SAN CRISTOBAL%' AND UPPER(TRIM(n_referencia)) NOT LIKE '%EXP%')
          AND (
              UPPER(TRIM(n_referencia)) = ref_key
              OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(n_referencia)), '-', 1), '/', 1) = prefix_key)
              OR (decl_key IS NOT NULL AND UPPER(TRIM(n_declaracion)) = decl_key)
              OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(n_declaracion, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4))
          );

        UPDATE public."GASTOS_DESPACHOS_2026"
        SET estado_tramite = 'EN PROCESO', updated_at = NOW()
        WHERE (UPPER(TRIM(razon_social)) NOT LIKE '%MINERA SAN CRISTOBAL%' AND UPPER(TRIM(n_referencia)) NOT LIKE '%EXP%')
          AND (
              UPPER(TRIM(n_referencia)) = ref_key
              OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(n_referencia)), '-', 1), '/', 1) = prefix_key)
              OR (decl_key IS NOT NULL AND UPPER(TRIM(n_declaracion)) = decl_key)
              OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(n_declaracion, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4))
          );

        RETURN OLD;
    END IF;

    ref_key := UPPER(TRIM(NEW.interno));
    IF ref_key IS NOT NULL AND ref_key <> '' THEN
        prefix_key := SPLIT_PART(SPLIT_PART(ref_key, '-', 1), '/', 1);
    END IF;

    decl_key := UPPER(TRIM(NEW.dim_n_ro));
    IF decl_key IS NOT NULL AND decl_key <> '' THEN
        digits7 := RIGHT(regexp_replace(decl_key, '[^0-9]', '', 'g'), 7);
    END IF;

    UPDATE public.control_estados_importacion
    SET estado_factura = 'COMPLETADO',
        estado_planilla = 'COMPLETADO',
        estado_general = 'COMPLETADO',
        updated_at = NOW()
    WHERE (ref_key IS NOT NULL AND ref_key <> '' AND UPPER(TRIM(n_referencia)) = ref_key)
       OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(n_referencia)), '-', 1), '/', 1) = prefix_key)
       OR (decl_key IS NOT NULL AND decl_key <> '' AND UPPER(TRIM(n_declaracion)) = decl_key)
       OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(n_declaracion, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4));

    UPDATE public."GASTOS_DESPACHOS_2026"
    SET estado_tramite = 'COMPLETADO',
        updated_at = NOW()
    WHERE (ref_key IS NOT NULL AND ref_key <> '' AND UPPER(TRIM(n_referencia)) = ref_key)
       OR (prefix_key IS NOT NULL AND LENGTH(prefix_key) >= 2 AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(n_referencia)), '-', 1), '/', 1) = prefix_key)
       OR (decl_key IS NOT NULL AND decl_key <> '' AND UPPER(TRIM(n_declaracion)) = decl_key)
       OR (digits7 IS NOT NULL AND LENGTH(digits7) >= 4 AND RIGHT(regexp_replace(n_declaracion, '[^0-9]', '', 'g'), 4) = RIGHT(digits7, 4));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_mtodo_to_control ON public.mtodo;
CREATE TRIGGER trg_sync_mtodo_to_control
AFTER INSERT OR UPDATE OR DELETE ON public.mtodo
FOR EACH ROW EXECUTE FUNCTION public.sync_mtodo_to_control_fn();

-- 8. ACTUALIZAR GASTOS_DESPACHOS_2026 (BASE + MINERA SAN CRISTÓBAL COMPLETADOS)

-- a) Estado base por factura / planilla
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = CASE 
    WHEN (COALESCE(NULLIF(monto_total_factura, '')::numeric, 0) > 0 OR COALESCE(NULLIF(total_planilla::text, '')::numeric, 0) > 0) THEN 'COMPLETADO'
    ELSE 'EN PROCESO'
END,
updated_at = NOW();

-- b) Sincronizar desde control_estados_importacion por n_referencia exacta
UPDATE public."GASTOS_DESPACHOS_2026" g
SET estado_tramite = 'COMPLETADO', updated_at = NOW()
FROM public.control_estados_importacion c
WHERE g.estado_tramite <> 'COMPLETADO'
  AND c.estado_general = 'COMPLETADO'
  AND UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(c.n_referencia));

-- c) Sincronizar desde control_estados_importacion por prefijo de referencia
UPDATE public."GASTOS_DESPACHOS_2026" g
SET estado_tramite = 'COMPLETADO', updated_at = NOW()
FROM public.control_estados_importacion c
WHERE g.estado_tramite <> 'COMPLETADO'
  AND c.estado_general = 'COMPLETADO'
  AND g.n_referencia IS NOT NULL AND g.n_referencia <> '' AND c.n_referencia IS NOT NULL AND c.n_referencia <> ''
  AND SPLIT_PART(SPLIT_PART(UPPER(TRIM(g.n_referencia)), '-', 1), '/', 1) = SPLIT_PART(SPLIT_PART(UPPER(TRIM(c.n_referencia)), '-', 1), '/', 1)
  AND LENGTH(SPLIT_PART(SPLIT_PART(UPPER(TRIM(g.n_referencia)), '-', 1), '/', 1)) >= 2;

-- d) TODOS LOS DESPACHOS DE MINERA SAN CRISTOBAL S.A. MARCADOS COMO COMPLETADO
UPDATE public."GASTOS_DESPACHOS_2026"
SET estado_tramite = 'COMPLETADO', updated_at = NOW()
WHERE UPPER(TRIM(razon_social)) LIKE '%MINERA SAN CRISTOBAL%' OR UPPER(TRIM(n_referencia)) LIKE '%EXP%';

-- REACTIVAR LOS TRIGGERS EN MODO PRODUCCIÓN
SET session_replication_role = 'origin';

-- 9. RECALCULAR TOTALES DEL DASHBOARD
SELECT recalcular_totales_dashboard_2026_fn();
