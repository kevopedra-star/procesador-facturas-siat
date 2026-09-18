@echo off
chcp 65001 > NUL
title Procesador de Facturas Python - Sistema ERP
color 0A
cd /d "%~dp0"
echo ============================================================
echo   PROCESADOR DE FACTURAS PYTHON + SIAT
echo ============================================================
echo.
echo Verificando librerias necesarias en Python...
python -c "import pymupdf, easyocr, supabase, selenium" >NUL 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Instalando librerias requeridas (pymupdf, easyocr, supabase, selenium)...
    echo Por favor espera unos momentos mientras se descargan e instalan...
    python -m pip install -r python_processor\requirements.txt
    echo.
)
python python_processor\procesar_facturas_py.py
echo.
pause
