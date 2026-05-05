@echo off
REM Arranca server + poller en ventanas separadas.
REM Cierra cualquiera de las ventanas para detener ese servicio.

setlocal
set ROOT=%~dp0

echo Starting luxalgo-alerts...
echo.

start "luxalgo-server" cmd /k "cd /d %ROOT%server && node index.js"

REM dale 2s al server para levantar antes de que el poller intente postear
timeout /t 2 /nobreak >nul

start "luxalgo-poller" cmd /k "cd /d %ROOT%poller && node index.js"

echo Both services launched in separate windows.
echo Close those windows to stop.
endlocal
