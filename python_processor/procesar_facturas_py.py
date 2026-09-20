#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
=============================================================================
PROCESADOR PROFESIONAL DE FACTURAS SIAT EN PDF (SISTEMA DE EXTRACCIÓN CON 5 REINTENTOS)
=============================================================================
Mantiene la estructura oficial del sistema, incorporando un mecanismo robusto de 
hasta 5 reintentos progresivos por factura cuando algún dato (QR, SIAT o dato específico)
no es detectado en la primera lectura.
=============================================================================
"""

import os
import sys
import requests
import cv2
import time
import re
import json
import sqlite3
import shutil
import numpy as np
import fitz  # PyMuPDF
import easyocr
from datetime import datetime
import pandas as pd
import tkinter as tk
from tkinter import filedialog

try:
    from pyzbar.pyzbar import decode as decode_zbar
except Exception:
    decode_zbar = None

from openpyxl.styles import PatternFill

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from supabase import create_client, Client

DB_NAME = "facturas_siat.db"
SQL_DUMP_NAME = "facturas_dump.sql"
EXCEL_NAME = "Reporte_Facturas_SIAT.xlsx"

SUPABASE_URL = "https://sfqpptquojlsbeheguff.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcXBwdHF1b2psc2JlaGVndWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzgzNzAsImV4cCI6MjEwNDgxNDM3MH0.h-wOCnoz6KW8CdGBRowuWJIvknk_sEJ-_2HLx7SC1ek"

print("🧠 Inicializando motor de Inteligencia Artificial EasyOCR...")
lector_ia = easyocr.Reader(['es', 'en'], gpu=False)


# =====================================================================
# 1. VISIÓN ARTIFICIAL Y PARSEO CON REINTENTOS PROGRESIVOS
# =====================================================================
def extraer_datos_nombre_archivo(nombre_archivo):
    nombre_limpio = os.path.splitext(nombre_archivo)[0]
    partes = nombre_limpio.split()
    nom_upper = nombre_archivo.upper()

    tipo_doc = "OTRO"
    if "ALBO IP" in nom_upper or "ALBO-IP" in nom_upper or "ALBO_IP" in nom_upper or ("ALBO" in nom_upper and "IP" in nom_upper):
        tipo_doc = "ALBO IP"
    elif "ALBO" in nom_upper:
        tipo_doc = "ALBO"
    elif "DAB" in nom_upper:
        tipo_doc = "DAB"
    elif "GUIA" in nom_upper or "GUÍA" in nom_upper:
        tipo_doc = "GUIA"
    elif partes:
        tipo_doc = partes[0].upper()

    match_interno = re.search(r'(\d+[A-Z]*-\d+)', nombre_limpio)
    if match_interno:
        nro_interno = match_interno.group(1)
    elif len(partes) > 1:
        nro_interno = partes[1]
    else:
        nro_interno = "N/D"

    return tipo_doc, nro_interno


def decodificar_qr_robusto(ruta_pdf, intento=1):
    """
    Decodifica el QR aplicando 5 niveles de tolerancia, rotaciones y escalas según el intento.
    """
    try:
        doc = fitz.open(ruta_pdf)
        detector_cv = cv2.QRCodeDetector()

        escalas_map = {
            1: [2.5, 3.5, 4.0],
            2: [3.0, 4.5, 5.0],
            3: [2.0, 3.0, 6.0],
            4: [3.5, 4.0, 5.5],
            5: [2.0, 2.5, 3.0, 4.0, 5.0]
        }
        escalas = escalas_map.get(intento, [2.5, 3.5, 4.0])

        for page in doc:
            for escala in escalas:
                matriz = fitz.Matrix(escala, escala)
                pix = page.get_pixmap(matrix=matriz)
                img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_BGRA2BGR) if pix.n == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                gris = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

                filtros = [
                    img_bgr,
                    gris,
                    cv2.createCLAHE(clipLimit=2.0 + (intento * 0.4), tileGridSize=(8, 8)).apply(gris),
                    cv2.threshold(gris, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
                ]

                if intento >= 3:
                    for angulo in [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE]:
                        filtros.append(cv2.rotate(gris, angulo))

                for f in filtros:
                    if decode_zbar:
                        res_zbar = decode_zbar(f)
                        for r in res_zbar:
                            txt = r.data.decode("utf-8", errors="ignore")
                            if "siat.impuestos.gob.bo" in txt:
                                doc.close()
                                return txt

                    url_cv, _, _ = detector_cv.detectAndDecode(f)
                    if url_cv and "siat.impuestos.gob.bo" in url_cv:
                        doc.close()
                        return url_cv
        doc.close()
    except Exception:
        pass
    return None


def corregir_errores_ocr(cand):
    if not cand:
        return None
    c = cand.upper().replace(' ', '').replace('.', '-').replace('_', '-')

    m_split = re.search(r'([DO0][S5][\.\-][2Z][0O][2Z][0-9EGB][\.\-][0-9SOIB]+[\.\-][0-9SOIB]+)', c)
    if m_split:
        bloque = m_split.group(1).replace('.', '-')
        partes = [p for p in bloque.split('-') if p]
        if len(partes) >= 4:
            p0 = "DS"
            p1 = partes[1].replace('O', '0').replace('E', '6').replace('G', '6').replace('B', '8').replace('Z', '2')
            p2 = partes[2].replace('O', '0').replace('S', '5').replace('I', '1').replace('B', '8')
            p3 = partes[3].replace('O', '0').replace('S', '5').replace('I', '1').replace('B', '8')
            return f"{p0}-{p1}-{p2}-{p3}"

    m_num = re.search(r'\b(\d{13,16})\b', c)
    if m_num:
        val = m_num.group(1)
        if val not in ["1020415021", "1020235024", "120585022", "1000899025", "1005549022"]:
            return val

    m_dim = re.search(r'\b(\d{6,8}[A-Z]\d{6,8})\b', c)
    if m_dim:
        return m_dim.group(1)

    return None


def extraer_dato_especifico_con_ia(ruta_pdf, tipo_doc, emisor, intento=1):
    try:
        doc = fitz.open(ruta_pdf)
        page = doc[0]
        escala_val = 3.0 + (intento - 1) * 0.5
        matriz = fitz.Matrix(escala_val, escala_val)
        pix = page.get_pixmap(matrix=matriz)
        img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_BGRA2BGR) if pix.n == 4 else cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        doc.close()
    except Exception as e:
        print(f"    [Error al renderizar]: {e}")
        return "N/D", False

    h, w, _ = img_bgr.shape
    recorte_zona = img_bgr[int(h * 0.50):int(h * 0.95), 0:w]
    gray_recorte = cv2.cvtColor(recorte_zona, cv2.COLOR_BGR2GRAY)

    filtros_ia = [
        recorte_zona,
        gray_recorte,
        cv2.createCLAHE(clipLimit=2.5 + (intento * 0.3), tileGridSize=(8, 8)).apply(gray_recorte),
        cv2.threshold(gray_recorte, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1],
        img_bgr
    ]

    es_dhl = True if ("DHL" in (emisor or "").upper() or "DHL" in ruta_pdf.upper()) else False

    for nro_intento, img_tratada in enumerate(filtros_ia, 1):
        resultados_ocr = lector_ia.readtext(img_tratada)
        textos_leidos = [r[1].strip() for r in resultados_ocr if r[1].strip()]

        if tipo_doc in ["ALBO", "ALBO IP"] or "ALMACENERA" in (emisor or "").upper():
            for t in textos_leidos:
                m_directo = re.search(r'\b(\d{13,16})\b', t.replace(" ", ""))
                if m_directo:
                    val = m_directo.group(1)
                    if val not in ["1020415021", "1020235024", "120585022", "1000899025"]:
                        return val, es_dhl

                res_corregido = corregir_errores_ocr(t)
                if res_corregido:
                    return res_corregido, es_dhl

        elif tipo_doc == "DAB" or "DEPÓSITOS" in (emisor or "").upper():
            for t in textos_leidos:
                m_sal = re.search(r'\b(\d{3}[A-Z]\d{10,12})\b', t.replace(" ", ""))
                if m_sal:
                    return m_sal.group(1), es_dhl

        elif tipo_doc == "GUIA" or "DEZE" in (emisor or "").upper() or es_dhl:
            for t in textos_leidos:
                if es_dhl:
                    m_man = re.search(r'(?:MAN|AWB)[:\s]*([0-9]{8,15})', t, re.IGNORECASE)
                    if m_man:
                        return m_man.group(1), es_dhl
                else:
                    m_hawb = re.search(r'HAWB[:\s]*([A-Z0-9]{6,16})', t, re.IGNORECASE)
                    if m_hawb:
                        return m_hawb.group(1), es_dhl

        if nro_intento < 5:
            print(f"    [Intento IA {nro_intento}/5] Analizando con realce óptico...")

    return "N/D", es_dhl


# =====================================================================
# 2. BASE DE DATOS LOCAL Y EXPORTACIONES
# =====================================================================
def inicializar_base_datos():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facturas_cabecera (
        cuf TEXT PRIMARY KEY,
        archivo_pdf TEXT,
        tipo_documento TEXT,
        nro_interno TEXT,
        dato_especifico TEXT,
        es_dhl INTEGER,
        estado_extraccion TEXT,
        numero_factura TEXT,
        fecha_emision TEXT,
        estado TEXT,
        nit_emisor TEXT,
        razon_social_emisor TEXT,
        direccion_emisor TEXT,
        cliente_nombre TEXT,
        cliente_documento TEXT,
        monto_total REAL,
        suma_items REAL,
        cuadra INTEGER,
        detalle_items_texto TEXT,
        detalle_items_json TEXT,
        fecha_registro TEXT
    )
    """)

    cursor.execute("PRAGMA table_info(facturas_cabecera)")
    cols = [col[1] for col in cursor.fetchall()]
    columnas_a_verificar = [
        ("archivo_pdf", "TEXT"),
        ("tipo_documento", "TEXT"),
        ("nro_interno", "TEXT"),
        ("dato_especifico", "TEXT"),
        ("es_dhl", "INTEGER"),
        ("estado_extraccion", "TEXT"),
        ("detalle_items_texto", "TEXT"),
        ("detalle_items_json", "TEXT")
    ]
    for nombre_col, tipo_col in columnas_a_verificar:
        if nombre_col not in cols:
            cursor.execute(f"ALTER TABLE facturas_cabecera ADD COLUMN {nombre_col} {tipo_col}")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facturas_detalle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuf_factura TEXT,
        codigo_producto TEXT,
        descripcion TEXT,
        cantidad REAL,
        precio_unitario REAL,
        subtotal REAL,
        FOREIGN KEY (cuf_factura) REFERENCES facturas_cabecera(cuf)
    )
    """)
    conn.commit()
    conn.close()


def formatear_items_a_texto(items):
    lineas = []
    for idx, it in enumerate(items, 1):
        lineas.append(
            f"[{idx}] (Cod: {it['codigo']}) {it['descripcion']} | "
            f"Cant: {it['cantidad']} | P.Unit: {it['precio_unitario']} | Subt: {it['subtotal']}"
        )
    return " \n".join(lineas)


def guardar_factura_en_bd(datos, metadata_archivo):
    det = datos["detalle_factura"]
    emi = datos["datos_emisor"]
    cli = datos["datos_cliente"]
    items = datos["items"]
    cuf = det["cuf"] or f"TEMP_{metadata_archivo['tipo_documento']}_{metadata_archivo['nro_interno']}_{int(time.time())}"
    cuadra = 1 if abs(datos["suma_subtotales"] - datos["monto_total_num"]) < 0.01 else 0

    items_texto = formatear_items_a_texto(items)
    items_json = json.dumps(items, ensure_ascii=False)

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
    INSERT OR REPLACE INTO facturas_cabecera (
        cuf, archivo_pdf, tipo_documento, nro_interno, dato_especifico, es_dhl, estado_extraccion,
        numero_factura, fecha_emision, estado, nit_emisor,
        razon_social_emisor, direccion_emisor, cliente_nombre,
        cliente_documento, monto_total, suma_items, cuadra,
        detalle_items_texto, detalle_items_json, fecha_registro
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        cuf,
        metadata_archivo["archivo_pdf"],
        metadata_archivo["tipo_documento"],
        metadata_archivo["nro_interno"],
        metadata_archivo["dato_especifico"],
        1 if metadata_archivo["es_dhl"] else 0,
        metadata_archivo["estado_extraccion"],
        det["numero_factura"],
        det["fecha_emision"],
        det["estado"],
        emi["nit_emisor"],
        emi["razon_social"],
        emi["direccion"],
        cli["nombre_razon_social"],
        cli["numero_documento"],
        datos["monto_total_num"],
        datos["suma_subtotales"],
        cuadra,
        items_texto,
        items_json,
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))

    cursor.execute("DELETE FROM facturas_detalle WHERE cuf_factura = ?", (cuf,))

    for it in items:
        cursor.execute("""
        INSERT INTO facturas_detalle (
            cuf_factura, codigo_producto, descripcion, cantidad, precio_unitario, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            cuf,
            it["codigo"],
            it["descripcion"],
            limpiar_monto(it["cantidad"]),
            limpiar_monto(it["precio_unitario"]),
            it["subtotal_num"]
        ))

    conn.commit()
    conn.close()
    return cuf


