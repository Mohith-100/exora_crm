@echo off
echo Stopping existing processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im ngrok.exe >nul 2>&1
timeout /t 2

echo Starting LeadFlow App...
start "LeadFlow App" cmd /k "cd C:\Users\Mohith P\Downloads\Crm && npm start"
timeout /t 5

echo Starting LeadFlow App...
start "Backend" cmd /k "cd C:\Users\Mohith P\Downloads\Crm && node server.js"
timeout /t 5

echo Starting LeadFlow App...
start "Kanbn" cmd /k "cd C:\Users\Mohith P\Downloads\Crm\kanbn\apps\web && set PORT=3002 && pnpm dev"
timeout /t 5

echo Starting ngrok...
start "ngrok" cmd /k "ngrok http --domain=eustatically-squamous-jordyn.ngrok-free.dev 3001"

echo.
echo LeadFlow is running!
echo App    → http://localhost:3001
echo Public → https://eustatically-squamous-jordyn.ngrok-free.dev
pause