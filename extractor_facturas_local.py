#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
=============================================================================
EXTRACTOR MASIVO DE FACTURAS LOCALES (PYTHON)
=============================================================================
Este script procesa de forma masiva archivos PDF de facturas desde una carpeta
local, aplicando filtros avanzados de OpenCV para limpieza, buscando códigos QR,
o ejecutando OCR local (Tesseract) como plan de contingencia. 

Los resultados se guardan directamente en la tabla 'public.facturas' de Supabase.

Tiene dos modos de ejecución:
  1. Modo Consola (Procesar carpeta local):
     python extractor_facturas_local.py "C:\CarpetaPDFs" 95
  2. Modo Servidor (Microservicio API para la aplicación web):
     python extractor_facturas_local.py --server

Requisitos de Instalación de Librerías:
  pip install opencv-python pytesseract pyzbar pdf2image supabase numpy python-dotenv flask flask-cors

Requisitos de Sistema:
  1. Instalar Tesseract OCR:
     - Windows: Descargar el instalador de https://github.com/UB-Mannheim/tesseract/wiki
     - Asegúrate de instalar el paquete de idioma Español (spa).
  2. Instalar Poppler (necesario para pdf2image):
     - Windows: Descargar de https://github.com/oschwartz10612/poppler-windows/releases
     - Agregar la carpeta 'bin' de poppler a tus Variables de Entorno (PATH).
=============================================================================
"""

import os
import sys
import re
import glob
import json
import logging
from datetime import datetime
import numpy as np
import cv2
from pyzbar import pyzbar
import pytesseract
from pdf2image import convert_from_path
from supabase import create_client, Client
import threading

try:
    from python_processor.github_service import enviar_factura_a_github
except ImportError:
    try:
        from github_service import enviar_factura_a_github
    except ImportError:
        enviar_factura_a_github = None

def _notificar_github_background(pdf_url, nombre_archivo):
    if not enviar_factura_a_github:
        return
    url_final = pdf_url or f"https://sfqpptquojlsbeheguff.supabase.co/storage/v1/object/public/facturas-pdf/{nombre_archivo}"
    try:
        threading.Thread(
            target=enviar_factura_a_github,
            args=(url_final, nombre_archivo),
            daemon=True
        ).start()
    except Exception:
        pass

# Configurar Tesseract si estás en Windows (Autodetectar rutas comunes)
tesseract_paths = [
    r'C:\Program Files\Tesseract-OCR\tesseract.exe',
    r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
    os.path.join(os.environ.get('USERPROFILE', ''), r'AppData\Local\Programs\Tesseract-OCR\tesseract.exe')
]
for p in tesseract_paths:
    if os.path.exists(p):
        pytesseract.pytesseract.tesseract_cmd = p
        break

# Configuración de Logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('extractor_facturas.log', encoding='utf-8')
    ]
)
logger = logging.getLogger("ExtractorFacturas")

def load_env_credentials():
    """Carga credenciales directamente del archivo .env del proyecto"""
    env = {}
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    env[key.strip()] = val.strip()
    return env

# =============================================================================
# PIPELINE DE PROCESAMIENTO DE IMÁGENES CON OPENCV
# =============================================================================

def deskew_image(image):
    """
    Detecta la inclinación de la imagen y la rota para enderezarla.
    Ideal para facturas escaneadas chuecas.
    """
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Umbralización inversa para resaltar las letras sobre el fondo negro
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        
        # Obtener las coordenadas de todos los píxeles blancos (texto)
        coords = np.column_stack(np.where(thresh > 0))
        
        # Calcular el rectángulo de área mínima que encierra a los píxeles
        angle = cv2.minAreaRect(coords)[-1]
        
        # Corregir el ángulo devuelto por OpenCV
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
            
        # Si el ángulo es irrelevante, no rotar
        if abs(angle) < 0.5 or abs(angle) > 45:
            return image
            
        logger.info(f"Enderezando imagen inclinada a {angle:.2f} grados.")
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except Exception as e:
        logger.warning(f"No se pudo aplicar deskew: {e}")
        return image

def clean_image_for_ocr(image):
    """
    Aplica escala de grises y binarización adaptativa de Otsu
    para limpiar sombras y mejorar la legibilidad del texto tenue.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Reducir ruido mediante un filtro Gaussiano suave
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # Binarización adaptativa Otsu
    thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return thresh