def escapar_sql(valor):
    if valor is None:
        return "NULL"
    if isinstance(valor, (int, float)):
        return str(valor)
    texto = str(valor).replace("'", "''")
    return "'" + texto + "'"


def generar_archivo_dump_sql(archivo_salida=SQL_DUMP_NAME):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    lineas = [
        "-- ========================================================",
        "-- DUMP SQL: SISTEMA DE FACTURACIÓN ELECTRÓNICA SIAT",
        f"-- Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "-- ========================================================\n",
        "CREATE TABLE IF NOT EXISTS facturas_cabecera (",
        "    cuf VARCHAR(100) PRIMARY KEY,",
        "    archivo_pdf VARCHAR(255),",
        "    tipo_documento VARCHAR(50),",
        "    nro_interno VARCHAR(50),",
        "    dato_especifico VARCHAR(100),",
        "    es_dhl BOOLEAN,",
        "    estado_extraccion VARCHAR(50),",
        "    numero_factura VARCHAR(50) NOT NULL,",
        "    fecha_emision VARCHAR(50),",
        "    estado VARCHAR(20),",
        "    nit_emisor VARCHAR(30),",
        "    razon_social_emisor VARCHAR(255),",
        "    direccion_emisor TEXT,",
        "    cliente_nombre VARCHAR(255),",
        "    cliente_documento VARCHAR(50),",
        "    monto_total DECIMAL(12, 2) NOT NULL,",
        "    suma_items DECIMAL(12, 2) NOT NULL,",
        "    cuadra BOOLEAN NOT NULL,",
        "    detalle_items_texto TEXT,",
        "    detalle_items_json TEXT,",
        "    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        ");\n",
        "CREATE TABLE IF NOT EXISTS facturas_detalle (",
        "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "    cuf_factura VARCHAR(100) NOT NULL,",
        "    codigo_producto VARCHAR(50),",
        "    descripcion TEXT,",
        "    cantidad DECIMAL(10, 2),",
        "    precio_unitario DECIMAL(12, 2),",
        "    subtotal DECIMAL(12, 2),",
        "    FOREIGN KEY (cuf_factura) REFERENCES facturas_cabecera(cuf) ON DELETE CASCADE",
        ");\n"
    ]

    cursor.execute("SELECT * FROM facturas_cabecera")
    for c in cursor.fetchall():
        valores = [escapar_sql(item) for item in c]
        lineas.append(f"INSERT OR REPLACE INTO facturas_cabecera VALUES ({', '.join(valores)});")

    cursor.execute("SELECT cuf_factura, codigo_producto, descripcion, cantidad, precio_unitario, subtotal FROM facturas_detalle")
    for d in cursor.fetchall():
        cuf, cod, desc, cant, pu, sub = d
        desc_escapada = str(desc).replace("'", "''")
        lineas.append(
            f"INSERT INTO facturas_detalle (cuf_factura, codigo_producto, descripcion, cantidad, precio_unitario, subtotal) "
            f"VALUES ('{cuf}', '{cod}', '{desc_escapada}', {cant}, {pu}, {sub});"
        )

    conn.close()
    with open(archivo_salida, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    print(f"\n Script SQL Dump actualizado: '{archivo_salida}'")


def exportar_todo_a_excel(nombre_archivo=EXCEL_NAME):
    conn = sqlite3.connect(DB_NAME)
    df_cabecera = pd.read_sql_query("SELECT * FROM facturas_cabecera", conn)
    df_detalle = pd.read_sql_query("SELECT * FROM facturas_detalle", conn)

    if df_cabecera.empty:
        conn.close()
        return

    df_unificado = pd.merge(df_detalle, df_cabecera, left_on="cuf_factura", right_on="cuf", how="inner")

    with pd.ExcelWriter(nombre_archivo, engine="openpyxl") as writer:
        df_cabecera.to_excel(writer, sheet_name="Cabecera (Items Juntos)", index=False)
        df_detalle.to_excel(writer, sheet_name="Detalle Desglosado", index=False)
        df_unificado.to_excel(writer, sheet_name="Sábana Plana Completa", index=False)

        wb = writer.book
        amarillo = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
        rojo_suave = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")

        ws1 = wb["Cabecera (Items Juntos)"]
        col_es_dhl = None
        col_estado = None
        for col_idx, cell in enumerate(ws1[1], 1):
            if cell.value == "es_dhl":
                col_es_dhl = col_idx
            elif cell.value == "estado_extraccion":
                col_estado = col_idx
        
        for row in range(2, ws1.max_row + 1):
            if col_es_dhl and ws1.cell(row=row, column=col_es_dhl).value in (1, "1", True):
                for col in range(1, ws1.max_column + 1):
                    ws1.cell(row=row, column=col).fill = amarillo
            elif col_estado and "ADVERTENCIA" in str(ws1.cell(row=row, column=col_estado).value):
                ws1.cell(row=row, column=col_estado).fill = rojo_suave

    conn.close()
    print(f" Consolidado Excel generado: '{nombre_archivo}'")


# =====================================================================
# 3. INSPECTOR VISUAL EN CONSOLA (TABLA LIMPIA)
# =====================================================================
def mostrar_inspeccion_detallada(datos, metadata_archivo):
    det = datos["detalle_factura"]
    emi = datos["datos_emisor"]
    cli = datos["datos_cliente"]
    items = datos["items"]
    total = datos["monto_total_num"]
    suma = datos["suma_subtotales"]
    cuadra = abs(suma - total) < 0.01

    dhl_str = "SÍ [RESALTADO EN AMARILLO]" if metadata_archivo['es_dhl'] else "NO"

    print("\n" + "╔" + "═" * 86 + "╗")
    print(f"║ 📋 REPORTE DE EXTRACCIÓN INTEGRAL: {metadata_archivo['archivo_pdf'][:45]:<47} ║")
    print("╠══════════════════════════════╦══════════════════════════════════════════════════════╣")
    print("║ CAMPO DESTINO (TABLA BD)     ║ VALOR EXACTO EXTRAÍDO                                ║")
    print("╠══════════════════════════════╬══════════════════════════════════════════════════════╣")
    print(f"║ tipo_documento               ║ {metadata_archivo['tipo_documento']:<52} ║")
    print(f"║ nro_interno                  ║ {metadata_archivo['nro_interno']:<52} ║")
    print(f"║ dato_especifico (OCR/Tránsito)║ {metadata_archivo['dato_especifico']:<52} ║")
    print(f"║ es_dhl                       ║ {dhl_str:<52} ║")
    print(f"║ estado_extraccion            ║ {metadata_archivo['estado_extraccion']:<52} ║")
    print("╠══════════════════════════════╬══════════════════════════════════════════════════════╣")
    print(f"║ numero_factura               ║ {det['numero_factura']:<52} ║")
    print(f"║ fecha_emision                ║ {det['fecha_emision']:<52} ║")
    print(f"║ estado                       ║ {det['estado']:<52} ║")
    print(f"║ cuf                          ║ {str(det['cuf'])[:50]:<52} ║")
    print("╠══════════════════════════════╬══════════════════════════════════════════════════════╣")
    print(f"║ nit_emisor                   ║ {emi['nit_emisor']:<52} ║")
    print(f"║ razon_social_emisor          ║ {emi['razon_social'][:50]:<52} ║")
    print(f"║ direccion_emisor             ║ {emi['direccion'][:50]:<52} ║")
    print("╠══════════════════════════════╬══════════════════════════════════════════════════════╣")
    print(f"║ cliente_nombre               ║ {cli['nombre_razon_social'][:50]:<52} ║")
    print(f"║ cliente_documento            ║ {cli['numero_documento']:<52} ║")
    print("╠══════════════════════════════╬══════════════════════════════════════════════════════╣")
    print(f"║ monto_total (SIAT)           ║ {total:>12.2f} Bs.                                       ║")
    print(f"║ suma_items (Suma Desglose)   ║ {suma:>12.2f} Bs.                                       ║")
    print(f"║ cuadra                       ║ {'1 (SÍ - EXACTO)' if cuadra else '0 (NO - DISCREPANCIA)':<52} ║")
    print("╠══════════════════════════════╩══════════════════════════════════════════════════════╣")
    print("║ 📦 DESGLOSE DE PRODUCTOS / SERVICIOS (Tabla: facturas_detalle)                        ║")
    print("╟──────┬────────┬──────────────────────────────────────────┬──────┬──────────┬─────────╢")
    print("║ Nro  │ Código │ Descripción                              │ Cant │ P. Unit. │ Subtotal║")
    print("╟──────┼────────┼──────────────────────────────────────────┼──────┼──────────┼─────────╢")
    for idx, it in enumerate(items, 1):
        cod = str(it['codigo'])[:6]
        desc = str(it['descripcion'])[:40]
        cant = str(it['cantidad'])[:4]
        pu = str(it['precio_unitario'])[:8]
        sub = it['subtotal_num']
        print(f"║ {idx:<4} │ {cod:<6} │ {desc:<40} │ {cant:>4} │ {pu:>8} │ {sub:>8.2f}║")
    print("╚══════╧════════╧══════════════════════════════════════════╧══════╧══════════╧═════════╝\n")


def seleccionar_archivos_pdf():
    carpeta_in = "facturas_in"
    if os.path.exists(carpeta_in) and len(os.listdir(carpeta_in)) > 0:
        archivos = [os.path.join(carpeta_in, f) for f in os.listdir(carpeta_in) if f.lower().endswith(".pdf")]
        if archivos:
            return archivos

    if len(sys.argv) > 1:
        rutas_cli = []
        for arg in sys.argv[1:]:
            if os.path.isdir(arg):
                for root_dir, _, files in os.walk(arg):
                    for file in sorted(files):
                        if file.lower().endswith(".pdf"):
                            rutas_cli.append(os.path.join(root_dir, file))
            elif os.path.exists(arg) and arg.lower().endswith(".pdf"):
                rutas_cli.append(arg)
        if rutas_cli:
            return rutas_cli

    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        archivos = filedialog.askopenfilenames(
            title="Selecciona las facturas en PDF a procesar",
            filetypes=[("Archivos PDF", "*.pdf")]
        )
        arch_list = list(archivos)
        if not arch_list:
            carpeta = filedialog.askdirectory(title="Selecciona la Carpeta Completa con Facturas PDF")
            if carpeta and os.path.exists(carpeta):
                for root_dir, _, files in os.walk(carpeta):
                    for file in sorted(files):
                        if file.lower().endswith(".pdf"):
                            arch_list.append(os.path.join(root_dir, file))
        root.destroy()
        return arch_list
    except Exception:
        return []


def limpiar_monto(texto_monto):
    if isinstance(texto_monto, (int, float)):
        return float(texto_monto)
    if not texto_monto:
        return 0.0
    limpio = str(texto_monto).replace('Bs.', '').replace('Bs', '').replace(',', '').strip()
    try:
        return float(limpio)
    except ValueError:
        return 0.0


# =====================================================================
# 4. EXTRACCIÓN SELENIUM (PORTAL SIAT)
# =====================================================================
def configurar_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)


