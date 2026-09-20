-- =====================================================================
-- REPARAR CAMPO 'codigo_qr' EN LA TABLA 'facturas' DE SUPABASE
-- Convierte cualquier CUF suelto en el enlace completo oficial de SIAT
-- =====================================================================

UPDATE public.facturas
SET codigo_qr = 'https://siat.impuestos.gob.bo/consulta/QR?nit=' || COALESCE(nit, '') 
             || '&cuf=' || COALESCE(cuf, codigo_qr) 
             || '&numero=' || COALESCE(n_factura, '') 
             || '&monto=' || COALESCE(monto::text, '0') 
             || '&fecha=' || COALESCE(fecha, '')
WHERE (codigo_qr NOT LIKE 'http%' OR codigo_qr IS NULL)
  AND (cuf IS NOT NULL OR nit IS NOT NULL);
