-- =====================================================================
-- AÑADIR COLUMNA 'enlace_qr' A 'facturas_cabecera' Y 'facturas'
-- Y ACTUALIZAR EL DISPARADOR (TRIGGER) AUTOMÁTICO
-- =====================================================================

-- 1. Añadir columna 'enlace_qr' a 'facturas_cabecera' si no existe
ALTER TABLE public.facturas_cabecera ADD COLUMN IF NOT EXISTS enlace_qr text;

-- 2. Añadir columna 'enlace_qr' a 'facturas' si no existe
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS enlace_qr text;

-- 3. Actualizar la función Trigger para copiar enlace_qr de cabecera a facturas
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

    IF NEW.detalle_items_json IS NOT NULL THEN
        v_productos_str := NEW.detalle_items_json::text;
    ELSE
        v_productos_str := NEW.detalle_items_texto;
    END IF;

    -- Usar NEW.enlace_qr si ya viene poblado, o construirlo con nit, cuf, numero
    IF NEW.enlace_qr IS NOT NULL AND NEW.enlace_qr LIKE 'http%' THEN
        v_qr_url := NEW.enlace_qr;
    ELSIF NEW.cuf LIKE 'http%' THEN
        v_qr_url := NEW.cuf;
    ELSIF NEW.numero_factura IS NOT NULL AND NEW.numero_factura <> '' AND NEW.numero_factura <> 'No encontrado' THEN
        v_qr_url := 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(NEW.nit_emisor, '') 
                 || '&cuf=' || NEW.cuf 
                 || '&numero=' || NEW.numero_factura;
    ELSE
        v_qr_url := 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(NEW.nit_emisor, '') 
                 || '&cuf=' || NEW.cuf;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.facturas
    WHERE (cuf IS NOT NULL AND cuf <> '' AND cuf = v_cuf_key)
       OR (codigo_qr IS NOT NULL AND codigo_qr <> '' AND (codigo_qr = v_qr_url OR codigo_qr = v_cuf_key))
       OR (n_factura IS NOT NULL AND n_factura = NEW.numero_factura AND nit IS NOT NULL AND nit = NEW.nit_emisor AND NEW.numero_factura <> '')
    LIMIT 1;

    IF NEW.nro_interno IS NOT NULL AND NEW.nro_interno <> '' THEN
        SELECT id INTO v_importacion_id
        FROM public.importaciones
        WHERE n_referencia = NEW.nro_interno
        LIMIT 1;
    END IF;

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
            enlace_qr = v_qr_url,
            doc_aduanero = COALESCE(NEW.dato_especifico, doc_aduanero),
            registro_aduanero = COALESCE(NEW.dato_especifico, registro_aduanero),
            ref_guia = CASE WHEN NEW.nro_interno ~ '^\d{3,4}-\d{2}$' THEN NEW.nro_interno ELSE ref_guia END,
            importacion_id = COALESCE(v_importacion_id, importacion_id),
            productos = COALESCE(v_productos_str, productos),
            cuf = v_cuf_key
        WHERE id = v_existing_id;
    ELSE
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
            enlace_qr,
            doc_aduanero,
            registro_aduanero,
            ref_guia,
            importacion_id,
            productos,
            cuf
        ) VALUES (
            v_consecutivo,
            COALESCE(NEW.tipo_documento, 'FACTURA'),
            NEW.fecha_emision,
            NEW.nit_emisor,
            COALESCE(NEW.razon_social_emisor, NEW.cliente_nombre),
            NEW.numero_factura,
            NEW.monto_total,
            v_qr_url,
            v_qr_url,
            NEW.dato_especifico,
            NEW.dato_especifico,
            CASE WHEN NEW.nro_interno ~ '^\d{3,4}-\d{2}$' THEN NEW.nro_interno ELSE NULL END,
            v_importacion_id,
            v_productos_str,
            v_cuf_key
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Rellenar 'enlace_qr' en registros existentes
UPDATE public.facturas_cabecera
SET enlace_qr = CASE 
    WHEN numero_factura IS NOT NULL AND numero_factura <> '' AND numero_factura <> 'No encontrado' THEN
        'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit_emisor, '') || '&cuf=' || cuf || '&numero=' || numero_factura
    ELSE
        'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit_emisor, '') || '&cuf=' || cuf
END
WHERE (enlace_qr IS NULL OR enlace_qr NOT LIKE 'http%') AND cuf IS NOT NULL;

UPDATE public.facturas
SET enlace_qr = COALESCE(codigo_qr, 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit, '') || '&cuf=' || COALESCE(cuf, '') || '&numero=' || COALESCE(n_factura, ''))
WHERE enlace_qr IS NULL OR enlace_qr NOT LIKE 'http%';