def extraer_datos_siat(driver, url_factura):
    driver.get(url_factura)
    wait = WebDriverWait(driver, 15)
    wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Detalle de la Factura') or contains(text(), 'Estado') or contains(text(), 'Bs')]")))
    time.sleep(2)

    def obtener_texto_campo(etiqueta):
        xpath_intentos = [
            f"//*[contains(text(), '{etiqueta}')]/following-sibling::*[1]",
            f"//*[contains(text(), '{etiqueta}')]/..//following-sibling::*[1]",
            f"//*[contains(text(), '{etiqueta}')]/parent::*"
        ]
        for xp in xpath_intentos:
            elementos = driver.find_elements(By.XPATH, xp)
            if elementos:
                texto = elementos[0].text.strip()
                if etiqueta in texto:
                    texto = texto.replace(etiqueta, "").strip(" :\n\t")
                if texto:
                    return texto
        return "No encontrado"

    factura_data = {
        "detalle_factura": {
            "numero_factura": obtener_texto_campo("Número de Factura"),
            "fecha_emision": obtener_texto_campo("Fecha Emisión"),
            "estado": obtener_texto_campo("Estado de la Factura"),
            "cuf": obtener_texto_campo("CUF"),
            "monto_total_str": obtener_texto_campo("Monto Total")
        },
        "datos_emisor": {
            "nit_emisor": obtener_texto_campo("NIT Emisor"),
            "razon_social": obtener_texto_campo("Razón Social"),
            "direccion": obtener_texto_campo("Dirección")
        },
        "datos_cliente": {
            "nombre_razon_social": obtener_texto_campo("Nombre / Razón Social"),
            "numero_documento": obtener_texto_campo("Número Documento")
        },
        "items": []
    }

    filas = driver.find_elements(By.XPATH, "//table//tbody/tr")
    if not filas:
        filas = driver.find_elements(By.XPATH, "//*[contains(@class, 'row') or contains(@class, 'item-row')]")

    suma_subtotales = 0.0
    for fila in filas:
        celdas = fila.find_elements(By.TAG_NAME, "td")
        if len(celdas) >= 5:
            cod = celdas[0].text.strip()
            desc = celdas[1].text.strip()
            cant = celdas[2].text.strip()
            pu = celdas[3].text.strip()
            sub_str = celdas[4].text.strip()
            sub_val = limpiar_monto(sub_str)
            suma_subtotales += sub_val

            factura_data["items"].append({
                "codigo": cod,
                "descripcion": desc,
                "cantidad": cant,
                "precio_unitario": pu,
                "subtotal": sub_str,
                "subtotal_num": sub_val
            })

    factura_data["suma_subtotales"] = suma_subtotales
    factura_data["monto_total_num"] = limpiar_monto(factura_data["detalle_factura"]["monto_total_str"])
    return factura_data


