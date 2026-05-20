@echo off
chcp 65001 >nul
title Python Services - CV Analyzer + Zalo Bot

set "ROOT=%~dp0"
set "ZALO=%ROOT%ZALO\ZALO"
set "CV_ANALYZER=%ROOT%backend\cv_analyzer"
set "TESSERACT=C:\Program Files\Tesseract-OCR\tesseract.exe"

echo [Python Services] Dang khoi dong...
echo.

:: Tat process cu neu con chay
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    echo Tat process cu tren port 5000 ^(PID: %%a^)
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5001 " ^| findstr "LISTENING"') do (
    echo Tat process cu tren port 5001 ^(PID: %%a^)
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Khoi dong CV Analyzer (port 5000)
echo [1/2] Khoi dong CV Analyzer tren port 5000...
if exist "%TESSERACT%" (
    start "CV Analyzer :5000" /MIN cmd /c "cd /d "%CV_ANALYZER%" && set TESSERACT_CMD=%TESSERACT%&& set PORT=5000 && python app.py"
) else (
    start "CV Analyzer :5000" /MIN cmd /c "cd /d "%CV_ANALYZER%" && set PORT=5000 && python app.py"
)

:: Khoi dong Zalo Bot (port 5001)
echo [2/2] Khoi dong Zalo Bot tren port 5001...
start "Zalo Bot :5001" /MIN cmd /c "cd /d "%ZALO%" && set FLASK_RUN_PORT=5001 && set FLASK_RUN_HOST=0.0.0.0 && python app.py"

echo.
echo Cho 12 giay de cac service khoi dong...
timeout /t 12 /nobreak >nul

:: Kiem tra ket qua
echo.
echo === Ket qua ===
curl -s --max-time 5 "http://localhost:5000/health" 2>nul | findstr "success" >nul && (
    echo [OK] CV Analyzer dang chay tai http://localhost:5000
) || (
    echo [DANG KHOI DONG] CV Analyzer chua san sang ^(co the mat den 30s de load model^)
)

curl -s --max-time 5 "http://localhost:5001/health" 2>nul | findstr "ok" >nul && (
    echo [OK] Zalo Bot dang chay tai http://localhost:5001
) || (
    echo [LOI] Zalo Bot chua san sang
)

echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul
