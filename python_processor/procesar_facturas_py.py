#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
=============================================================================
PROCESADOR AUTOMÁTICO DE FACTURAS Y SIAT (PYTHON + SUPABASE)
=============================================================================
Este script procesa facturas en PDF, lee el QR con filtros avanzados de OpenCV,
extrae el Documento Aduanero (DAB, GUIA, ALBO), consulta el portal SIAT de Impuestos
Nacionales con reintentos automáticos si falla la conexión, y realiza un Upsert
en Supabase para evitar errores de duplicidad (uq_facturas_codigo_qr / 23505).
=============================================================================
"""

import os
import sys
import re
import time
import json
from urllib.parse import urlparse, parse_qs

# Reconfigurar salida de consola a UTF-8 para evitar UnicodeEncodeError en Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import pymupdf
import cv2
import numpy as np
from pyzbar.pyzbar import decode
import tkinter as tk
from tkinter import filedialog
import easyocr
from supabase import create_client, Client

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# =============================================================================
# CONFIGURACIÓN Y CREDENCIALES DE SUPABASE
# =============================================================================
def load_env_credentials():
    """Carga credenciales del archivo .env del proyecto"""
    env = {}
    possible_paths = [
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
        '.env'
    ]
    for env_path in possible_paths:
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        env[key.strip()] = val.strip()
            break
    return env

env_vars = load_env_credentials()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or env_vars.get("VITE_SUPABASE_URL") or env_vars.get("SUPABASE_URL") or "https://sfqpptquojlsbeheguff.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or env_vars.get("VITE_SUPABASE_ANON_KEY") or env_vars.get("SUPABASE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcXBwdHF1b2psc2JlaGVndWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzgzNzAsImV4cCI6MjEwNDgxNDM3MH0.h-wOCnoz6KW8CdGBRowuWJIvknk_sEJ-_2HLx7SC1ek"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e_sup:
    print(f"⚠️ Error al conectar con Supabase: {e_sup}")
    supabase = None

print("⏳ Cargando motor OCR de EasyOCR...")
lector_ocr = easyocr.Reader(['es', 'en'], gpu=False)

# =============================================================================
# FUNCIONES AUXILIARES DE LECTURA Y CONVERSIÓN
# =============================================================================

def determinar_tipo(nombre_archivo):
    nom = nombre_archivo.lower()
    if "albo" in nom:
        return "ALBO"
    elif "dab" in nom:
        return "DAB"
    elif "guia" in nom or "guía" in nom or "dhl" in nom or "deze" in nom:
        return "GUIA"
    return "OTRO"

def seleccionar_archivos_pdf():
    # 1. Si se pasan archivos por línea de comandos (ej: en Linux / Codespaces / Node)
    if len(sys.argv) > 1:
        rutas_cli = [arg for arg in sys.argv[1:] if os.path.exists(arg)]
        if rutas_cli:
            return rutas_cli

    # 2. Si no hay argumentos CLI, intentar abrir diálogo con Tkinter (Windows GUI)
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        rutas = filedialog.askopenfilenames(
            title="Selecciona una o varias facturas en PDF",
            filetypes=[("Archivos PDF", "*.pdf"), ("Todos los archivos", "*.*")]
        )
        root.destroy()
        return list(rutas)
    except Exception as e_tk:
        print(f"⚠️ Entorno sin pantalla interactiva (GUI): {e_tk}")
        print("💡 Sugerencia: Pasa la ruta del archivo PDF como argumento, por ejemplo:")
        print("   python python_processor/procesar_facturas_py.py mi_factura.pdf")
        return []

def convertir_pagina_a_cv2(pagina, dpi=300):
    zoom = dpi / 72
    mat = pymupdf.Matrix(zoom, zoom)
    pix = pagina.get_pixmap(matrix=mat)
    img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.h, pix.w, pix.n))
    if pix.n >= 3:
        return cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)

def leer_qr_avanzado(img_cv2):
    """
    Intenta leer el código QR aplicando múltiples filtros de OpenCV (Gris, Umbralización, CLAHE y Rotación).
    Garantiza lectura aun en facturas con mala luz, escaneadas chuecas o con bajo contraste.
    """
    # 1. Intento Directo
    codigos = decode(img_cv2)
    if codigos:
        return codigos[0].data.decode("utf-8")

    # 2. Intento Escala de Grises
    gris = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2GRAY)
    codigos = decode(gris)
    if codigos:
        return codigos[0].data.decode("utf-8")

    # 3. Intento Umbralización Otsu
    _, thresh = cv2.threshold(gris, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    codigos = decode(thresh)
    if codigos:
        return codigos[0].data.decode("utf-8")

    # 4. Intento Mejora de Contraste (CLAHE)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrastada = clahe.apply(gris)
    codigos = decode(contrastada)
    if codigos:
        return codigos[0].data.decode("utf-8")

    # 5. Intento Rotaciones (90°, 180°, 270°) por si el PDF está rotado
    for angulo in [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE]:
        rotada = cv2.rotate(gris, angulo)
        codigos = decode(rotada)
        if codigos:
            return codigos[0].data.decode("utf-8")

    return None

def extraer_doc_aduanero_especifico(texto_completo, tipo):
    texto_una_linea = " ".join(texto_completo.split())

    if tipo == "DAB":
        m_salida_exacta = re.search(r'\b(\d{3}C202\d{8,9})\b', texto_una_linea, re.IGNORECASE)
        if m_salida_exacta:
            return m_salida_exacta.group(1).upper()
        m_salida = re.search(r'Doc\.?\s*Salida\s*[:\.]?\s*([A-Z0-9]+)', texto_una_linea, re.IGNORECASE)
        if m_salida:
            val = m_salida.group(1).strip().upper()
            if len(val) >= 10 and not val.startswith("CC"):
                return val

    elif tipo == "GUIA":
        m_mawb = re.search(r'MAWB\s*[:\.]?\s*([0-9]{3}[-\s]?[0-9]{8})', texto_una_linea, re.IGNORECASE)
        if m_mawb:
            return m_mawb.group(1).replace(" ", "-").strip()
        m_dhl = re.search(r'(?:MAN|AWB)\s*[:\.]?\s*([0-9]{8,11})\b', texto_una_linea, re.IGNORECASE)
        if m_dhl:
            return m_dhl.group(1).strip()

    elif tipo == "ALBO":
        m_dim = re.search(r'\b(\d{3}\s*202\d\s*[A-Z]\s*\d{6,8})\b', texto_una_linea)
        if m_dim:
            return re.sub(r'\s+', '', m_dim.group(1)).upper()
        m_ds = re.search(r'\b(?:DS|DUI|DIM|DUE)[-\s]?\d{4}[-\s]?\d{3}[-\s]?\d+\b', texto_una_linea, re.IGNORECASE)
        if m_ds:
            return re.sub(r'\s+', '-', m_ds.group(0)).upper()

        lineas = [l.strip() for l in texto_completo.split("\n") if l.strip()]
        for i, l in enumerate(lineas):
            if any(h in l.upper() for h in ["DIM/DUI/DUE", "DIMIDUIIDUE", "NRO. REGISTRO"]):
                for j in range(i + 1, min(i + 4, len(lineas))):
                    limpio = re.sub(r'[^A-Z0-9]', '', lineas[j].upper())
                    if len(limpio) >= 9 and any(c.isdigit() for c in limpio) and "DIM" not in limpio:
                        return limpio

    m_gen = re.search(r'\b(\d{3}202\d[A-Z]\d{7,8})\b', texto_una_linea)
    if m_gen:
        return m_gen.group(1).upper()

    return ""

# =============================================================================
# CONSULTA SIAT CON REINTENTOS AUTOMÁTICOS
# =============================================================================

def extraer_siat_con_navegador(url_qr, max_retries=3):
    """
    Conecta al portal SIAT con Selenium Headless. Si falla por red o tiempo de espera,
    reintenta hasta `max_retries` veces para garantizar la obtención completa de datos.
    """
    params = parse_qs(urlparse(url_qr).query)
    nit = params.get('nit', [''])[0]
    cuf = params.get('cuf', [''])[0]
    numero = params.get('numero', [''])[0]

    datos = {
        "fecha": "",
        "nit": nit,
        "nombre": "",
        "n_factura": numero,
        "monto": 0.0,
        "cuf": cuf,
        "productos": "",
        "estado": ""
    }

    for intento in range(1, max_retries + 1):
        print(f"🌐 Conectando con el portal SIAT... (Intento {intento}/{max_retries})")
        
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        try:
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            driver.get(url_qr)
            wait = WebDriverWait(driver, 20)
            wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Bs.') or contains(text(), 'Bs') or contains(text(), 'Estado')]")))
            time.sleep(3)

            texto_completo = driver.find_element(By.TAG_NAME, "body").text
            lineas = [l.strip() for l in texto_completo.split("\n") if l.strip()]

            # 1. Estado de la factura
            for i, l in enumerate(lineas):
                if "estado de la factura" in l.lower():
                    if i + 1 < len(lineas):
                        datos["estado"] = lineas[i + 1].strip().upper()
                        break

            # 2. Monto Total
            try:
                elem_monto = driver.find_element(By.XPATH, "//*[contains(text(), 'Monto Total')]/following::*[contains(text(), 'Bs')][1]")
                txt_monto_dom = elem_monto.text.strip()
                num_limpio = re.search(r'([0-9\.,]+)', txt_monto_dom).group(1)
                num_limpio = num_limpio.replace(",", "")
                datos["monto"] = float(num_limpio)
            except Exception:
                m_monto = re.search(r'Monto\s*Total:\s*[\r\n\s]*([0-9,]+\.[0-9]{2})', texto_completo, re.IGNORECASE)
                if m_monto:
                    datos["monto"] = float(m_monto.group(1).replace(",", ""))

            # 3. Fecha Emisión
            m_fecha = re.search(r'Fecha\s*Emisi[oó]n:\s*[\r\n\s]*([0-9]{2}/[0-9]{2}/[0-9]{4}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)', texto_completo, re.IGNORECASE)
            if m_fecha:
                datos["fecha"] = m_fecha.group(1).strip()

            # 4. Razón Social Emisor
            for i, l in enumerate(lineas):
                if l.lower() == "razón social:" or l.lower() == "razon social:":
                    if i + 1 < len(lineas) and not datos["nombre"]:
                        datos["nombre"] = lineas[i + 1]

            # 5. Detalle de Productos
            productos_extraidos = []
            elementos_tabla = driver.find_elements(By.XPATH, "//table//tbody//tr | //div[contains(@class, 'table')]//div[contains(@class, 'row')]")
            for el in elementos_tabla:
                txt_fila = el.text.strip()
                if txt_fila and ("Bs" in txt_fila or any(c.isdigit() for c in txt_fila)):
                    fila_limpia = " | ".join([p.strip() for p in txt_fila.split("\n") if p.strip()])
                    if fila_limpia not in productos_extraidos and "Código" not in fila_limpia:
                        productos_extraidos.append(fila_limpia)

            if productos_extraidos:
                json_prods = []
                for p in productos_extraidos:
                    partes = p.split(" | ")
                    desc = partes[1] if len(partes) > 1 else partes[0]
                    cant = 1
                    subtotal = datos["monto"]
                    for pt in partes:
                        m_cant = re.search(r'Cant:\s*(\d+)', pt)
                        if m_cant:
                            cant = int(m_cant.group(1))
                        m_sub = re.search(r'(?:Subtotal:|Bs\.?)\s*([0-9\.,]+)', pt)
                        if m_sub:
                            try:
                                subtotal = float(m_sub.group(1).replace(",", ""))
                            except ValueError:
                                pass
                    json_prods.append({"descripcion": desc.strip(), "cantidad": cant, "subtotal": subtotal})
                datos["productos"] = json.dumps(json_prods)

            driver.quit()
            
            # Si obtuvimos estado y monto, la extracción fue exitosa
            if datos["estado"] and datos["monto"] > 0:
                print(f" Datos SIAT listos. Estado: {datos['estado']} | Monto: {datos['monto']}")
                return datos
            elif intento < max_retries:
                print(f"⚠️ Datos incompletos en SIAT. Reintentando ({intento}/{max_retries})...")
                time.sleep(2)

        except Exception as e:
            try:
                driver.quit()
            except Exception:
                pass
            print(f"⚠️ Error al conectar con portal SIAT (Intento {intento}/{max_retries}): {e}")
            if intento < max_retries:
                time.sleep(3)

    return datos

# =============================================================================
# GUARDADO INTELIGENTE EN SUPABASE (UPSERT)
# =============================================================================

def guardar_factura_en_supabase(datos_guardar):
    """
    Guarda o actualiza el registro en Supabase sin fallar por uq_facturas_codigo_qr o clave duplicada.
    """
    if not supabase:
        print("❌ Cliente Supabase no disponible. Revisa tus credenciales.")
        return False

    payload_factura = {
        "tipo": datos_guardar.get("tipo"),
        "fecha": datos_guardar.get("fecha"),
        "nit": datos_guardar.get("nit"),
        "nombre": datos_guardar.get("nombre"),
        "n_factura": datos_guardar.get("n_factura"),
        "monto": datos_guardar.get("monto"),
        "codigo_qr": datos_guardar.get("codigo_qr"),
        "doc_aduanero": datos_guardar.get("doc_aduanero"),
        "ref_guia": datos_guardar.get("doc_aduanero"),
        "registro_aduanero": datos_guardar.get("doc_aduanero"),
        "productos": datos_guardar.get("productos"),
        "cuf": datos_guardar.get("cuf")
    }

    # 1. Comprobar si ya existe por QR o CUF
    existing_row = None
    if datos_guardar.get("codigo_qr"):
        try:
            res_qr = supabase.table("facturas").select("id").eq("codigo_qr", datos_guardar.get("codigo_qr")).maybe_single().execute()
            if res_qr and res_qr.data:
                existing_row = res_qr.data
        except Exception:
            pass
    if not existing_row and datos_guardar.get("cuf"):
        try:
            res_cuf = supabase.table("facturas").select("id").eq("cuf", datos_guardar.get("cuf")).maybe_single().execute()
            if res_cuf and res_cuf.data:
                existing_row = res_cuf.data
        except Exception:
            pass

    if existing_row:
        try:
            supabase.table("facturas").update(payload_factura).eq("id", existing_row["id"]).execute()
            print(f"ℹ️ La factura N° {datos_guardar.get('n_factura')} ya existía en Supabase. Registro actualizado con éxito.")
            try:
                supabase.table("estado_facturas").upsert({
                    "factura_id": existing_row["id"], 
                    "cuf": datos_guardar.get("cuf"), 
                    "estado_siat": datos_guardar.get("estado")
                }).execute()
            except Exception:
                pass
            return True
        except Exception as e_up:
            print(f"⚠️ Aviso al actualizar factura existente: {e_up}")
            return False
    else:
        try:
            res_fac = supabase.table("facturas").insert(payload_factura).execute()
            print(" Factura insertada con éxito.")

            factura_id = None
            if res_fac.data and len(res_fac.data) > 0:
                factura_id = res_fac.data[0].get("id")

            payload_estado = {
                "factura_id": factura_id,
                "cuf": datos_guardar.get("cuf"),
                "estado_siat": datos_guardar.get("estado")
            }
            try:
                supabase.table("estado_facturas").insert(payload_estado).execute()
                print(" Estado registrado en tabla estado_facturas.")
            except Exception as e_est:
                print(f"⚠️ Aviso al registrar en estado_facturas: {e_est}")
            return True

        except Exception as e:
            err_str = str(e)
            if "23505" in err_str or "duplicate key" in err_str or "uq_facturas_codigo_qr" in err_str:
                print(f"⚠️ [DUPLICADA] La factura N° {datos_guardar.get('n_factura')} ya existe en Supabase (QR duplicado).")
                return True
            else:
                print(f"❌ Error al guardar en Supabase la factura {datos_guardar.get('n_factura')}: {e}")
                return False

# =============================================================================
# BUCLE PRINCIPAL DE PROCESAMIENTO CON REINTENTOS
# =============================================================================

def procesar_lote_facturas():
    rutas_pdf = seleccionar_archivos_pdf()
    if not rutas_pdf:
        print("❌ No se seleccionó ningún archivo.")
        return

    total = len(rutas_pdf)
    print(f"\n📁 Se seleccionaron {total} factura(s) para procesar.")

    for i, ruta_pdf in enumerate(rutas_pdf, 1):
        nombre_archivo = os.path.basename(ruta_pdf)
        tipo_detectado = determinar_tipo(nombre_archivo)
        print(f"\n------------------------------------------------------------")
        print(f"📄 [Recibida #{i}] {nombre_archivo} | Tipo: {tipo_detectado}")
        print(f"------------------------------------------------------------")

        factura_procesada = False
        intentos_lectura = 0
        max_intentos_lectura = 3

        while not factura_procesada and intentos_lectura < max_intentos_lectura:
            intentos_lectura += 1
            if intentos_lectura > 1:
                print(f"🔄 Reintentando lectura completa de {nombre_archivo} (Intento {intentos_lectura}/{max_intentos_lectura})...")

            try:
                doc = pymupdf.open(ruta_pdf)
                img_cv2 = convertir_pagina_a_cv2(doc[0], dpi=300 if intentos_lectura == 1 else 400)
                
                # 1. Leer QR con filtros múltiples
                url_qr = leer_qr_avanzado(img_cv2)
                if not url_qr:
                    print(f"❌ No se detectó código QR en {nombre_archivo} (Intento {intentos_lectura}).")
                    doc.close()
                    time.sleep(1)
                    continue

                # 2. Extracción de Doc Aduanero
                texto_nativo = doc[0].get_text()
                if len(texto_nativo.strip()) > 50:
                    doc_aduanero_extraido = extraer_doc_aduanero_especifico(texto_nativo, tipo_detectado)
                else:
                    print("⏳ Escaneando texto con EasyOCR...")
                    bloques = lector_ocr.readtext(img_cv2, detail=0, paragraph=True)
                    doc_aduanero_extraido = extraer_doc_aduanero_especifico("\n".join(bloques), tipo_detectado)

                doc.close()

                # 3. Consulta SIAT con reintentos
                datos_siat = extraer_siat_con_navegador(url_qr, max_retries=3)
                estado_siat = datos_siat.get("estado", "")

                # 4. Regla estricta: Si está ANULADO en SIAT, doc_aduanero = "ANULADO"
                if "ANULAD" in estado_siat:
                    print("⚠️ Factura ANULADA detectada en SIAT. Asignando ANULADO a doc_aduanero.")
                    doc_aduanero_final = "ANULADO"
                else:
                    doc_aduanero_final = doc_aduanero_extraido

                factura_data = {
                    "tipo": tipo_detectado,
                    "estado": estado_siat,
                    "fecha": datos_siat.get("fecha", ""),
                    "nit": datos_siat.get("nit", ""),
                    "nombre": datos_siat.get("nombre", ""),
                    "n_factura": datos_siat.get("n_factura", ""),
                    "monto": datos_siat.get("monto", 0.0),
                    "cuf": datos_siat.get("cuf", ""),
                    "codigo_qr": url_qr,
                    "doc_aduanero": doc_aduanero_final,
                    "productos": datos_siat.get("productos", "")
                }

                print("\n📊 === DATOS EXTRAÍDOS ===")
                print(f"Factura N°    : {factura_data['n_factura']}")
                print(f"NIT Emisor    : {factura_data['nit']}")
                print(f"Razón Social  : {factura_data['nombre']}")
                print(f"Monto Total   : {factura_data['monto']} Bs")
                print(f"Doc Aduanero  : {doc_aduanero_final}")
                print(f"Estado SIAT   : {estado_siat}")
                print("==========================\n")

                # Verificar si los datos mínimos requeridos fueron extraídos
                if factura_data['n_factura'] and factura_data['nit'] and (factura_data['monto'] > 0 or 'ANULAD' in estado_siat):
                    print("🚀 Guardando automáticamente en la base de datos Supabase...")
                    guardar_factura_en_supabase(factura_data)
                    factura_procesada = True
                else:
                    print(f"⚠️ Faltan datos clave en la lectura de {nombre_archivo}. Reintentando proceso...")
                    time.sleep(2)

            except Exception as err_proc:
                print(f"❌ Error durante el procesamiento de {nombre_archivo}: {err_proc}")
                time.sleep(2)

        if not factura_procesada:
            print(f"❌ No se pudieron extraer todos los datos de {nombre_archivo} tras {max_intentos_lectura} intentos.")

    print("\n🏁 Procesamiento de todas las facturas finalizado exitosamente.")

if __name__ == "__main__":
    procesar_lote_facturas()
