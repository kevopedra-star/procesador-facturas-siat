-- ============================================================================
-- SCRIPT SQL: AGREGAR COLUMNAS 'canal' Y 'fecha_canal' A v_matriz_liquidacion_horizontal
-- ============================================================================
-- Solución al error Postgres 42P16 (cannot change name of view column):
-- Se realiza DROP VIEW CASCADE para recrear la estructura con las nuevas columnas.
-- ============================================================================

-- 1. Eliminar primero la vista previa para permitir la nueva estructura de columnas
DROP VIEW IF EXISTS public.v_matriz_liquidacion_horizontal CASCADE;

-- 2. Recrear la vista incluyendo las columnas canal y fecha_canal
CREATE OR REPLACE VIEW public.v_matriz_liquidacion_horizontal AS
SELECT 
    m.interno AS INTERNO,
    m.importacion_id,
    coalesce(m.fecha_dim, '-') AS FECHA_DIM,
    coalesce(m.mes, '-') AS MES, 
    coalesce(m.nit_cliente, '-') AS NIT_CLIENTE, 
    coalesce(m.dim_n_ro, '-') AS DIM_N_RO,
    coalesce(m.modalidad, '-') AS MODALIDAD,
    coalesce(m.dim_reg, '-') AS DIM_REG,
    coalesce(m.oi, '-') AS OI,
    coalesce(m.tipo_cambio, '-') AS TIPO_CAMBIO,
    coalesce(m.cif_usd, '-') AS CIF_USD,
    coalesce(m.porcentaje_comision, '-') AS PORCENTAJE_COMISION,
    coalesce(m.valor_cif_bs, '-') AS VALOR_CIF_BS,
    coalesce(to_char(m.comision_bob, 'FM9999990.00'), '-') AS COMISION_BS,
    coalesce(to_char(m.gravamen, 'FM9999990.00'), '-') AS GRAVAMEN,
    coalesce(to_char(m.iva, 'FM9999990.00'), '-') AS IVA,
    coalesce(to_char(m.total_tributos, 'FM9999990.00'), '-') AS TOTAL_TRIBUTOS,
    
    -- 🟢 🟡 🔴 COLUMNAS SOLICITADAS: CANAL Y FECHA DE CANAL DE CONTROL_ESTADOS_IMPORTACION
    c.canal AS canal,
    c.fecha_canal AS fecha_canal,
    
    -- PLANILLA EXCEL
    coalesce(m.ref_excel, '-') AS REF_EXCEL,
    coalesce(m.fecha_excel, '-') AS FECHA_EXCEL,
    coalesce(to_char(m.debito_excel, 'FM9999990.00'), '-') AS DEBITO_EXCEL,
    
    -- VERIFICACIONES
    coalesce(m.verificado_suma, 'NO VERIFICADO') AS VERIFICADO_SUMA,
    coalesce(m.verificado_saldos, 'NO VERIFICADO') AS VERIFICADO_SALDOS,
    
    -- ALBO / DAB
    coalesce(to_char(m.albo_monto, 'FM9999990.00'), '-') AS "ALBO - DAB MONTO",
    coalesce(m.albo_factura, '-') AS ALBO_FACTURA,
    coalesce(m.albo_fecha, '-') AS ALBO_FECHA,
    coalesce(m.albo_enlace, '-') AS ENLACE_ALBO,
    coalesce(m.albo_cod, '-') AS "ALBO COD",
    coalesce(m.albo_n_declaracion_imp, '-') AS "n_declaracion (importaciones)",
    coalesce(m.albo_doc_aduanero_fac, '-') AS "doc_aduanero (facturas)",
    coalesce(m.albo_verificado, '-') AS "verificado albo",
    
    -- INSPECCION PREVIA (IP)
    coalesce(to_char(m.ip_monto, 'FM9999990.00'), '-') AS IP_MONTO,
    coalesce(m.ip_factura, '-') AS IP_FACTURA,
    coalesce(m.ip_fecha, '-') AS IP_FECHA,
    coalesce(m.ip_enlace, '-') AS IP_ALBO,
    coalesce(m.ip_cod, '-') AS "IP COD",
    coalesce(m.ip_examen_previo_imp, '-') AS "examen_previo (importaciones)",
    coalesce(m.ip_doc_aduanero_fac, '-') AS "doc_aduanero (facturas) ", 
    coalesce(m.ip_verificado, '-') AS "verificado ip",
    
    -- GUÍAS
    coalesce(to_char(m.guias_monto, 'FM9999990.00'), '-') AS GUIAS_MONTO,
    coalesce(m.guias_factura, '-') AS GUIAS_FACTURA,
    coalesce(m.guias_fecha, '-') AS GUIAS_FECHA,
    coalesce(m.guias_enlace, '-') AS GUIAS_ALBO,
    coalesce(m.guias_cod, '-') AS "GUIAS COD",
    coalesce(m.guias_guia_embarque_imp, '-') AS "guia_embarque (importaciones)",
    coalesce(m.guias_ref_guia_fac, '-') AS "ref_guia (facturas)",
    coalesce(m.guias_verificado, '-') AS "verificado guia",
    
    -- PUERTOS
    coalesce(to_char(m.puertos_monto, 'FM9999990.00'), '-') AS PUERTOS_MONTO,
    coalesce(puertos_comprobante, '-') AS PUERTO_COMPROBANTE,
    coalesce(puertos_fecha, '-') AS PUERTO_FECHA,
    
    -- OTROS
    coalesce(to_char(m.otros_monto, 'FM9999990.00'), '-') AS OTRO_MONTO,
    coalesce(otros_factura, '-') AS OTRO_FACTURA,
    coalesce(otros_fecha, '-') AS OTRO_FECHA,
    coalesce(otros_enlace, '-') AS OTRO_ALBO,
    coalesce(otros_cod, '-') AS "OTRO COD"
FROM public.mtodo m
LEFT JOIN public.control_estados_importacion c 
       ON (m.interno = c.n_referencia OR m.dim_n_ro = c.n_declaracion);

-- 3. Restablecer permisos de lectura
GRANT SELECT ON public.v_matriz_liquidacion_horizontal TO anon, authenticated, service_role;
