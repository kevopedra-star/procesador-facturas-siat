-- =============================================================================
-- SCRIPT DE BASE DE DATOS SUPABASE: ARQUITECTURA UNIFICADA CON TRIGGER AUTOMÁTICO
-- TODA FACTURA SE INSERTA PRIMERO EN 'facturas_cabecera' Y EL TRIGGER LA COPIA A 'facturas'
-- =============================================================================

-- 1. TABLA 'facturas_cabecera' (CUF COMO CLAVE PRIMARIA ÚNICA)
CREATE TABLE IF NOT EXISTS public.facturas_cabecera (
  cuf character varying(100) NOT NULL,
  archivo_pdf character varying(255) NULL,
  tipo_documento character varying(50) NULL,
  nro_interno character varying(50) NULL,
  dato_especifico character varying(100) NULL,
  es_dhl integer NULL,
  estado_extraccion character varying(50) NULL,
  numero_factura character varying(50) NULL,
  fecha_emision character varying(50) NULL,
  estado character varying(20) NULL,
  nit_emisor character varying(30) NULL,
  razon_social_emisor character varying(255) NULL,
  direccion_emisor text NULL,
  cliente_nombre character varying(255) NULL,
  cliente_documento character varying(50) NULL,
  monto_total numeric(12, 2) NULL,
  suma_items numeric(12, 2) NULL,
  cuadra integer NULL,
  detalle_items_texto text NULL,
  detalle_items_json jsonb NULL,
  fecha_registro timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT facturas_cabecera_pkey PRIMARY KEY (cuf)
);

-- 2. TABLA PRINCIPAL 'facturas'
CREATE TABLE IF NOT EXISTS public.facturas (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  created_at timestamp with time zone NULL DEFAULT now(),
  importacion_id bigint NULL,
  tipo text NULL,
  fecha text NULL,
  nit text NULL,
  nombre text NULL,
  n_factura text NULL,
  monto numeric NULL,
  codigo_qr text NULL,
  consecutivo numeric NULL,
  ref_guia text NULL,
  doc_aduanero text NULL,
  registro_aduanero text NULL,
  productos text NULL,
  cuf text NULL,
  CONSTRAINT facturas_pkey PRIMARY KEY (id),
  CONSTRAINT fk_facturas_importaciones FOREIGN KEY (importacion_id) REFERENCES importaciones (id) ON DELETE SET NULL
);

