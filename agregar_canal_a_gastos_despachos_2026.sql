-- ==============================================================================
-- SCRIPT SQL PARA AGREGAR 'canal' Y 'fecha_canal' A "GASTOS_DESPACHOS_2026" EN SUPABASE
-- ==============================================================================

-- 1. Agregar columnas a la tabla física "GASTOS_DESPACHOS_2026"
ALTER TABLE public."GASTOS_DESPACHOS_2026" ADD COLUMN IF NOT EXISTS canal TEXT;
ALTER TABLE public."GASTOS_DESPACHOS_2026" ADD COLUMN IF NOT EXISTS fecha_canal TEXT;

-- 2. Copiar y sincronizar datos de canal existentes desde control_estados_importacion
UPDATE public."GASTOS_DESPACHOS_2026" g
SET 
    canal = c.canal,
    fecha_canal = c.fecha_canal
FROM public.control_estados_importacion c
WHERE (UPPER(TRIM(g.n_referencia)) = UPPER(TRIM(c.n_referencia)) 
    OR UPPER(TRIM(g.n_declaracion)) = UPPER(TRIM(c.n_declaracion)))
  AND (c.canal IS NOT NULL AND c.canal <> '');

-- 3. Crear trigger para actualizar GASTOS_DESPACHOS_2026 automáticamente cuando cambie control_estados_importacion
CREATE OR REPLACE FUNCTION public.sync_control_estados_to_gastos_2026_fn()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public."GASTOS_DESPACHOS_2026"
    SET 
        canal = NEW.canal,
        fecha_canal = NEW.fecha_canal,
        updated_at = NOW()
    WHERE UPPER(TRIM(n_referencia)) = UPPER(TRIM(NEW.n_referencia))
       OR (NEW.n_declaracion IS NOT NULL AND UPPER(TRIM(n_declaracion)) = UPPER(TRIM(NEW.n_declaracion)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_control_estados_to_gastos ON public.control_estados_importacion;
CREATE TRIGGER trg_sync_control_estados_to_gastos
AFTER INSERT OR UPDATE ON public.control_estados_importacion
FOR EACH ROW EXECUTE FUNCTION public.sync_control_estados_to_gastos_2026_fn();