# =============================================================================
# ESTRATEGIA A: EXTRACCIÓN Y DETECCIÓN DEL CÓDIGO QR
# =============================================================================

def try_decode_qr(image):
    """
    Intenta decodificar el código QR usando pyzbar en la imagen original,
    y si falla, aplica mejoras sucesivas de escala, binarización y contraste.
    """
    # 1. Intento directo en la imagen original
    decoded_objects = pyzbar.decode(image)
    if decoded_objects:
        return decoded_objects[0].data.decode('utf-8')
        
    # 2. Convertir a escala de grises
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # 3. Intentos aplicando redimensionamiento y umbralización adaptativa
    for scale in [1.5, 2.0]:
        resized = cv2.resize(gray, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        # Umbralización simple Otsu
        _, thresh_otsu = cv2.threshold(resized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        decoded_objects = pyzbar.decode(thresh_otsu)
        if decoded_objects:
            return decoded_objects[0].data.decode('utf-8')
            
        # Umbralización Adaptativa Gaussiana
        thresh_adapt = cv2.adaptiveThreshold(
            resized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 3
        )
        decoded_objects = pyzbar.decode(thresh_adapt)
        if decoded_objects:
            return decoded_objects[0].data.decode('utf-8')
            
    return None

def parse_qr_data(qr_text):
    """
    Parsea los datos de facturación desde la URL del QR de Impuestos de Bolivia
    o del formato plano separado por pipes (vertical bars |).
    """
    from urllib.parse import unquote
    
    # Decodificar entidades HTML y URL percent-encoding
    qr_text_decoded = unquote(qr_text.replace('&amp;', '&').replace('&AMP;', '&'))
    
    data = {
        'nit': None,
        'n_factura': None,
        'cuf': None,
        'fecha': None,
        'monto': None,
        'codigo_qr': qr_text
    }
    
    # Caso A: Es una URL de Impuestos Nacionales de Bolivia
    if 'impuestos.gob.bo' in qr_text_decoded or 'siat' in qr_text_decoded or '?' in qr_text_decoded:
        try:
            # Parsear parámetros de consulta de la URL
            params = {}
            query_str = qr_text_decoded.split('?', 1)[-1]
            for part in query_str.split('&'):
                if '=' in part:
                    k, v = part.split('=', 1)
                    params[k.strip().lower()] = v.strip()
            
            data['nit'] = params.get('nit')
            data['n_factura'] = params.get('numero') or params.get('nro')
            data['cuf'] = params.get('cuf')
            
            # Formatear fecha (comúnmente DD/MM/AAAA) a YYYY-MM-DD
            fecha_raw = params.get('fecha')
            if fecha_raw:
                # Reemplazar posibles guiones por barras para normalizar
                fecha_raw = fecha_raw.replace('-', '/')
                parts = fecha_raw.split('/')
                if len(parts) == 3:
                    if len(parts[0]) == 4:
                        data['fecha'] = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
                    else:
                        data['fecha'] = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                else:
                    data['fecha'] = fecha_raw
                    
            monto_raw = params.get('monto') or params.get('montototal')
            if monto_raw:
                monto_raw = monto_raw.replace(',', '.')
                try:
                    data['monto'] = float(monto_raw)
                except ValueError:
                    pass
        except Exception as e:
            logger.error(f"Error parseando URL de QR: {e}")
            
    # Caso B: Formato plano separado por tuberías (pipes '|')
    elif '|' in qr_text:
        try:
            parts = qr_text.split('|')
            if len(parts) >= 5:
                data['nit'] = parts[0].strip()
                data['n_factura'] = parts[1].strip()
                data['cuf'] = parts[2].strip() # CUF / Autorización
                
                # Formatear fecha
                fecha_raw = parts[3].strip()
                if '/' in fecha_raw:
                    f_parts = fecha_raw.split('/')
                    if len(f_parts) == 3:
                        data['fecha'] = f"{f_parts[2]}-{f_parts[1].zfill(2)}-{f_parts[0].zfill(2)}"
                else:
                    data['fecha'] = fecha_raw
                    
                data['monto'] = float(parts[4].strip().replace(',', '.'))
        except Exception as e:
            logger.error(f"Error parseando texto plano de QR: {e}")
            
    return data

# =============================================================================
# ESTRATEGIA B: ESTRATEGIA DE OCR CON PYTESSERACT Y REGEX
# =============================================================================

def extract_registro_aduanero(ocr_text):
    """
    Extrae el registro aduanero (DUI, DIM, DUE, MAWB, HAWB, MAN, Doc. Salida)
    desde el texto extraído de la factura.
    """
    if not ocr_text:
        return None
        
    # 1. Buscar AWB / MAWB / HAWB (Típico de Guías Aéreas)
    mawb_match = re.search(r'MAWB\s*[:\-\. ]?\s*([0-9A-Z\-]{7,20})', ocr_text, re.IGNORECASE)
    hawb_match = re.search(r'HAWB\s*[:\-\. ]?\s*([0-9A-Z\-]{7,20})', ocr_text, re.IGNORECASE)
    awb_match = re.search(r'\bAWB\s*[:\-\. ]?\s*([0-9A-Z\-]{7,20})', ocr_text, re.IGNORECASE)
    
    parts = []
    if mawb_match:
        parts.append(f"MAWB:{mawb_match.group(1).strip()}")
    if hawb_match:
        parts.append(f"HAWB:{hawb_match.group(1).strip()}")
    if not parts and awb_match:
        parts.append(f"AWB:{awb_match.group(1).strip()}")
        
    if parts:
        return " ".join(parts)
        
    # 2. Buscar DUI / DIM / DUE (Nro. Registro de 15 caracteres: ej. 2112026D2221286)
    # Formato: 3-4 dígitos (aduana) + 4 dígitos (año) + 1 letra (regimen) + 6-9 dígitos (nro)
    dui_match = re.search(r'\b([0-9]{3,4}[A-Za-z][0-9]{6,9})\b', ocr_text)
    if dui_match:
        return dui_match.group(1).strip().upper()
        
    # 3. Buscar Manifiesto (MAN / DAB de Tránsito: ej. MAN 2903777122)
    man_match = re.search(r'\b(?:MAN|DAB|MANIFIESTO)\s*[:\-\. ]?\s*([0-9]{8,15})\b', ocr_text, re.IGNORECASE)
    if man_match:
        return f"MAN:{man_match.group(1).strip()}"
        
    # 4. Buscar Documento de Salida (ej. Doc.Salida: 201C20262214736)
    salida_match = re.search(r'(?:doc\.?\s*salida|salida)\s*[:\-\. ]?\s*([0-9]{3,4}[A-Z][0-9]{6,12})', ocr_text, re.IGNORECASE)
    if salida_match:
        return salida_match.group(1).strip().upper()
        
    return None

def perform_ocr_extraction(clean_gray_image, original_image):
    """
    Realiza OCR sobre la imagen preprocesada en escala de grises y aplica
    expresiones regulares robustas para extraer los datos fiscales.
    """
    # 1. Ejecutar Tesseract OCR (con fallback a inglés si falta español)
    custom_config = r'--oem 3 --psm 3'
    try:
        ocr_text = pytesseract.image_to_string(clean_gray_image, lang='spa', config=custom_config)
    except Exception as e:
        logger.warning(f"No se pudo cargar el idioma 'spa' (español) en Tesseract. Reintentando con 'eng' (inglés): {e}")
        try:
            ocr_text = pytesseract.image_to_string(clean_gray_image, lang='eng', config=custom_config)
        except Exception as e2:
            logger.error(f"Tesseract falló completamente: {e2}")
            ocr_text = ""
    
    # Respaldar datos extraídos
    data = {
        'nit': None,
        'n_factura': None,
        'cuf': None,
        'fecha': None,
        'monto': None,
        'nombre': None,
        'registro_aduanero': None
    }
    
    logger.debug(f"Texto extraído por OCR:\n{ocr_text[:800]}")
    
    # 2. Expresiones Regulares para NIT
    nit_match = re.search(r'(?:nit|n\.i\.t\.|ruc)\s*[:\-\. ]?\s*(\d{7,15})', ocr_text, re.IGNORECASE)
    if nit_match:
        data['nit'] = nit_match.group(1).strip()
        
    # 3. Expresiones Regulares para Número de Factura
    fact_match = re.search(r'(?:n[o°º] factura|nro factura|n[o°º]|nro|factura n[o°º]|n[uú]mero)\s*[:\-\. ]?\s*(\d+)', ocr_text, re.IGNORECASE)
    if fact_match:
        data['n_factura'] = fact_match.group(1).strip()
        
    # 4. Expresiones Regulares para CUF o Autorización (Cadena larga alfanumérica o numérica de 10+)
    cuf_match = re.search(r'(?:cuf|c\.u\.f\.|autorizaci[oó]n|autorizacion)\s*[:\-\. ]?\s*([A-F0-9]{15,})', ocr_text, re.IGNORECASE)
    if cuf_match:
        data['cuf'] = cuf_match.group(1).strip()
    else:
        # Fallback: buscar cualquier bloque alfanumérico largo típico de CUF boliviano (30+ caracteres hex)
        hex_match = re.search(r'\b([A-Fa-f0-9]{30,64})\b', ocr_text)
        if hex_match:
            data['cuf'] = hex_match.group(1).upper().strip()

    # 5. Expresiones Regulares para Fecha (Formatos DD/MM/AAAA, DD-MM-AAAA)
    date_match = re.search(r'\b(\d{1,2})[/\-–](\d{1,2})[/\-–](\d{4})\b', ocr_text)
    if date_match:
        dia, mes, anio = date_match.groups()
        data['fecha'] = f"{anio}-{mes.zfill(2)}-{dia.zfill(2)}"
        
    # 6. Expresiones Regulares para Monto
    # Busca patrones numéricos después de palabras claves de totales
    monto_match = re.search(r'(?:total|total a pagar|importe total|total bs|monto total)\s*[:\-\. ]?\s*(?:bs\.?)?\s*([0-9\.\,]+)', ocr_text, re.IGNORECASE)
    if monto_match:
        raw_monto = monto_match.group(1).strip()
        # Limpieza de separadores numéricos inteligente (soporte para miles con puntos y comas)
        if ',' in raw_monto and '.' in raw_monto:
            # Formato clásico: 1.250,50 -> 1250.50
            raw_monto = raw_monto.replace('.', '').replace(',', '.')
        elif ',' in raw_monto:
            # Formato con una sola coma: puede ser 1,372 (miles) o 1250,50 (decimal)
            parts = raw_monto.split(',')
            if len(parts) == 2 and len(parts[1]) == 3:
                raw_monto = raw_monto.replace(',', '') # Miles
            else:
                raw_monto = raw_monto.replace(',', '.') # Decimal
        elif '.' in raw_monto:
            # Formato con un solo punto: puede ser 1.372 (miles) o 751.10 (decimal)
            parts = raw_monto.split('.')
            if len(parts) == 2 and len(parts[1]) == 3:
                raw_monto = raw_monto.replace('.', '') # Miles
            else:
                pass # Decimal estándar
        try:
            data['monto'] = float(raw_monto)
        except ValueError:
            pass
            
    # 7. Estimación de Razón Social / Nombre Emisor (Primeras líneas del documento)
    lines = [line.strip() for line in ocr_text.split('\n') if line.strip()]
    if lines:
        # Usualmente el nombre del negocio está en las primeras 3 líneas del encabezado
        emisor_lines = [l for l in lines[:4] if not any(kw in l.lower() for kw in ['nit', 'factura', 'bolivia', 'nro', 'autorizacion'])]
        if emisor_lines:
            data['nombre'] = emisor_lines[0].upper()
            
    return data

# =============================================================================
# INSERCIÓN EN SUPABASE
# =============================================================================

def save_to_supabase(client: Client, payload):
    """
    Inserta el registro de la factura en Supabase y maneja errores
    de colisión de llave única para evitar interrupciones en el bucle masivo.
    Devuelve el id de la factura guardada (o existente) en caso de éxito, o None si falló.
    """
    # Auto-calcular el consecutivo secuencial antes de insertar si no viene en el payload
    if not payload.get('consecutivo'):
        try:
            res_max = client.table('facturas').select('consecutivo').order('consecutivo', desc=True).limit(1).execute()
            if res_max.data and len(res_max.data) > 0:
                highest = res_max.data[0].get('consecutivo')
                payload['consecutivo'] = (highest or 0) + 1
            else:
                payload['consecutivo'] = 1
        except Exception as e_consecutivo:
            logger.warning(f"No se pudo calcular el consecutivo autoincrementable: {e_consecutivo}")
            
    # Comprobar si ya existe por QR o CUF para actualizar en lugar de provocar error 23505
    existing = None
    if payload.get('codigo_qr'):
        try:
            res_qr = client.table('facturas').select('id').eq('codigo_qr', payload.get('codigo_qr')).maybeSingle().execute()
            if res_qr and res_qr.data:
                existing = res_qr.data
        except Exception:
            pass
    if not existing and payload.get('cuf'):
        try:
            res_cuf = client.table('facturas').select('id').eq('cuf', payload.get('cuf')).maybeSingle().execute()
            if res_cuf and res_cuf.data:
                existing = res_cuf.data
        except Exception:
            pass

    if existing and existing.get('id'):
        try:
            payload_up = dict(payload)
            payload_up.pop('consecutivo', None)
            client.table('facturas').update(payload_up).eq('id', existing['id']).execute()
            logger.info(f"ℹ️ La factura N° {payload.get('n_factura')} ya existía en Supabase. Registro actualizado con éxito.")
            _notificar_github_background(payload.get('codigo_qr'), payload.get('nombre') or f"Factura_{payload.get('n_factura')}.pdf")
            return existing['id']
        except Exception as e_up:
            logger.warning(f"Aviso al actualizar factura existente: {e_up}")
            return existing['id']

    try:
        res = client.table('facturas').insert(payload).execute()
        logger.info(f"✔ Guardado con éxito: Factura N°{payload.get('n_factura')} (Monto: {payload.get('monto')})")
        _notificar_github_background(payload.get('codigo_qr'), payload.get('nombre') or f"Factura_{payload.get('n_factura')}.pdf")
        if res.data and len(res.data) > 0:
            return res.data[0].get('id')
        return True
    except Exception as e:
        error_msg = str(e)
        if '23505' in error_msg or 'duplicate key value' in error_msg or 'facturas_cuf_idx' in error_msg or 'uq_facturas_codigo_qr' in error_msg:
            logger.warning(f"⚠ [DUPLICADA] La factura N° {payload.get('n_factura')} ya existe en el historial. Registro omitido o actualizado.")
        else:
            logger.error(f"❌ Error al guardar en Supabase: {error_msg}")
        return None

# =============================================================================
# EXTRACCIÓN DE UN SOLO ARCHIVO
# =============================================================================

def resolve_document_type(filename):
    if not filename:
        return 'DAB'
    filename_upper = filename.upper()
    if 'ALBO IP' in filename_upper or 'INSPECCION PREVIA' in filename_upper:
        return 'ALBO IP'
    elif 'ALBO' in filename_upper:
        return 'ALBO'
    elif 'GUIA' in filename_upper:
        return 'GUIA'
    return 'DAB'

def process_single_pdf_file(pdf_path, importacion_id, supabase_client, idx=1):
    """
    Aplica el pipeline completo de conversión, OpenCV, decodificación QR u OCR
    a un único archivo, y lo guarda en Supabase.
    """
    filename = os.path.basename(pdf_path)
    # Convertir PDF a Imagen a 300 DPI (Página 1 únicamente para facturas)
    pages = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=1)
    if not pages:
        raise Exception("No se pudo renderizar imagen para el PDF")
        
    # Convertir imagen PIL a OpenCV numpy array
    pil_img = pages[0].convert('RGB')
    open_cv_image = np.array(pil_img)
    open_cv_image = open_cv_image[:, :, ::-1].copy()
    
    # Enderezar imagen con OpenCV (Deskewing)
    oriented_image = deskew_image(open_cv_image)
    
    # ESTRATEGIA A: Buscar y leer código QR
    logger.info("Intentando leer código QR...")
    qr_text = try_decode_qr(oriented_image)
    
    payload = {
        'importacion_id': int(importacion_id),
        'nombre': filename,
        'tipo': resolve_document_type(filename),
        'fecha': None,
        'nit': None,
        'n_factura': None,
        'monto': 0.0,
        'codigo_qr': None,
        'cuf': None,
        'productos': []
    }
    
    qr_data = None
    if qr_text:
        logger.info("✔ Código QR detectado con éxito.")
        qr_data = parse_qr_data(qr_text)
        payload.update({
            'fecha': qr_data['fecha'],
            'nit': qr_data['nit'],
            'n_factura': qr_data['n_factura'],
            'monto': qr_data['monto'] or 0.0,
            'codigo_qr': qr_data['codigo_qr'],
            'cuf': qr_data['cuf'],
            'productos': [{
                'descripcion': 'SERVICIO SEGUN FACTURA (SIAT QR)',
                'cantidad': 1,
                'subtotal': qr_data['monto'] or 0.0
            }]
        })
        
    # ESTRATEGIA DE REFUERZO: Siempre que podamos, corremos OCR local (Tesseract)
    # para rellenar/corregir cualquier dato que el QR haya dejado en blanco, nulo, o en 0.
    ocr_data = None
    try:
        clean_gray = clean_image_for_ocr(oriented_image)
        ocr_data = perform_ocr_extraction(clean_gray, oriented_image)
    except Exception as ocr_err:
        logger.warning(f"No se pudo ejecutar OCR de respaldo: {ocr_err}")
        
    if ocr_data:
        today_str = datetime.today().strftime('%Y-%m-%d')
        
        # Rellenar campos faltantes o sospechosos (monto = 0.0 o fecha de hoy)
        if not payload['nit']:
            payload['nit'] = ocr_data['nit']
        if not payload['n_factura'] or payload['n_factura'] == 'S/N':
            payload['n_factura'] = ocr_data['n_factura']
        if not payload['cuf']:
            payload['cuf'] = ocr_data['cuf']
        if not payload['fecha'] or payload['fecha'] == today_str:
            payload['fecha'] = ocr_data['fecha'] or today_str
        if not payload['monto'] or payload['monto'] <= 0.01:
            payload['monto'] = ocr_data['monto'] or 0.0
            if payload['productos']:
                payload['productos'][0]['subtotal'] = payload['monto']
            
    # Si después de todo no se pudo leer por QR (y no tiene enlace QR), rellenamos datos desde OCR
    if not payload['codigo_qr']:
        if ocr_data:
            payload.update({
                'fecha': ocr_data['fecha'] or datetime.today().strftime('%Y-%m-%d'),
                'nit': ocr_data['nit'],
                'n_factura': ocr_data['n_factura'],
                'monto': ocr_data['monto'] or 0.0,
                'cuf': ocr_data['cuf'],
                'productos': [{
                    'descripcion': 'SERVICIO SEGUN FACTURA (OCR)',
                    'cantidad': 1,
                    'subtotal': ocr_data['monto'] or 0.0
                }]
            })
        
    # Validaciones mínimas antes de insertar
    if not payload['n_factura'] or not payload['nit']:
        if not payload['n_factura']:
            payload['n_factura'] = 'S/N'
        if not payload['cuf']:
            payload['cuf'] = f"MAN-{int(datetime.now().timestamp())}-{idx}"
            
    # Guardar en Base de Datos
    db_id = save_to_supabase(supabase_client, payload)
    return payload, db_id

# =============================================================================
# PIPELINE DE CARPETA LOCAL (MODO CONSOLA)
# =============================================================================

def process_invoices_directory(directory_path, importacion_id):
    """Recorre la carpeta local, convierte PDFs y procesa de forma secuencial"""
    logger.info("Cargando credenciales de Supabase del archivo .env...")
    env = load_env_credentials()
    supabase_url = env.get('VITE_SUPABASE_URL')
    supabase_key = env.get('VITE_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        logger.error("No se encontraron VITE_SUPABASE_URL ni VITE_SUPABASE_ANON_KEY en el archivo .env.")
        sys.exit(1)
        
    logger.info(f"Conectando a Supabase URL: {supabase_url}")
    supabase_client = create_client(supabase_url, supabase_key)
    
    pdf_files = glob.glob(os.path.join(directory_path, '*.pdf'))
    if not pdf_files:
        logger.warning(f"No se encontraron archivos .pdf en la ruta: {directory_path}")
        return
        
    logger.info(f"Se encontraron {len(pdf_files)} archivos PDF para procesar.")
    
    success_count = 0
    duplicate_count = 0
    failed_count = 0
    
    for idx, pdf_path in enumerate(pdf_files, 1):
        filename = os.path.basename(pdf_path)
        logger.info(f"[{idx}/{len(pdf_files)}] Procesando: {filename}...")
        
        try:
            _, saved = process_single_pdf_file(pdf_path, importacion_id, supabase_client, idx)
            if saved:
                success_count += 1
            else:
                duplicate_count += 1
        except Exception as file_err:
            logger.error(f"Error procesando el archivo {filename}: {file_err}")
            failed_count += 1
            
    logger.info("=============================================================================")
    logger.info("RESUMEN DE EXTRACCIÓN MASIVA:")
    logger.info(f"  - Total procesados: {len(pdf_files)}")
    logger.info(f"  - Guardados con éxito: {success_count}")
    logger.info(f"  - Saltados (Duplicados): {duplicate_count}")
    logger.info(f"  - Fallidos (Errores): {failed_count}")
    logger.info("=============================================================================")

# =============================================================================
# SERVIDOR MICROSERVICIO LOCAL CON RATE LIMITING Y SEGURIDAD
# =============================================================================

def start_server():
    """Inicia el servidor Flask local para recibir peticiones HTTP de la web app con Rate Limiting"""
    try:
        from flask import Flask, request, jsonify
        from flask_cors import CORS
    except ImportError:
        print("\nError: Flask o Flask-CORS no están instalados.")
        print("Instálalos ejecutando: pip install flask flask-cors\n")
        sys.exit(1)
        
    app = Flask(__name__)
    CORS(app) # Habilitar CORS para permitir llamadas AJAX desde localhost/web-app
    
    # --- MIDDLEWARE DE RATE LIMITING (RECOMENDACIÓN DE SEGURIDAD 3) ---
    RATE_LIMIT_WINDOW = 60 # segundos
    RATE_LIMIT_MAX_REQUESTS = 100 # peticiones por minuto por IP
    request_tracker = {}

    @app.before_request
    def check_rate_limit():
        # Permitir peticiones a la ruta de salud sin throttling
        if request.path in ['/health', '/status']:
            return None

        client_ip = request.remote_addr or '127.0.0.1'
        now = time.time()
        
        # Limpiar registros antiguos fuera de la ventana de 60s
        timestamps = request_tracker.get(client_ip, [])
        timestamps = [ts for ts in timestamps if now - ts < RATE_LIMIT_WINDOW]
        request_tracker[client_ip] = timestamps
        
        if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
            logger.warning(f"⚠️ [RATE LIMIT] Petición bloqueada desde IP {client_ip}. Excedió {RATE_LIMIT_MAX_REQUESTS} req/min.")
            response = jsonify({
                'success': False,
                'error': 'RATE_LIMIT_EXCEEDED',
                'message': f'Límite de peticiones excedido (Máximo {RATE_LIMIT_MAX_REQUESTS} peticiones/minuto). Protegiendo servidor.'
            })
            response.status_code = 429
            response.headers['Retry-After'] = '60'
            response.headers['X-RateLimit-Limit'] = str(RATE_LIMIT_MAX_REQUESTS)
            response.headers['X-RateLimit-Remaining'] = '0'
            return response
            
        timestamps.append(now)

    @app.after_request
    def inject_rate_limit_headers(response):
        client_ip = request.remote_addr or '127.0.0.1'
        timestamps = request_tracker.get(client_ip, [])
        remaining = max(0, RATE_LIMIT_MAX_REQUESTS - len(timestamps))
        response.headers['X-RateLimit-Limit'] = str(RATE_LIMIT_MAX_REQUESTS)
        response.headers['X-RateLimit-Remaining'] = str(remaining)
        response.headers['X-Server-Security'] = 'PROTECTED_RATE_LIMITER'
        return response

    # Cargar credenciales
    env = load_env_credentials()
    supabase_url = env.get('VITE_SUPABASE_URL')
    supabase_key = env.get('VITE_SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_key:
        logger.error("No se encontraron credenciales en el archivo .env de tu proyecto.")
        sys.exit(1)
        
    supabase_client = create_client(supabase_url, supabase_key)
    
    @app.route('/health', methods=['GET'])
    @app.route('/status', methods=['GET'])
    def api_health():
        return jsonify({
            'status': 'OPERATIVO',
            'server': 'Extractor Facturas Local Python',
            'rate_limiting': 'ACTIVO',
            'rate_limit_max': RATE_LIMIT_MAX_REQUESTS,
            'supabase_connection': 'CONECTADO' if supabase_client else 'DESCONECTADO'
        })

    @app.route('/procesar', methods=['POST'])
    def api_procesar():
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No se envió ningún archivo en la petición.'}), 400
            
        file = request.files['file']
        importacion_id = request.form.get('importacion_id')
        
        if not importacion_id:
            return jsonify({'success': False, 'error': 'Falta el parámetro importacion_id.'}), 400
            
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Nombre de archivo inválido.'}), 400
            
        # Guardar en archivo temporal
        temp_dir = 'temp_uploads'
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        try:
            logger.info(f"Petición API recibida: Procesando {file.filename} para importación ID {importacion_id}...")
            payload, db_id = process_single_pdf_file(temp_path, importacion_id, supabase_client)
            
            return jsonify({
                'success': True,
                'db_id': db_id,
                'data': payload
            })
        except Exception as e:
            logger.error(f"Error procesando archivo vía API: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            # Eliminar temporal
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
                    
    logger.info("=============================================================================")
    logger.info("SERVIDOR PYTHON DE EXTRACCIÓN LOCAL INICIADO (CON RATE LIMITING)")
    logger.info("  -> Escuchando en: http://127.0.0.1:5000")
    logger.info("  -> Protección: 100 peticiones / minuto por usuario")
    logger.info("  -> Mantén esta ventana abierta mientras escaneas desde tu web app.")
    logger.info("=============================================================================")
    app.run(host='127.0.0.1', port=5000)

# =============================================================================
# INICIO DE EJECUCIÓN
# =============================================================================

if __name__ == "__main__":
    # Evaluar parámetros
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        start_server()
    else:
        if len(sys.argv) < 3:
            print("\nUso correcto:")
            print("  Modo Consola:  python extractor_facturas_local.py \"<RUTA_CARPETA_PDFs>\" <IMPORTACION_ID>")
            print("  Modo Servidor: python extractor_facturas_local.py --server")
            print("\nEjemplos:")
            print("  python extractor_facturas_local.py \"C:\\FacturasDescargadas\" 95")
            print("  python extractor_facturas_local.py --server\n")
            sys.exit(1)
            
        carpeta = sys.argv[1]
        importacion = sys.argv[2]
        
        if not os.path.exists(carpeta):
            print(f"\nError: La ruta especificada no existe: '{carpeta}'\n")
            sys.exit(1)
            
        process_invoices_directory(carpeta, importacion)
