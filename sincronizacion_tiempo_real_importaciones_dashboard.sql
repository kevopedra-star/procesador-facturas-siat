-- ==============================================================================
-- SCRIPT CORREGIDO: SINCRONIZACIÓN AUTOMÁTICA Y REALTIME SIN ERRORES DE PUBLICACIÓN
-- ==============================================================================

-- 1. Asegurar Triggers de Sincronización Automática
DROP TRIGGER IF EXISTS trigger_sync_importaciones ON public.importaciones;
CREATE TRIGGER trigger_sync_importaciones
AFTER INSERT OR UPDATE OR DELETE ON public.importaciones
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_despachos_2026_fn();

DROP TRIGGER IF EXISTS trigger_sync_gastos ON public.gastos_importacion;
CREATE TRIGGER trigger_sync_gastos
AFTER INSERT OR UPDATE OR DELETE ON public.gastos_importacion
FOR EACH ROW EXECUTE FUNCTION public.sync_gastos_despachos_2026_fn();

-- 2. Habilitar publicación Realtime en Supabase de forma segura (sin error 42710 si ya existen)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.importaciones;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_importacion;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."GASTOS_DESPACHOS_2026";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."TOTALES_CLIENTES_DASHBOARD_2026";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
