import os
import re
import time
import shutil
from urllib.parse import urlparse, parse_qs
from contextlib import asynccontextmanager

import pymupdf
import cv2
import numpy as np
from pyzbar.pyzbar import decode
import easyocr
from supabase import create_client, Client
from fastapi import FastAPI, UploadFile, File
import uvicorn

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# ==========================================
# CONFIGURACIÓN SUPABASE
# ==========================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://sfqpptquojlsbeheguff.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcXBwdHF1b2psc2JlaGVndWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzgzNzAsImV4cCI6MjEwNDgxNDM3MH0.h-wOCnoz6KW8CdGBRowuWJIvknk_sEJ-_2HLx7SC1ek")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Iniciando motor OCR...", flush=True)
lector_ocr = easyocr.Reader(['es', 'en'], gpu=False)

def determinar_tipo(nombre_archivo):
    nom = nombre_archivo.lower()
    if "albo" in nom:
        return "ALBO"
    elif "dab" in nom:
        return "DAB"
    elif "guia" in nom or "guía" in nom or "dhl" in nom or "deze" in nom:
        return "GUIA"
    return "OTRO"

def convertir_pagina_a_cv2(pagina, dpi=300):
    zoom = dpi / 72
    mat = pymupdf.Matrix(zoom, zoom)
    pix = pagina.get_pixmap(matrix=mat)
    img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.h, pix.w, pix.n))
    if pix.n >= 3:
        return cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)

def leer_qr(img_cv2):
    codigos = decode(img_cv2)
    if not codigos:
        gris = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2GRAY)
        codigos = decode(gris)
    if not codigos:
        gris = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gris, 150, 255, cv2.THRESH_BINARY)
        codigos = decode(thresh)
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

def crear_driver_selenium():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

def extraer_siat_con_navegador(driver, url_qr):
    print("🌐 Conectando con el portal SIAT...", flush=True)
    params = parse_qs(urlparse(url_qr).query)
    nit = params.get('nit', [''])[0]
    cuf = params.get('cuf', [''])[0]
    numero = params.get('numero', [''])[0]

    datos = {"fecha": "", "nit": nit, "nombre": "", "n_factura": numero, "monto": 0.0, "cuf": cuf, "productos": "", "estado": ""}

    try:
        driver.get(url_qr)
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Bs.') or contains(text(), 'Bs') or contains(text(), 'Estado')]")))
        time.sleep(1.5)

        texto_completo = driver.find_element(By.TAG_NAME, "body").text
        lineas = [l.strip() for l in texto_completo.split("\n") if l.strip()]

        for i, l in enumerate(lineas):
            if "estado de la factura" in l.lower() and i + 1 < len(lineas):
                datos["estado"] = lineas[i + 1].strip().upper()
                break

        try:
            elem_monto = driver.find_element(By.XPATH, "//*[contains(text(), 'Monto Total')]/following::*[contains(text(), 'Bs')][1]")
            num_limpio = re.search(r'([0-9\.,]+)', elem_monto.text.strip()).group(1).replace(",", "")
            datos["monto"] = float(num_limpio)
        except Exception:
            m_monto = re.search(r'Monto\s*Total:\s*[\r\n\s]*([0-9,]+\.[0-9]{2})', texto_completo, re.IGNORECASE)
            if m_monto:
                datos["monto"] = float(m_monto.group(1).replace(",", ""))

        m_fecha = re.search(r'Fecha\s*Emisi[oó]n:\s*[\r\n\s]*([0-9]{2}/[0-9]{2}/[0-9]{4}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)', texto_completo, re.IGNORECASE)
        if m_fecha:
            datos["fecha"] = m_fecha.group(1).strip()

        for i, l in enumerate(lineas):
            if l.lower() in ["razón social:", "razon social:"] and i + 1 < len(lineas):
                datos["nombre"] = lineas[i + 1]
                break

        productos_extraidos = []
        elementos_tabla = driver.find_elements(By.XPATH, "//table//tbody//tr | //div[contains(@class, 'table')]//div[contains(@class, 'row')]")
        for el in elementos_tabla:
            txt_fila = el.text.strip()
            if txt_fila and ("Bs" in txt_fila or any(c.isdigit() for c in txt_fila)):
                fila_limpia = " | ".join([p.strip() for p in txt_fila.split("\n") if p.strip()])
                if fila_limpia not in productos_extraidos and "Código" not in fila_limpia:
                    productos_extraidos.append(fila_limpia)

        if not productos_extraidos:
            patron_prod = re.compile(r'([A-Z0-9\.\-]+)\s*\n([A-ZÁÉÍÓÚÑ0-9\s\.\-_/]+)\s*\n(\d+)\s*\n([0-9\.,]+(?:\s*Bs\.?)?)\s*\n([0-9\.,]+(?:\s*Bs\.?)?)', re.IGNORECASE)
            for m in patron_prod.finditer(texto_completo):
                productos_extraidos.append(f"{m.group(1)} | {m.group(2).strip()} | Cant: {m.group(3)} | PU: {m.group(4)} | Subtotal: {m.group(5)}")

        if productos_extraidos:
            datos["productos"] = "\n".join(productos_extraidos)

        print(f" Datos SIAT listos. Estado: {datos['estado']} | Monto: {datos['monto']}", flush=True)
    except Exception as e:
        print(f"⚠️ Error en portal SIAT: {e}", flush=True)

    return datos