-- 3. REGLAS E ÍNDICES DE UNICIDAD EN 'facturas'
CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_codigo_qr ON public.facturas USING btree (codigo_qr)
WHERE (codigo_qr IS NOT NULL AND codigo_qr <> ''::text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_cuf ON public.facturas USING btree (cuf)
WHERE (cuf IS NOT NULL AND cuf <> ''::text);

-- 4. FUNCIÓN TRIGGER AUTOMÁTICA: DE 'facturas_cabecera' HACIA 'facturas'
CREATE OR REPLACE FUNCTION public.tg_sync_cabecera_a_facturas_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_consecutivo numeric;
    v_importacion_id bigint;
    v_existing_id uuid;
    v_productos_str text;
    v_qr_url text;
    v_cuf_key text;
BEGIN
    v_cuf_key := NEW.cuf;

    -- Formatear detalle de productos a texto JSON
    IF NEW.detalle_items_json IS NOT NULL THEN
        v_productos_str := NEW.detalle_items_json::text;
    ELSE
        v_productos_str := NEW.detalle_items_texto;
    END IF;

    -- Formatear codigo_qr a enlace URL SIAT completo (nit, cuf, numero)
    IF NEW.cuf LIKE 'http%' THEN
        v_qr_url := NEW.cuf;
    ELSIF NEW.numero_factura IS NOT NULL AND NEW.numero_factura <> '' AND NEW.numero_factura <> 'No encontrado' THEN
        v_qr_url := 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(NEW.nit_emisor, '') 
                 || '&cuf=' || NEW.cuf 
                 || '&numero=' || NEW.numero_factura;
    ELSE
        v_qr_url := 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(NEW.nit_emisor, '') 
                 || '&cuf=' || NEW.cuf;
    END IF;

    -- Buscar si ya existe en 'facturas' por CUF, por QR o por N° Factura + NIT
    SELECT id INTO v_existing_id
    FROM public.facturas
    WHERE (cuf IS NOT NULL AND cuf <> '' AND cuf = v_cuf_key)
       OR (codigo_qr IS NOT NULL AND codigo_qr <> '' AND (codigo_qr = v_qr_url OR codigo_qr = v_cuf_key))
       OR (n_factura IS NOT NULL AND n_factura = NEW.numero_factura AND nit IS NOT NULL AND nit = NEW.nit_emisor AND NEW.numero_factura <> '')
    LIMIT 1;

    -- Vincular importacion_id por nro_interno
    IF NEW.nro_interno IS NOT NULL AND NEW.nro_interno <> '' THEN
        SELECT id INTO v_importacion_id
        FROM public.importaciones
        WHERE n_referencia = NEW.nro_interno
        LIMIT 1;
    END IF;

    -- SI YA EXISTE EN 'facturas', ACTUALIZAR
    IF v_existing_id IS NOT NULL THEN
        UPDATE public.facturas
        SET
            tipo = COALESCE(NEW.tipo_documento, tipo, 'FACTURA'),
            fecha = COALESCE(NEW.fecha_emision, fecha),
            nit = COALESCE(NEW.nit_emisor, nit),
            nombre = COALESCE(NEW.razon_social_emisor, NEW.cliente_nombre, nombre),
            n_factura = COALESCE(NEW.numero_factura, n_factura),
            monto = COALESCE(NEW.monto_total, monto),
            codigo_qr = v_qr_url,
            doc_aduanero = COALESCE(NEW.dato_especifico, doc_aduanero),
            registro_aduanero = COALESCE(NEW.dato_especifico, registro_aduanero),
            ref_guia = CASE WHEN NEW.nro_interno ~ '^\d{3,4}-\d{2}$' THEN NEW.nro_interno ELSE ref_guia END,
            importacion_id = COALESCE(v_importacion_id, importacion_id),
            productos = COALESCE(v_productos_str, productos),
            cuf = v_cuf_key
        WHERE id = v_existing_id;
    ELSE
        -- SI NO EXISTE, CALCULAR CONSECUTIVO E INSERTAR EN 'facturas'
        SELECT COALESCE(MAX(consecutivo), 0) + 1 INTO v_consecutivo FROM public.facturas;

        INSERT INTO public.facturas (
            consecutivo,
            tipo,
            fecha,
            nit,
            nombre,
            n_factura,
            monto,
            codigo_qr,
            ref_guia,
            doc_aduanero,
            registro_aduanero,
            importacion_id,
            productos,
            cuf
        ) VALUES (
            v_consecutivo,
            COALESCE(NEW.tipo_documento, 'FACTURA'),
            COALESCE(NEW.fecha_emision, to_char(now(), 'YYYY-MM-DD')),
            NEW.nit_emisor,
            COALESCE(NEW.razon_social_emisor, NEW.cliente_nombre, 'DESCONOCIDO'),
            NEW.numero_factura,
            COALESCE(NEW.monto_total, 0),
            v_qr_url,
            CASE WHEN NEW.nro_interno ~ '^\d{3,4}-\d{2}$' THEN NEW.nro_interno ELSE NULL END,
            NEW.dato_especifico,
            NEW.dato_especifico,
            v_importacion_id,
            v_productos_str,
            v_cuf_key
        );
    END IF;

    -- REGISTRAR O ACTUALIZAR EN 'estado_facturas'
    BEGIN
        INSERT INTO public.estado_facturas (factura_id, cuf, estado_siat)
        SELECT f.id, v_cuf_key, COALESCE(NEW.estado, 'VALIDA')
        FROM public.facturas f
        WHERE f.cuf = v_cuf_key OR f.codigo_qr = v_qr_url
        LIMIT 1
        ON CONFLICT (factura_id) DO UPDATE SET estado_siat = EXCLUDED.estado_siat;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NEW;
END;
$$;

-- 5. ASIGNAR EL TRIGGER A 'facturas_cabecera'
DROP TRIGGER IF EXISTS trg_sync_cabecera_a_facturas ON public.facturas_cabecera;

CREATE TRIGGER trg_sync_cabecera_a_facturas
AFTER INSERT OR UPDATE ON public.facturas_cabecera
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_cabecera_a_facturas_fn();