# =====================================================================
# LÓGICA DE EXTRACCIÓN INDIVIDUAL CON HASTA 5 REINTENTOS PROGRESIVOS
# =====================================================================
def procesar_factura_con_reintentos(ruta_pdf, driver, max_retries=5):
    """
    Intenta leer la factura hasta 5 veces si falta algún dato (QR, SIAT o dato específico N/D).
    """
    nombre_archivo = os.path.basename(ruta_pdf)
    tipo_doc, nro_interno = extraer_datos_nombre_archivo(nombre_archivo)

    ultimo_datos = None
    ultimo_metadata = None

    for intento in range(1, max_retries + 1):
        if intento > 1:
            print(f"  🔄 [Reintento {intento}/{max_retries}] Re-escaneando factura '{nombre_archivo}' con realce avanzado...")

        # 1. Decodificación de QR
        enlace = decodificar_qr_robusto(ruta_pdf, intento)
        if not enlace:
            print(f"    ⚠️ [Intento {intento}/{max_retries}] No se detectó QR. Reintentando...")
            time.sleep(1)
            continue

        print(f"    ✓ Enlace SIAT verificado: {enlace[:65]}...")

        # 2. Extracción SIAT
        try:
            datos = extraer_datos_siat(driver, enlace)
        except Exception as ex:
            print(f"    ⚠️ [Intento {intento}/{max_retries}] Error al consultar portal SIAT: {ex}")
            time.sleep(2)
            continue

        if not datos or not datos["detalle_factura"]["numero_factura"] or datos["detalle_factura"]["numero_factura"] == "No encontrado":
            print(f"    ⚠️ [Intento {intento}/{max_retries}] Respuesta incompleta de SIAT. Reintentando...")
            time.sleep(2)
            continue

        razon_emisor = datos["datos_emisor"]["razon_social"]

        # 3. Extracción de dato específico con IA (OCR)
        dato_especifico, es_dhl = extraer_dato_especifico_con_ia(ruta_pdf, tipo_doc, razon_emisor, intento)

        # Regla estricta: Si está ANULADA en el SIAT, dato_especifico = "ANULADO"
        estado_siat = datos["detalle_factura"]["estado"]
        if "ANULAD" in (estado_siat or "").upper():
            dato_especifico = "ANULADO"

        estado_extraccion = "COMPLETO" if (dato_especifico != "N/D" and datos["monto_total_num"] > 0) else "ADVERTENCIA: DATO ESPECÍFICO FALTANTE"

        metadata_archivo = {
            "archivo_pdf": nombre_archivo,
            "tipo_documento": tipo_doc,
            "nro_interno": nro_interno,
            "dato_especifico": dato_especifico,
            "es_dhl": es_dhl,
            "estado_extraccion": estado_extraccion
        }

        ultimo_datos = datos
        ultimo_metadata = metadata_archivo

        # Si se obtuvo todo exitosamente, romper el bucle de reintentos
        if dato_especifico != "N/D" and datos["monto_total_num"] > 0:
            print(f"  ✅ Extracción 100% exitosa lograda en el intento {intento}/{max_retries}.")
            return datos, metadata_archivo

        print(f"    ⚠️ [Intento {intento}/{max_retries}] Dato específico N/D o monto cero. Reintentando...")
        time.sleep(1)

    return ultimo_datos, ultimo_metadata


