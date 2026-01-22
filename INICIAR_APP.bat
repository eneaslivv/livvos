@echo off
title Launcher Antigravity
color 0A
echo ==========================================
echo      INICIANDO ANTIGRAVITY AGENT
echo ==========================================
echo.
echo 1. Encendiendo el Cerebro (API Backend)...
start "Antigravity API" /min cmd /k "cd apps\api && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000"

echo 2. Activando Oidos Globales (Wispr Flow)...
start "Antigravity Wispr" /min cmd /k "cd apps\api && python wispr_client.py"

echo 3. Cargando Interfaz (Frontend)...
cd apps\desktop
start "Antigravity Frontend" /min cmd /k "npm run dev"

echo.
echo Esperando a que los sistemas arranquen...
timeout /t 5 /nobreak >nul

echo 4. Abriendo aplicacion...
start http://localhost:1420

echo.
echo ==========================================
echo      SISTEMA OPERATIVO Y LISTO
echo ==========================================
echo Puedes minimizar esta ventana (no la cierres).
echo.
pause
