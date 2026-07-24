$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot "tmp\dev-ui\vite.pid"
if (-not (Test-Path $pidFile)) { Write-Host "NPMS UI is not running."; exit 0 }
$vitePid = [int](Get-Content -Raw $pidFile)
$process = Get-Process -Id $vitePid -ErrorAction SilentlyContinue
if ($process) { Stop-Process -Id $vitePid; Write-Host "Stopped NPMS hot-reload UI (PID $vitePid)." }
Remove-Item -LiteralPath $pidFile -Force
