-- ==============================================================================
-- SCRIPT SQL: RESTAURAR LA TABLA FACTURAS Y ELIMINAR TODOS SUS TRIGGERS ACCIDENTALES
-- ==============================================================================
-- Este script busca cualquier trigger en la tabla 'public.facturas' y lo elimina 
-- automáticamente para que vuelva a guardar exactamente como antes sin ningún error.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'facturas'
          AND event_object_schema = 'public'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.facturas CASCADE;';
    END LOOP;
END $$;

-- Asegurar permisos de inserción directa en la tabla facturas
GRANT ALL ON public.facturas TO anon, authenticated, service_role;
