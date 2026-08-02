@echo off
echo 🚀 Starting ExoraLeadForge CRM...

start "LeadFlow Server" cmd /k "cd /d C:\Users\Mohith P\Downloads\Crm && node server.js"

timeout /t 3 /nobreak >nul

start "Kan.bn" cmd /k "cd /d C:\Users\Mohith P\Downloads\Crm\kanbn\apps\web && set PORT=3002 && pnpm dev"

timeout /t 3 /nobreak >nul

start "Ngrok" cmd /k "ngrok http --domain=eustatically-squamous-jordyn.ngrok-free.dev 3001"

echo ✅ All services starting...
echo.
echo 📋 URLs:
echo    LeadFlow CRM  → http://localhost:3001
echo    Kan.bn        → http://localhost:3002
echo    Public URL    → https://eustatically-squamous-jordyn.ngrok-free.dev
echo.
pause