# =====================================================================
# PROCESAMIENTO EN LOTE DESDE SUPABASE STORAGE (GITHUB ACTIONS / SERVER)
# =====================================================================
def procesar_lote_supabase_bucket():
    print("\n📦 === PROCESADOR EN LOTE DESDE SUPABASE STORAGE ('facturas-pdf') ===")
    
    url = SUPABASE_URL
    key = SUPABASE_KEY
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }

    try:
        list_url = f"{url}/storage/v1/object/list/facturas-pdf"
        resp_list = requests.post(list_url, headers=headers, json={"prefix": "", "limit": 1000})

        if resp_list.status_code != 200:
            print(f"❌ Error al consultar lista en Supabase Storage (HTTP {resp_list.status_code}): {resp_list.text}")
            return

        items = resp_list.json() if isinstance(resp_list.json(), list) else []
        pdfs_encontrados = [f["name"] for f in items if isinstance(f, dict) and f.get("name", "").lower().endswith(".pdf") and not f.get("name", "").startswith("terminadas/")]

        if not pdfs_encontrados:
            print("ℹ️ No hay facturas pendientes en 'facturas-pdf'.")
            return

        total_bucket = len(pdfs_encontrados)
        print(f"🚀 Se encontraron {total_bucket} factura(s) PDF en Supabase Storage. Procesando lote completo en 1 solo ciclo...")

        temp_dir = "temp_batch_pdfs"
        os.makedirs(temp_dir, exist_ok=True)
        driver = configurar_driver()

        try:
            for idx, file_name in enumerate(pdfs_encontrados, 1):
                print(f"\n[{idx}/{total_bucket}] Descargando y procesando: {file_name}")
                local_path = os.path.join(temp_dir, file_name)

                dl_url = f"{url}/storage/v1/object/public/facturas-pdf/{file_name}"
                resp_dl = requests.get(dl_url)

                if resp_dl.status_code != 200:
                    print(f"⚠️ Error al descargar '{file_name}' (HTTP {resp_dl.status_code})")
                    continue

                pdf_bytes = resp_dl.content
                with open(local_path, "wb") as f_out:
                    f_out.write(pdf_bytes)

                datos, metadata = procesar_factura_con_reintentos(local_path, driver, max_retries=5)

                if datos and metadata:
                    mostrar_inspeccion_detallada(datos, metadata)
                    cuf_guardado = guardar_factura_en_bd(datos, metadata)
                    sincronizar_registro_a_supabase(cuf_guardado)

                    try:
                        up_url = f"{url}/storage/v1/object/facturas-pdf/terminadas/{file_name}"
                        h_up = headers.copy()
                        h_up["x-upsert"] = "true"
                        h_up["Content-Type"] = "application/pdf"
                        resp_up = requests.post(up_url, headers=h_up, data=pdf_bytes)

                        del_url = f"{url}/storage/v1/object/facturas-pdf"
                        h_del = headers.copy()
                        h_del["Content-Type"] = "application/json"
                        resp_del = requests.delete(del_url, headers=h_del, json={'prefixes': [file_name]})

                        if resp_up.status_code in (200, 201) and resp_del.status_code == 200:
                            print(f"📁 PDF movido en Storage a carpeta terminadas/{file_name} y eliminado de raíz.")
                        else:
                            print(f"⚠️ Aviso Storage (Upload {resp_up.status_code} / Delete {resp_del.status_code}): Si la subida o borrado falló, ejecuta configurar_politicas_storage.sql en Supabase SQL Editor.")
                    except Exception as e_mov:
                        print(f"⚠️ Aviso al mover PDF en Storage: {e_mov}")

        finally:
            driver.quit()
            shutil.rmtree(temp_dir, ignore_errors=True)

        generar_archivo_dump_sql()
        exportar_todo_a_excel()
        sincronizar_a_supabase()

        print("\n🏁 Procesamiento en lote finalizado exitosamente.")

    except Exception as e_batch:
        print(f"❌ Error durante el lote en Supabase Storage: {e_batch}")


