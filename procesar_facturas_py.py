import os
import re
import time
from urllib.parse import urlparse, parse_qs
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

# ==========================================
# CONFIGURACIÓN SUPABASE
# ==========================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://sfqpptquojlsbeheguff.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmcXBwdHF1b2psc2JlaGVndWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyNDk3ODMsImV4cCI6MjA1NjgyNTc4M30.4qFstq4_k24kQyqNfS_b6QcM_G4S_Q0S1J3-2_S0t0t")
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

def seleccionar_archivos_pdf():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    rutas = filedialog.askopenfilenames(
        title="Selecciona una o varias facturas en PDF",
        filetypes=[("Archivos PDF", "*.pdf"), ("Todos los archivos", "*.*")]
    )
    root.destroy()
    return list(rutas)

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

    try:
        driver.get(url_qr)
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Bs.') or contains(text(), 'Bs') or contains(text(), 'Estado')]")))
        time.sleep(1.5)

        texto_completo = driver.find_element(By.TAG_NAME, "body").text
        lineas = [l.strip() for l in texto_completo.split("\n") if l.strip()]

        for i, l in enumerate(lineas):
            if "estado de la factura" in l.lower():
                if i + 1 < len(lineas):
                    datos["estado"] = lineas[i + 1].strip().upper()
                    break

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

        m_fecha = re.search(r'Fecha\s*Emisi[oó]n:\s*[\r\n\s]*([0-9]{2}/[0-9]{2}/[0-9]{4}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)', texto_completo, re.IGNORECASE)
        if m_fecha:
            datos["fecha"] = m_fecha.group(1).strip()

        for i, l in enumerate(lineas):
            if l.lower() == "razón social:" or l.lower() == "razon social:":
                if i + 1 < len(lineas) and not datos["nombre"]:
                    datos["nombre"] = lineas[i + 1]

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

def ventana_verificacion(datos, archivo_actual, total_archivos):
    ventana = tk.Tk()
    ventana.title(f"Verificación de Factura ({archivo_actual} de {total_archivos})")
    ventana.geometry("700x760")
    ventana.attributes("-topmost", True)
    
    confirmado = {"accion": "descartar", "datos": {}}

    tk.Label(
        ventana, 
        text=f"Revisión de Datos ({archivo_actual}/{total_archivos})", 
        font=("Arial", 12, "bold")
    ).pack(pady=10)

    frame_campos = tk.Frame(ventana)
    frame_campos.pack(fill="both", expand=True, padx=25, pady=5)

    entradas = {}
    campos_orden = [
        ("tipo", "Tipo (ALBO / DAB / GUIA):"),
        ("estado", "Estado SIAT:"),
        ("fecha", "Fecha Emisión:"),
        ("nit", "NIT Emisor:"),
        ("nombre", "Razón Social Emisor:"),
        ("n_factura", "N° Factura:"),
        ("monto", "Monto Total:"),
        ("cuf", "CUF:"),
        ("doc_aduanero", "Doc. Aduanero:"),
        ("codigo_qr", "Enlace QR:")
    ]

    for idx, (clave, etiqueta) in enumerate(campos_orden):
        tk.Label(frame_campos, text=etiqueta, anchor="w", font=("Arial", 9, "bold")).grid(row=idx, column=0, sticky="w", pady=4)
        ent = tk.Entry(frame_campos, font=("Arial", 9))
        ent.insert(0, str(datos.get(clave, "")))
        
        if clave == "estado":
            if "ANULAD" in ent.get():
                ent.config(fg="#c0392b", font=("Arial", 9, "bold"))
            else:
                ent.config(fg="#27ae60", font=("Arial", 9, "bold"))

        if clave == "doc_aduanero" and ent.get() == "ANULADO":
            ent.config(fg="#c0392b", font=("Arial", 9, "bold"))
            
        ent.grid(row=idx, column=1, sticky="ew", padx=(10, 0), pady=4)
        entradas[clave] = ent

    idx_prod = len(campos_orden)
    tk.Label(frame_campos, text="Detalle Productos SIAT:", anchor="w", font=("Arial", 9, "bold")).grid(row=idx_prod, column=0, sticky="nw", pady=6)
    txt_productos = tk.Text(frame_campos, font=("Arial", 9), height=7, wrap="word")
    txt_productos.insert("1.0", str(datos.get("productos", "")))
    txt_productos.grid(row=idx_prod, column=1, sticky="ew", padx=(10, 0), pady=6)

    frame_campos.columnconfigure(1, weight=1)

    def accion_guardar():
        actualizados = {}
        for clave, ent in entradas.items():
            val = ent.get().strip()
            if clave == "monto":
                try:
                    val = float(val)
                except ValueError:
                    val = 0.0
            actualizados[clave] = val
        actualizados["productos"] = txt_productos.get("1.0", tk.END).strip()

        confirmado["accion"] = "guardar"
        confirmado["datos"] = actualizados
        ventana.destroy()

    def accion_saltar():
        confirmado["accion"] = "saltar"
        ventana.destroy()

    def accion_cancelar_todo():
        confirmado["accion"] = "cancelar_todo"
        ventana.destroy()

    frame_botones = tk.Frame(ventana)
    frame_botones.pack(fill="x", padx=25, pady=15)
    
    tk.Button(frame_botones, text="⏹️ Detener Todo", bg="#7f8c8d", fg="white", font=("Arial", 9, "bold"), command=accion_cancelar_todo, padx=8, pady=6).pack(side="left")
    tk.Button(frame_botones, text="⏭️ Omitir Factura", bg="#e67e22", fg="white", font=("Arial", 9, "bold"), command=accion_saltar, padx=8, pady=6).pack(side="left", padx=8)
    tk.Button(frame_botones, text=" Confirmar y Preparar", bg="#27ae60", fg="white", font=("Arial", 9, "bold"), command=accion_guardar, padx=10, pady=6).pack(side="right")

    ventana.mainloop()
    return confirmado