# ==========================================
# GESTOR DEL CICLO DE VIDA (LIFESPAN)
# ==========================================
driver_global = None
contador_facturas = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    global driver_global
    print("🚀 Levantando navegador Chrome persistente...", flush=True)
    driver_global = crear_driver_selenium()
    print("✅ Receptor listo. Esperando facturas en tiempo real desde tu aplicación...", flush=True)
    yield
    if driver_global:
        driver_global.quit()

app = FastAPI(lifespan=lifespan)

# ==========================================
# ENDPOINT DE RECEPCIÓN
# ==========================================
@app.post("/procesar-factura")
async def recibir_factura(file: UploadFile = File(...)):
    global contador_facturas
    contador_facturas += 1

    nombre_archivo = file.filename
    tipo_detectado = determinar_tipo(nombre_archivo)
    ruta_temp = f"/tmp/{nombre_archivo}"

    with open(ruta_temp, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    print(f"\n------------------------------------------------------------", flush=True)
    print(f"📄 [Recibida #{contador_facturas}] {nombre_archivo} | Tipo: {tipo_detectado}", flush=True)
    print(f"------------------------------------------------------------", flush=True)

    doc = pymupdf.open(ruta_temp)
    img_cv2 = convertir_pagina_a_cv2(doc[0], dpi=300)

    url_qr = leer_qr(img_cv2)
    if not url_qr:
        print(f"❌ No se detectó código QR en {nombre_archivo}. Saltando...", flush=True)
        doc.close()
        if os.path.exists(ruta_temp):
            os.remove(ruta_temp)
        return {"status": "error", "mensaje": "QR no detectado"}

    texto_nativo = doc[0].get_text()
    if len(texto_nativo.strip()) > 50:
        doc_aduanero_extraido = extraer_doc_aduanero_especifico(texto_nativo, tipo_detectado)
    else:
        print("⏳ Escaneando texto con EasyOCR...", flush=True)
        bloques = lector_ocr.readtext(img_cv2, detail=0, paragraph=True)
        doc_aduanero_extraido = extraer_doc_aduanero_especifico("\n".join(bloques), tipo_detectado)
    doc.close()

    datos_siat = extraer_siat_con_navegador(driver_global, url_qr)
    estado_siat = datos_siat.get("estado", "")
    doc_aduanero_final = "ANULADO" if "ANULAD" in estado_siat else doc_aduanero_extraido

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

    # VISUALIZACIÓN EN PANTALLA EN TIEMPO REAL
    print("\n📊 === DATOS EXTRAÍDOS ===", flush=True)
    print(f"Factura N°    : {factura_data['n_factura']}", flush=True)
    print(f"NIT Emisor    : {factura_data['nit']}", flush=True)
    print(f"Razón Social  : {factura_data['nombre']}", flush=True)
    print(f"Monto Total   : {factura_data['monto']} Bs", flush=True)
    print(f"Doc Aduanero  : {factura_data['doc_aduanero']}", flush=True)
    print(f"Estado SIAT   : {factura_data['estado']}", flush=True)
    print("==========================\n", flush=True)

    # SUBIDA A SUPABASE (CON UPSERT PARA EVITAR ERROR POR DUPLICADOS)
    try:
        payload_factura = {
            "tipo": factura_data.get("tipo"),
            "fecha": factura_data.get("fecha"),
            "nit": factura_data.get("nit"),
            "nombre": factura_data.get("nombre"),
            "n_factura": factura_data.get("n_factura"),
            "monto": factura_data.get("monto"),
            "codigo_qr": factura_data.get("codigo_qr"),
            "doc_aduanero": factura_data.get("doc_aduanero"),
            "productos": factura_data.get("productos"),
            "cuf": factura_data.get("cuf")
        }
        res_fac = supabase.table("facturas").upsert(payload_factura, on_conflict="codigo_qr").execute()
        print(f"✅ Factura {factura_data.get('n_factura')} guardada/actualizada en Supabase.", flush=True)

        factura_id = None
        if res_fac.data and len(res_fac.data) > 0:
            factura_id = res_fac.data[0].get("id")

        if factura_id:
            payload_estado = {
                "factura_id": factura_id,
                "cuf": factura_data.get("cuf"),
                "estado_siat": factura_data.get("estado")
            }
            try:
                supabase.table("estado_facturas").insert(payload_estado).execute()
                print(f"✅ Estado registrado en Supabase para factura {factura_data.get('n_factura')}.", flush=True)
            except Exception as e_est:
                print(f"⚠️ Aviso al registrar en estado_facturas: {e_est}", flush=True)

    except Exception as e:
        print(f"❌ Error al guardar en Supabase la factura {factura_data.get('n_factura')}: {e}", flush=True)

    if os.path.exists(ruta_temp):
        os.remove(ruta_temp)

    return {"status": "ok", "datos": factura_data}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
