@echo off
echo Starting LeadFlow...

start "LeadFlow App" cmd /k "cd C:\Users\win11\Downloads\Exora_Crm\exora_crm && npm start"

timeout /t 5

start "ngrok" cmd /k "ngrok http --domain=esmeralda-nacred-lostly.ngrok-free.dev 3001"

echo LeadFlow Started Successfully!