def procesar_lote_facturas():
    rutas_pdf = seleccionar_archivos_pdf()
    if not rutas_pdf:
        print("❌ No se seleccionó ningún archivo.", flush=True)
        return

    total = len(rutas_pdf)
    print(f"\n📁 Se seleccionaron {total} factura(s) para procesar.", flush=True)
    
    print("🚀 Levantando instancia única de navegador para acelerar el proceso...", flush=True)
    driver = crear_driver_selenium()
    
    facturas_para_subir = []

    try:
        for i, ruta_pdf in enumerate(rutas_pdf, 1):
            nombre_archivo = os.path.basename(ruta_pdf)
            tipo_detectado = determinar_tipo(nombre_archivo)
            print(f"\n------------------------------------------------------------", flush=True)
            print(f"📄 [{i}/{total}] Procesando: {nombre_archivo} | Tipo: {tipo_detectado}", flush=True)
            print(f"------------------------------------------------------------", flush=True)

            doc = pymupdf.open(ruta_pdf)
            img_cv2 = convertir_pagina_a_cv2(doc[0], dpi=300)
            
            # 1. Leer QR
            url_qr = leer_qr(img_cv2)
            if not url_qr:
                print(f"❌ No se detectó código QR en {nombre_archivo}. Saltando...", flush=True)
                doc.close()
                continue

            # 2. Extracción de Doc Aduanero
            texto_nativo = doc[0].get_text()
            if len(texto_nativo.strip()) > 50:
                doc_aduanero_extraido = extraer_doc_aduanero_especifico(texto_nativo, tipo_detectado)
            else:
                print("⏳ Escaneando texto con EasyOCR...", flush=True)
                bloques = lector_ocr.readtext(img_cv2, detail=0, paragraph=True)
                doc_aduanero_extraido = extraer_doc_aduanero_especifico("\n".join(bloques), tipo_detectado)

            doc.close()

            # 3. Consulta SIAT con navegador abierto
            datos_siat = extraer_siat_con_navegador(driver, url_qr)
            estado_siat = datos_siat.get("estado", "")

            # 4. Regla estricta: Si está ANULADO en SIAT
            if "ANULAD" in estado_siat:
                print("⚠️ Factura ANULADA detectada en SIAT. Asignando ANULADO a doc_aduanero.", flush=True)
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

            # VISTA PREVIA EN CONSOLA
            print("\n📊 === DATOS EXTRAÍDOS ===", flush=True)
            print(f"Factura N°    : {factura_data['n_factura']}", flush=True)
            print(f"NIT Emisor    : {factura_data['nit']}", flush=True)
            print(f"Razón Social  : {factura_data['nombre']}", flush=True)
            print(f"Monto Total   : {factura_data['monto']} Bs", flush=True)
            print(f"Doc Aduanero  : {factura_data['doc_aduanero']}", flush=True)
            print(f"Estado SIAT   : {factura_data['estado']}", flush=True)
            print("==========================\n", flush=True)

            # 5. Ventana de verificación
            resultado = ventana_verificacion(factura_data, i, total)

            if resultado["accion"] == "guardar":
                facturas_para_subir.append(resultado["datos"])
                print(f"✔️ Factura {nombre_archivo} lista en cola para subir.", flush=True)
            elif resultado["accion"] == "saltar":
                print(f"⏭️ Factura {nombre_archivo} omitida.", flush=True)
            elif resultado["accion"] == "cancelar_todo":
                print("⏹️ Proceso en lote detenido por el usuario.", flush=True)
                break

    finally:
        print("\nCerrando navegador...", flush=True)
        driver.quit()

    # ============================================================
    # SUBIDA A SUPABASE (SE EJECUTA SOLO CUANDO SACÓ TODO EL LOTE)
    # ============================================================
    if not facturas_para_subir:
        print("\n⚠️ No hay facturas confirmadas para subir a Supabase.", flush=True)
        return

    print(f"\n🚀 Subiendo {len(facturas_para_subir)} factura(s) confirmadas a Supabase...", flush=True)
    for idx_subida, datos_guardar in enumerate(facturas_para_subir, 1):
        try:
            print(f"[{idx_subida}/{len(facturas_para_subir)}] Subiendo factura N° {datos_guardar.get('n_factura')}...", flush=True)
            payload_factura = {
                "tipo": datos_guardar.get("tipo"),
                "fecha": datos_guardar.get("fecha"),
                "nit": datos_guardar.get("nit"),
                "nombre": datos_guardar.get("nombre"),
                "n_factura": datos_guardar.get("n_factura"),
                "monto": datos_guardar.get("monto"),
                "codigo_qr": datos_guardar.get("codigo_qr"),
                "doc_aduanero": datos_guardar.get("doc_aduanero"),
                "productos": datos_guardar.get("productos"),
                "cuf": datos_guardar.get("cuf")
            }
            res_fac = supabase.table("facturas").insert(payload_factura).execute()
            print(f" Factura {datos_guardar.get('n_factura')} insertada con éxito.", flush=True)

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
                print(f" Estado registrado para factura {datos_guardar.get('n_factura')}.", flush=True)
            except Exception as e_est:
                print(f"⚠️ Aviso al registrar en estado_facturas: {e_est}", flush=True)

        except Exception as e:
            print(f"❌ Error al guardar en Supabase la factura {datos_guardar.get('n_factura')}: {e}", flush=True)

    print("\n🏁 Procesamiento y subida finalizados con éxito.", flush=True)

if __name__ == "__main__":
    procesar_lote_facturas()
