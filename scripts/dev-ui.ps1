$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $projectRoot "web"
$runtimeRoot = Join-Path $projectRoot "tmp\dev-ui"
$pidFile = Join-Path $runtimeRoot "vite.pid"
$stdoutFile = Join-Path $runtimeRoot "vite.out.log"
$stderrFile = Join-Path $runtimeRoot "vite.err.log"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (Test-Path $pidFile) {
    $existingPid = [int](Get-Content -Raw $pidFile)
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
        Write-Host "NPMS UI is already running at http://localhost:5173 (PID $existingPid)"
        exit 0
    }
    Remove-Item -LiteralPath $pidFile -Force
}

if (-not (Test-Path (Join-Path $webRoot "node_modules"))) {
    Push-Location $webRoot
    try { npm install } finally { Pop-Location }
}

try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8080/health/ready" -TimeoutSec 3
    if ($health.StatusCode -ne 200) { throw "API is not ready" }
} catch {
    throw "NPMS API must be available at http://localhost:8080. Start it once before UI development."
}

# Some Windows environments expose both Path and PATH. Windows PowerShell Start-Process
# treats them as duplicate dictionary keys, so normalize them in this launcher process.
$pathValues = @([Environment]::GetEnvironmentVariables().GetEnumerator() | Where-Object { $_.Key.ToString().ToLowerInvariant() -eq "path" } | ForEach-Object { $_.Value })
[Environment]::SetEnvironmentVariable("PATH", $null, [EnvironmentVariableTarget]::Process)
[Environment]::SetEnvironmentVariable("Path", ($pathValues -join ";"), [EnvironmentVariableTarget]::Process)
$process = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--strictPort") -WorkingDirectory $webRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173" -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            Write-Host "NPMS hot-reload UI ready: http://localhost:5173"
            Write-Host "Frontend changes now appear without Docker rebuilds."
            exit 0
        }
    } catch {}
}

throw "Vite did not start. Check $stderrFile"