# =====================================================================
# SINCRONIZACIÓN A SUPABASE
# =====================================================================
def construir_registro_factura(registro):
    cuf_val = str(registro.get("cuf") or "").strip()
    nit_val = str(registro.get("nit_emisor") or "").strip()
    n_fac_val = str(registro.get("numero_factura") or "").strip()

    if cuf_val.startswith("http"):
        qr_url = cuf_val
    elif nit_val and cuf_val:
        if n_fac_val and n_fac_val != "No encontrado":
            qr_url = f"https://siat.impuestos.gob.bo/consulta/QR?nit={nit_val}&cuf={cuf_val}&numero={n_fac_val}"
        else:
            qr_url = f"https://siat.impuestos.gob.bo/consulta/QR?nit={nit_val}&cuf={cuf_val}"
    else:
        qr_url = cuf_val

    return {
        "cuf": cuf_val,
        "codigo_qr": qr_url,
        "tipo": registro.get("tipo_documento"),
        "fecha": registro.get("fecha_emision"),
        "nit": registro.get("nit_emisor"),
        "nombre": registro.get("razon_social_emisor"),
        "n_factura": registro.get("numero_factura"),
        "monto": registro.get("monto_total"),
        "ref_guia": registro.get("dato_especifico"),
        "doc_aduanero": registro.get("nro_interno"),
        "productos": registro.get("detalle_items_texto")
    }


