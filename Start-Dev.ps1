$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendLog = Join-Path $projectRoot '.backend-dev.log'
$frontendLog = Join-Path $projectRoot '.vite-dev.log'
$schedulerLog = Join-Path $projectRoot '.scheduler-dev.log'
$queueLog = Join-Path $projectRoot '.queue-dev.log'

$backendCommand = @"
Set-Location -LiteralPath '$projectRoot'
php -d extension=pdo_pgsql -d extension=pgsql -d extension=gd -d upload_max_filesize=10M -d post_max_size=12M -S 127.0.0.1:8080 -t backend/public backend/server.php *> '$backendLog'
"@

$frontendCommand = @"
Set-Location -LiteralPath '$projectRoot\web'
npm run dev -- --host 127.0.0.1 --strictPort *> '$frontendLog'
"@

Start-Process -FilePath 'powershell.exe' `
    -WorkingDirectory $projectRoot `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand)

Start-Process -FilePath 'powershell.exe' `
    -WorkingDirectory (Join-Path $projectRoot 'web') `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand)

$schedulerCommand = @"
Set-Location -LiteralPath '$projectRoot'
php backend/artisan schedule:work *> '$schedulerLog'
"@

$queueCommand = @"
Set-Location -LiteralPath '$projectRoot'
php backend/artisan queue:work database --queue=notifications --sleep=3 --tries=3 *> '$queueLog'
"@

Start-Process -FilePath 'powershell.exe' `
    -WorkingDirectory (Join-Path $projectRoot 'backend') `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $schedulerCommand)

Start-Process -FilePath 'powershell.exe' `
    -WorkingDirectory (Join-Path $projectRoot 'backend') `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $queueCommand)

Write-Host 'Palemo development servers started.' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'API:      http://localhost:8080'
Write-Host "Logs:     $backendLog"
Write-Host "          $frontendLog"
Write-Host "          $schedulerLog"
Write-Host "          $queueLog"
