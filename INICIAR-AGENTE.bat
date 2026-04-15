@echo off
title 🤖 Agente IA — Iniciando...
color 0A
cls

echo.
echo  ╔════════════════════════════════════════════╗
echo  ║     🤖  AGENTE DE ATENCION AL CLIENTE      ║
echo  ╚════════════════════════════════════════════╝
echo.

REM Verificar que existe node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js no está instalado.
    echo  👉 Descargalo en: https://nodejs.org
    echo.
    pause
    exit /b
)

REM Verificar que existe el archivo .env
if not exist ".env" (
    echo  ⚠️  No encontré el archivo .env
    echo.
    echo  👉 Copiá el archivo .env.example y renombralo como .env
    echo  👉 Abrilo con el Bloc de Notas y pegá tu API Key de Groq
    echo  👉 Conseguila GRATIS en: https://console.groq.com
    echo.
    pause
    exit /b
)

REM Instalar dependencias si no existen
if not exist "node_modules" (
    echo  📦 Instalando dependencias por primera vez...
    echo     ^(Esto puede tardar 1-2 minutos^)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ❌ Error al instalar dependencias.
        echo  👉 Verificá que tenés conexión a internet.
        pause
        exit /b
    )
    echo.
    echo  ✅ Dependencias instaladas correctamente.
    echo.
)

REM Abrir el navegador después de 3 segundos
echo  🌐 Abriendo el navegador en 3 segundos...
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

echo.
echo  ╔════════════════════════════════════════════╗
echo  ║  ✅ AGENTE ACTIVO                          ║
echo  ║                                            ║
echo  ║  Dashboard : http://localhost:3000         ║
echo  ║  Demo Chat : http://localhost:3000/demo    ║
echo  ║  Widget    : http://localhost:3000/widget  ║
echo  ║                                            ║
echo  ║  Para APAGAR: cerrá esta ventana           ║
echo  ║  o presioná Ctrl + C                       ║
echo  ╚════════════════════════════════════════════╝
echo.

REM Iniciar el servidor
node server.js

echo.
echo  ⛔ El servidor se detuvo.
pause