def sincronizar_registro_a_supabase(cuf):
    if not SUPABASE_URL or not SUPABASE_KEY or not cuf:
        return
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM facturas_cabecera WHERE cuf = ?", (cuf,))
        cols_cab = [col[0] for col in cursor.description]
        fila_cab = cursor.fetchone()

        if fila_cab:
            registro = dict(zip(cols_cab, fila_cab))
            if registro.get("detalle_items_json"):
                try:
                    registro["detalle_items_json"] = json.loads(registro["detalle_items_json"])
                except Exception:
                    pass
            try:
                supabase.table("facturas_cabecera").upsert(registro).execute()
            except Exception as e_cab:
                print(f"⚠️ Aviso al upsert en facturas_cabecera: {e_cab}")

            reg_factura = construir_registro_factura(registro)
            try:
                supabase.table("facturas").upsert(reg_factura).execute()
            except Exception:
                try:
                    supabase.table("facturas").insert(reg_factura).execute()
                except Exception:
                    pass

        cursor.execute("SELECT cuf_factura, codigo_producto, descripcion, cantidad, precio_unitario, subtotal FROM facturas_detalle WHERE cuf_factura = ?", (cuf,))
        cols_det = ["cuf_factura", "codigo_producto", "descripcion", "cantidad", "precio_unitario", "subtotal"]
        filas_det = cursor.fetchall()

        for fila in filas_det:
            item = dict(zip(cols_det, fila))
            try:
                supabase.table("facturas_detalle").insert(item).execute()
            except Exception:
                pass

        conn.close()
        print(f"⚡ Factura {cuf} sincronizada en tiempo real a Supabase DB.")
    except Exception as e_sync:
        print(f"⚠️ Aviso al sincronizar registro individual a Supabase: {e_sync}")


