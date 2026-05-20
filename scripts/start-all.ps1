#Requires -Version 5.1
<#
.SYNOPSIS
    Khởi động toàn bộ hệ thống Quản lý Thực tập - DaiNam CNTT
.DESCRIPTION
    Khởi động theo thứ tự:
      1. CV Analyzer (Python Flask) → port 5000
      2. Zalo Bot    (Python Flask) → port 5001
      3. Backend API (Node.js)      → port 3001
      4. Frontend    (React/Vite)   → port 5173
.PARAMETER SkipFrontend
    Bỏ qua khởi động frontend (chỉ chạy backend)
.PARAMETER PythonOnly
    Chỉ khởi động 2 service Python
.EXAMPLE
    .\scripts\start-all.ps1
    .\scripts\start-all.ps1 -PythonOnly
    .\scripts\start-all.ps1 -SkipFrontend
#>
param(
    [switch]$SkipFrontend,
    [switch]$PythonOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ROOT        = Split-Path $PSScriptRoot -Parent
$BACKEND     = Join-Path $ROOT  'backend'
$ZALO        = Join-Path $ROOT  'ZALO\ZALO'
$CV_ANALYZER = Join-Path $BACKEND 'cv_analyzer'
$FRONTEND    = Join-Path $ROOT  'quanly-thuctap'
$TESSERACT   = 'C:\Program Files\Tesseract-OCR\tesseract.exe'

function Write-Header {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  He thong Quan ly Thuc tap - DaiNam CNTT  " -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $total, $msg) {
    Write-Host "[$n/$total] $msg" -ForegroundColor Yellow
}

function Write-OK($msg)   { Write-Host "  [OK] $msg"    -ForegroundColor Green  }
function Write-Warn($msg) { Write-Host "  [!!] $msg"    -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [LOI] $msg"   -ForegroundColor Red    }

# ── Kill processes trên port ─────────────────────────────────────────────────
function Stop-PortProcess([int]$Port) {
    $conn = netstat -ano 2>$null | Select-String ":$Port\s" | Select-String 'LISTENING'
    foreach ($line in $conn) {
        $pid_ = ($line -split '\s+')[-1]
        if ($pid_ -match '^\d+$') {
            try {
                Stop-Process -Id ([int]$pid_) -Force -ErrorAction SilentlyContinue
                Write-Warn "Tat process cu tren port $Port (PID $pid_)"
            } catch {}
        }
    }
}

# ── Kiem tra port co mo khong ────────────────────────────────────────────────
function Test-Port([int]$Port, [int]$TimeoutSec = 15) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $Port)
            $tcp.Close()
            return $true
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ── Kiem tra health HTTP ─────────────────────────────────────────────────────
function Test-Health([string]$Url) {
    try {
        $r = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Header

# Kiem tra tools
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Err "Chua cai Python. Vui long cai Python 3.10+."
    exit 1
}
if (-not $PythonOnly -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Chua cai Node.js. Vui long cai Node.js 18+."
    exit 1
}
if (-not (Test-Path $TESSERACT)) {
    Write-Warn "Khong tim thay Tesseract tai: $TESSERACT"
    Write-Warn "CV Analyzer van chay nhung OCR se bi giam chat luong."
    $TESSERACT = $null
}

$total = if ($PythonOnly) { 2 } elseif ($SkipFrontend) { 3 } else { 4 }

# ── 1. CV Analyzer ────────────────────────────────────────────────────────────
Write-Step 1 $total "Khoi dong CV Analyzer (port 5000)..."
Stop-PortProcess 5000

$cvEnv = @{ PORT = '5000' }
if ($TESSERACT) { $cvEnv['TESSERACT_CMD'] = $TESSERACT }

$cvArgs = @{
    FilePath         = 'python'
    ArgumentList     = 'app.py'
    WorkingDirectory = $CV_ANALYZER
    WindowStyle      = 'Minimized'
    PassThru         = $true
}
$cvProc = Start-Process @cvArgs -Environment $cvEnv
Write-OK "CV Analyzer dang khoi dong (PID $($cvProc.Id))..."

# ── 2. Zalo Bot ───────────────────────────────────────────────────────────────
Write-Step 2 $total "Khoi dong Zalo Bot (port 5001)..."
Stop-PortProcess 5001

$zaloEnv = @{ FLASK_RUN_PORT = '5001'; FLASK_RUN_HOST = '0.0.0.0' }

$zaloArgs = @{
    FilePath         = 'python'
    ArgumentList     = 'app.py'
    WorkingDirectory = $ZALO
    WindowStyle      = 'Minimized'
    PassThru         = $true
}
$zaloProc = Start-Process @zaloArgs -Environment $zaloEnv
Write-OK "Zalo Bot dang khoi dong (PID $($zaloProc.Id))..."

if ($PythonOnly) {
    Write-Host ""
    Write-Host "Cho cac service Python san sang..." -ForegroundColor Cyan
    Start-Sleep -Seconds 8

    $cv5000 = Test-Health 'http://localhost:5000/health'
    $zalo5001 = Test-Health 'http://localhost:5001/health'

    Write-Host ""
    Write-Host "=== Ket qua ===" -ForegroundColor Cyan
    if ($cv5000)   { Write-OK "CV Analyzer   (5000): DANG CHAY" } else { Write-Warn "CV Analyzer   (5000): DANG KHOI DONG (co the mat den 30s)" }
    if ($zalo5001) { Write-OK "Zalo Bot      (5001): DANG CHAY" } else { Write-Err "Zalo Bot      (5001): CHUA SAN SANG" }
    exit 0
}

# ── 3. Backend Node.js ────────────────────────────────────────────────────────
Write-Step 3 $total "Khoi dong Backend API (port 3001)..."

$backendArgs = @{
    FilePath         = 'npm'
    ArgumentList     = 'run', 'dev'
    WorkingDirectory = $BACKEND
    WindowStyle      = 'Minimized'
    PassThru         = $true
}
$backendProc = Start-Process @backendArgs
Write-OK "Backend dang khoi dong (PID $($backendProc.Id))..."

# ── 4. Frontend React ─────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step 4 $total "Khoi dong Frontend React (port 5173)..."

    $frontendArgs = @{
        FilePath         = 'npm'
        ArgumentList     = 'run', 'dev'
        WorkingDirectory = $FRONTEND
        WindowStyle      = 'Minimized'
        PassThru         = $true
    }
    $frontendProc = Start-Process @frontendArgs
    Write-OK "Frontend dang khoi dong (PID $($frontendProc.Id))..."
}

# ── Cho tat ca san sang ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Dang cho cac dich vu khoi dong (toi da 45 giay)..." -ForegroundColor Cyan

$services = @(
    @{ Name = 'CV Analyzer  '; Url = 'http://localhost:5000/health'; Port = 5000 }
    @{ Name = 'Zalo Bot     '; Url = 'http://localhost:5001/health'; Port = 5001 }
    @{ Name = 'Backend API  '; Url = 'http://localhost:3001/api/health'; Port = 3001 }
)
if (-not $SkipFrontend) {
    $services += @{ Name = 'Frontend     '; Url = 'http://localhost:5173'; Port = 5173 }
}

$deadline = (Get-Date).AddSeconds(45)
$done = @{}

while ((Get-Date) -lt $deadline -and $done.Count -lt $services.Count) {
    foreach ($svc in $services) {
        if ($done.ContainsKey($svc.Name)) { continue }
        if (Test-Health $svc.Url) {
            Write-OK "$($svc.Name) (port $($svc.Port)): DANG CHAY"
            $done[$svc.Name] = $true
        }
    }
    if ($done.Count -lt $services.Count) { Start-Sleep -Seconds 2 }
}

# Bao cao cuoi
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Ket qua khoi dong                        " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

foreach ($svc in $services) {
    if ($done.ContainsKey($svc.Name)) {
        Write-OK "$($svc.Name) : DANG CHAY"
    } else {
        $health = Test-Health $svc.Url
        if ($health) { Write-OK "$($svc.Name) : DANG CHAY"   }
        else          { Write-Warn "$($svc.Name) : DANG KHOI DONG / KIEM TRA LOG" }
    }
}

Write-Host ""
Write-Host "Truy cap he thong tai: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Green
Write-Host ""
