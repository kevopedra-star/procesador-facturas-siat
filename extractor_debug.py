#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
=============================================================================
EXTRACTOR DEBUGGER - VISUALIZADOR DE EXTRACCIÓN DE FACTURAS
=============================================================================
Este script procesa un único PDF de factura y muestra de forma detallada
todo lo que extrae del documento tanto por QR como por OCR (Tesseract).

Uso:
  python extractor_debug.py "<RUTA_AL_ARCHIVO_PDF>"

Ejemplo:
  python extractor_debug.py "C:\Facturas\GUIA 1558-26 MSC.pdf"
=============================================================================
"""

import os
import sys
import json
import logging
import numpy as np
import cv2
import pytesseract
from pdf2image import convert_from_path

# Importar funciones del script principal
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    from extractor_facturas_local import (
        deskew_image,
        clean_image_for_ocr,
        try_decode_qr,
        parse_qr_data,
        perform_ocr_extraction
    )
except ImportError as e:
    print(f"Error al importar el script principal: {e}")
    sys.exit(1)

# Configurar logs básicos a consola
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

def debug_pdf(pdf_path):
    if not os.path.exists(pdf_path):
        print(f"\n[ERROR] El archivo no existe: '{pdf_path}'\n")
        return
        
    print("\n" + "="*80)
    print(f"DEBUGGING FACTURA: {os.path.basename(pdf_path)}")
    print("="*80)
    
    # 1. Renderizar PDF a Imagen
    print("\n[1/5] Renderizando PDF a imagen a 300 DPI...")
    try:
        pages = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=1)
        if not pages:
            print("[ERROR] No se pudo renderizar ninguna página.")
            return
        pil_img = pages[0].convert('RGB')
        open_cv_image = np.array(pil_img)
        open_cv_image = open_cv_image[:, :, ::-1].copy() # Convertir a BGR
    except Exception as e:
        print(f"[ERROR] Falló la renderización del PDF: {e}")
        return
        
    # 2. Preprocesamiento OpenCV
    print("[2/5] Enderezando imagen (Deskewing)...")
    oriented_image = deskew_image(open_cv_image)
    
    # 3. Decodificación de QR
    print("[3/5] Intentando leer código QR...")
    qr_text = try_decode_qr(oriented_image)
    
    qr_parsed = {}
    if qr_text:
        print(f"  ✔ QR detectado: {qr_text}")
        qr_parsed = parse_qr_data(qr_text)
        print("  ✔ Datos parseados del QR:")
        print(json.dumps(qr_parsed, indent=4, ensure_ascii=False))
    else:
        print("  ⚠ No se detectó ningún código QR legible.")
        
    # 4. Extracción de OCR (Tesseract)
    print("\n[4/5] Ejecutando OCR local (Tesseract)...")
    clean_gray = clean_image_for_ocr(oriented_image)
    
    # Obtener el texto crudo para mostrarlo al usuario
    custom_config = r'--oem 3 --psm 3'
    ocr_text = ""
    try:
        ocr_text = pytesseract.image_to_string(clean_gray, lang='spa', config=custom_config)
    except Exception as e:
        print(f"  ⚠ Falló OCR en Español, reintentando en Inglés: {e}")
        try:
            ocr_text = pytesseract.image_to_string(clean_gray, lang='eng', config=custom_config)
        except Exception as e2:
            print(f"  ❌ Falló Tesseract por completo: {e2}")
            
    ocr_parsed = {}
    if ocr_text:
        print(f"\n--- INICIO TEXTO DETECTADO POR OCR ({len(ocr_text)} caracteres) ---")
        # Mostrar primeras 20 líneas del texto crudo
        lines = ocr_text.split('\n')
        for i, line in enumerate(lines[:30]):
            if line.strip():
                print(f"  Línea {i+1:02d}: {line}")
        if len(lines) > 30:
            print(f"  ... y {len(lines) - 30} líneas más.")
        print("--- FIN TEXTO DETECTADO POR OCR ---\n")
        
        ocr_parsed = perform_ocr_extraction(clean_gray, oriented_image)
        print("  ✔ Datos extraídos por OCR:")
        print(json.dumps(ocr_parsed, indent=4, ensure_ascii=False))
    else:
        print("  ⚠ No se pudo extraer ningún texto legible por OCR.")
        
    # 5. Resumen Comparativo de Datos
    print("\n" + "="*80)
    print("RESUMEN COMPARATIVO:")
    print("="*80)
    
    # Intentar resolver el Tipo según el nombre del archivo
    filename = os.path.basename(pdf_path).upper()
    tipo_sugerido = "FACTURA"
    if "GUIA" in filename:
        tipo_sugerido = "GUIA"
    elif "ALBO" in filename:
        tipo_sugerido = "ALBO"
    elif "PLANILLA" in filename:
        tipo_sugerido = "PLANILLA"
        
    print(f"  - Tipo sugerido (por nombre): {tipo_sugerido}")
    print(f"  - Emisor NIT:      [QR] {qr_parsed.get('nit')}  |  [OCR] {ocr_parsed.get('nit')}")
    print(f"  - N° Factura:      [QR] {qr_parsed.get('n_factura')}  |  [OCR] {ocr_parsed.get('n_factura')}")
    print(f"  - Fecha:           [QR] {qr_parsed.get('fecha')}  |  [OCR] {ocr_parsed.get('fecha')}")
    print(f"  - Monto Total:     [QR] {qr_parsed.get('monto')}  |  [OCR] {ocr_parsed.get('monto')}")
    print(f"  - CUF/Autorización:[QR] {qr_parsed.get('cuf')}  |  [OCR] {ocr_parsed.get('cuf')}")
    print(f"  - Razón Social:    [OCR] {ocr_parsed.get('nombre')}")
    print("="*80 + "\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nUso:")
        print("  python extractor_debug.py \"<RUTA_AL_PDF>\"")
        print("\nEjemplo:")
        print("  python extractor_debug.py \"C:\\Facturas\\GUIA 1558-26 MSC.pdf\"\n")
        sys.exit(1)
        
    debug_pdf(sys.argv[1])
