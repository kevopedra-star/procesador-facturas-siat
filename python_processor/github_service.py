#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
=============================================================================
MÓDULO CLIENTE DE INTEGRACIÓN CON GITHUB ACTIONS (REPOSITORY DISPATCH)
=============================================================================
Permite notificar a un workflow de GitHub Actions cada vez que una factura
en PDF es procesada, cargada o almacenada en el sistema.
=============================================================================
"""

import os
import sys
import json
import logging
import urllib.request
import urllib.error

# Reconfigurar salida de consola a UTF-8 para evitar UnicodeEncodeError en Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Configuración de Logger
logger = logging.getLogger("GitHubService")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] [GitHubService] %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

DEFAULT_GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "kevopedra-star")
DEFAULT_GITHUB_REPO = os.environ.get("GITHUB_REPO", "sistema-facturas-python-ocr")
DEFAULT_GITHUB_PAT = os.environ.get("GITHUB_PAT", "")

def _cargar_env_local():
    """Lee el archivo .env si las variables no están cargadas en os.environ"""
    env_vars = {}
    posibles_rutas = [
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
        '.env'
    ]
    for ruta in posibles_rutas:
        if os.path.exists(ruta):
            try:
                with open(ruta, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            k, v = line.split('=', 1)
                            env_vars[k.strip()] = v.strip()
                break
            except Exception:
                pass
    return env_vars

def enviar_factura_a_github(pdf_url, nombre_archivo):
    """
    Ejecuta una petición POST a la API repository_dispatch de GitHub Actions.

    Parameters:
        pdf_url (str): Enlace accesible por HTTP/HTTPS directo al PDF.
        nombre_archivo (str): Nombre real del archivo con extensión PDF (ej: ALBO 12345-6.pdf).

    Returns:
        bool: True si la API retornó 204 No Content, False en caso de error o código distinto.
    """
    # Repositorio exclusivo y único asignado para el procesamiento
    owner = "kevopedra-star"
    repo = "procesador-facturas-siat"
    env_local = _cargar_env_local()
    pat = os.environ.get("GITHUB_PAT") or env_local.get("GITHUB_PAT") or DEFAULT_GITHUB_PAT

    url = f"https://api.github.com/repos/{owner}/{repo}/dispatches"

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {pat}",
        "Content-Type": "application/json",
        "User-Agent": "SistemaFacturacionApp"
    }

    payload = {
        "event_type": "nueva_factura",
        "client_payload": {
            "pdf_url": pdf_url,
            "nombre_archivo": nombre_archivo
        }
    }

    logger.info(f"🚀 Enviando evento repository_dispatch a GitHub ({owner}/{repo}) para: '{nombre_archivo}'...")

    try:
        data_json = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data_json, headers=headers, method='POST')

        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            if status_code == 204:
                logger.info(f"✅ Factura '{nombre_archivo}' enviada exitosamente a GitHub Actions (HTTP 204 No Content).")
                return True
            else:
                logger.warning(f"⚠️ Petición a GitHub respondió con código HTTP inesperado: {status_code}")
                return False

    except urllib.error.HTTPError as e_http:
        # Registrar log de error sin bloquear el flujo principal
        logger.error(f"❌ Error HTTP {e_http.code} al enviar factura '{nombre_archivo}' a GitHub: {e_http.reason}")
        return False
    except urllib.error.URLError as e_url:
        logger.error(f"❌ Error de conexión al comunicarse con la API de GitHub: {e_url.reason}")
        return False
    except Exception as e_gen:
        logger.error(f"❌ Error inesperado al enviar factura a GitHub: {e_gen}")
        return False

# Alias en camelCase para compatibilidad
enviarFacturaAGitHub = enviar_factura_a_github

if __name__ == "__main__":
    # Prueba rápida independiente
    print("Probando módulo GitHub Dispatch...")
    url_test = "https://sfqpptquojlsbeheguff.supabase.co/storage/v1/object/public/facturas-pdf/test.pdf"
    archivo_test = "ALBO 12345-6.pdf"
    resultado = enviar_factura_a_github(url_test, archivo_test)
    print(f"Resultado prueba: {resultado}")
