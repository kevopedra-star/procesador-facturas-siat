-- ============================================================================
-- SCRIPT DE REPARACIÓN DE ESQUEMA: TABLA registro_verificaciones
-- Ejecuta este script en el Editor SQL de tu panel de Supabase
-- ============================================================================

-- 1. Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS public.registro_verificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    tipo text NOT NULL,
    fecha_ejecucion timestamp with time zone DEFAULT timezone('utc'::text, now()),
    resumen jsonb NOT NULL,
    detalles jsonb NOT NULL,
    CONSTRAINT registro_verificaciones_pkey PRIMARY KEY (id)
);

-- 2. Agregar columnas faltantes en caso de que la tabla ya existiera previamente sin ellas
ALTER TABLE public.registro_verificaciones ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.registro_verificaciones ADD COLUMN IF NOT EXISTS fecha_ejecucion timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE public.registro_verificaciones ADD COLUMN IF NOT EXISTS resumen jsonb;
ALTER TABLE public.registro_verificaciones ADD COLUMN IF NOT EXISTS detalles jsonb;

-- 3. Desactivar RLS para permitir inserciones de auditoría
ALTER TABLE public.registro_verificaciones DISABLE ROW LEVEL SECURITY;

-- 4. Notificar a PostgREST para recargar el caché del esquema de la base de datos inmediatamente
NOTIFY pgrst, 'reload schema';