def sincronizar_a_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️ Variables SUPABASE_URL o SUPABASE_KEY no configuradas. Omitiendo subida a Supabase.")
        return

    print("\n🚀 Sincronizando datos hacia Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM facturas_cabecera")
    cols_cab = [col[0] for col in cursor.description]
    filas_cab = cursor.fetchall()

    for fila in filas_cab:
        registro = dict(zip(cols_cab, fila))
        if registro.get("detalle_items_json"):
            try:
                registro["detalle_items_json"] = json.loads(registro["detalle_items_json"])
            except Exception:
                pass
        try:
            supabase.table("facturas_cabecera").upsert(registro).execute()
        except Exception as e_cab:
            print(f"⚠️ Aviso al upsert en facturas_cabecera: {e_cab}")

        reg_factura = construir_registro_factura(registro)
        try:
            supabase.table("facturas").upsert(reg_factura).execute()
        except Exception:
            try:
                supabase.table("facturas").insert(reg_factura).execute()
            except Exception:
                pass

    cursor.execute("SELECT cuf_factura, codigo_producto, descripcion, cantidad, precio_unitario, subtotal FROM facturas_detalle")
    cols_det = ["cuf_factura", "codigo_producto", "descripcion", "cantidad", "precio_unitario", "subtotal"]
    filas_det = cursor.fetchall()

    for fila in filas_det:
        item = dict(zip(cols_det, fila))
        supabase.table("facturas_detalle").insert(item).execute()

    conn.close()
    print("✅ ¡Sincronización con Supabase finalizada exitosamente!")


# =====================================================================
# 5. FLUJO PRINCIPAL DE EJECUCIÓN
# =====================================================================
if __name__ == "__main__":
    inicializar_base_datos()

    if len(sys.argv) > 1 and "--batch-supabase" in sys.argv:
        procesar_lote_supabase_bucket()
    else:
        print("=== PROCESADOR PROFESIONAL DE FACTURAS SIAT EN PDF ===")
        print("\nAbriendo explorador para seleccionar facturas en PDF...")
        archivos_pdf = seleccionar_archivos_pdf()

        if not archivos_pdf:
            print("⚠️ No se encontraron archivos PDF para procesar. Finalizando...")
            sys.exit(0)

        print(f"\nSe seleccionaron {len(archivos_pdf)} archivo(s) PDF.")
        print("Iniciando navegador Chrome silencioso...")
        driver = configurar_driver()

        exitosas = 0
        errores = 0

        try:
            for idx, ruta in enumerate(archivos_pdf, 1):
                nombre_archivo = os.path.basename(ruta)
                print(f"\n[{idx}/{len(archivos_pdf)}] Procesando: {nombre_archivo}")

                datos, metadata_archivo = procesar_factura_con_reintentos(ruta, driver, max_retries=5)

                if datos and metadata_archivo:
                    mostrar_inspeccion_detallada(datos, metadata_archivo)
                    guardar_factura_en_bd(datos, metadata_archivo)
                    exitosas += 1
                else:
                    print(f"❌ Imposible extraer datos de '{nombre_archivo}' tras 5 reintentos.")
                    errores += 1

        finally:
            driver.quit()
            print("\nNavegador Chrome cerrado.")

        if exitosas > 0:
            generar_archivo_dump_sql()
            exportar_todo_a_excel()
            sincronizar_a_supabase()

        print("\n" + "=" * 70)
        print("                    RESUMEN DEL PROCESO")
        print("=" * 70)
        print(f"Total PDFs analizados    : {len(archivos_pdf)}")
        print(f"Facturas registradas OK  : {exitosas}")
        print(f"Facturas con error       : {errores}")
        print(f"Base de datos SQLite     : {DB_NAME}")
        print(f"Script de volcado SQL    : {SQL_DUMP_NAME}")
        print(f"Libro consolidado Excel  : {EXCEL_NAME}")
        print("=" * 70)
