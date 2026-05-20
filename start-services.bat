@echo off
chcp 65001 >nul
title Khoi dong He thong Quan ly Thuc tap

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "ZALO=%ROOT%ZALO\ZALO"
set "CV_ANALYZER=%BACKEND%\cv_analyzer"
set "TESSERACT=C:\Program Files\Tesseract-OCR\tesseract.exe"

echo ============================================
echo   He thong Quan ly Thuc tap - DaiNam CNTT
echo ============================================
echo.

:: ── Kiem tra Python ─────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Python. Vui long cai Python 3.10+ truoc.
    pause
    exit /b 1
)

:: ── Kiem tra Node.js ─────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Node.js. Vui long cai Node.js 18+ truoc.
    pause
    exit /b 1
)

:: ── Kiem tra Tesseract ────────────────────────────────────────────────
if not exist "%TESSERACT%" (
    echo [CANH BAO] Khong tim thay Tesseract tai: %TESSERACT%
    echo CV Analyzer van chay nhung OCR se bi tat.
    set "TESSERACT="
)

echo [1/4] Khoi dong CV Analyzer ^(port 5000^)...
start "CV Analyzer" /MIN cmd /c "cd /d "%CV_ANALYZER%" && set TESSERACT_CMD=%TESSERACT%&& set PORT=5000 && python app.py 2>&1 | tee "%TEMP%\cv_analyzer.log""

timeout /t 3 /nobreak >nul

echo [2/4] Khoi dong Zalo Bot ^(port 5001^)...
start "Zalo Bot" /MIN cmd /c "cd /d "%ZALO%" && set FLASK_RUN_PORT=5001 && set FLASK_RUN_HOST=127.0.0.1 && python app.py 2>&1 | tee "%TEMP%\zalo_bot.log""

timeout /t 3 /nobreak >nul

echo [3/4] Khoi dong Backend Node.js ^(port 3001^)...
start "Backend API" /MIN cmd /c "cd /d "%BACKEND%" && npm run dev 2>&1 | tee "%TEMP%\backend.log""

timeout /t 4 /nobreak >nul

echo [4/4] Khoi dong Frontend React ^(port 5173^)...
start "Frontend" /MIN cmd /c "cd /d "%ROOT%quanly-thuctap" && npm run dev 2>&1 | tee "%TEMP%\frontend.log""

echo.
echo ============================================
echo   Dang cho cac dich vu khoi dong...
echo ============================================
timeout /t 10 /nobreak >nul

:: Kiem tra trang thai
echo.
echo [Ket qua kiem tra]
curl -s http://localhost:5000/health >nul 2>&1 && echo   CV Analyzer  ^(5000^) : OK || echo   CV Analyzer  ^(5000^) : DANG KHOI DONG...
curl -s http://localhost:5001/health >nul 2>&1 && echo   Zalo Bot     ^(5001^) : OK || echo   Zalo Bot     ^(5001^) : DANG KHOI DONG...
curl -s http://localhost:3001/api/health >nul 2>&1 && echo   Backend API  ^(3001^) : OK || echo   Backend API  ^(3001^) : DANG KHOI DONG...
curl -s http://localhost:5173 >nul 2>&1 && echo   Frontend     ^(5173^) : OK || echo   Frontend     ^(5173^) : DANG KHOI DONG...

echo.
echo Truy cap he thong tai: http://localhost:5173
echo.
echo Logs:
echo   CV Analyzer : %TEMP%\cv_analyzer.log
echo   Zalo Bot    : %TEMP%\zalo_bot.log
echo   Backend     : %TEMP%\backend.log
echo.
pause
