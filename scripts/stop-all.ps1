#Requires -Version 5.1
# Dung toan bo cac service cua he thong

Write-Host "Dang dung tat ca service..." -ForegroundColor Yellow

@(5000, 5001, 3001, 5173) | ForEach-Object {
    $port = $_
    $conn = netstat -ano 2>$null | Select-String ":$port\s" | Select-String 'LISTENING'
    foreach ($line in $conn) {
        $pid_ = ($line -split '\s+')[-1]
        if ($pid_ -match '^\d+$') {
            try {
                Stop-Process -Id ([int]$pid_) -Force -ErrorAction SilentlyContinue
                Write-Host "  Tat port $port (PID $pid_)" -ForegroundColor Gray
            } catch {}
        }
    }
}

Write-Host ""
Write-Host "Da dung tat ca service." -ForegroundColor Green
