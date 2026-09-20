-- =====================================================================
-- REPARAR CAMPO 'codigo_qr' EN LA TABLA 'facturas' DE SUPABASE
-- Formato exacto oficial SIAT: nit, cuf, numero
-- =====================================================================

UPDATE public.facturas
SET codigo_qr = CASE 
    WHEN n_factura IS NOT NULL AND n_factura <> '' AND n_factura <> 'No encontrado' THEN
        'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit, '') 
        || '&cuf=' || COALESCE(cuf, codigo_qr) 
        || '&numero=' || n_factura
    ELSE
        'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit, '') 
        || '&cuf=' || COALESCE(cuf, codigo_qr)
END
WHERE (codigo_qr NOT LIKE 'http%' OR codigo_qr IS NULL OR codigo_qr LIKE '%&monto=%')
  AND (cuf IS NOT NULL OR nit IS NOT NULL);
