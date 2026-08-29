#
.SYNOPSIS
    Startstop Vite and `php artisan serve` together in the background (WindowsPowerShell).

.USAGE
    .dev-serve.ps1 start      Start both processes (default)
    .dev-serve.ps1 stop       Stop both processes
    .dev-serve.ps1 restart    Stop then start
    .dev-serve.ps1 status     Show whether each process is running
    .dev-serve.ps1 logs       Tail both log files

    Logs go to .storagelogsvite.log and .storagelogsartisan-serve.log
    PIDs are tracked in ..dev-serve.pid

.NOTES
    If scripts are blocked, run once as admin (or per-user)
      Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#

param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
    [string]$Action = 'start',

    [string]$ArtisanHost = '127.0.0.1',
    [int]$ArtisanPort = 8000
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidDir      = Join-Path $ProjectRoot '.dev-serve'
$LogDir      = Join-Path $ProjectRoot 'storagelogs'

$VitePidFile    = Join-Path $PidDir 'vite.pid'
$ArtisanPidFile = Join-Path $PidDir 'artisan-serve.pid'
$ViteLog        = Join-Path $LogDir 'vite.log'
$ArtisanLog     = Join-Path $LogDir 'artisan-serve.log'

New-Item -ItemType Directory -Force -Path $PidDir, $LogDir  Out-Null

function Test-Running {
    param([string]$PidFile)
    if (-not (Test-Path $PidFile)) { return $false }
    $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $procId) { return $false }
    return [bool](Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Start-One {
    param(
        [string]$Name,
        [string]$PidFile,
        [string]$LogFile,
        [string]$FilePath,
        [string[]]$ArgList
    )

    if (Test-Running $PidFile) {
        $procId = Get-Content $PidFile
        Write-Host OK  $Name already running (PID $procId)
        return
    }

    Write-Host   starting $Name...
    New-Item -ItemType File -Force -Path $LogFile  Out-Null

    $proc = Start-Process -FilePath $FilePath -ArgumentList $ArgList `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $LogFile.err `
        -WindowStyle Hidden -PassThru

    Set-Content -Path $PidFile -Value $proc.Id
    Start-Sleep -Milliseconds 400

    if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
        Write-Host     $Name started (PID $($proc.Id)), logging to $LogFile
    } else {
        Write-Host     FAILED to start $Name -- check $LogFile.err
        Remove-Item $PidFile -ErrorAction SilentlyContinue
    }
}

function Stop-One {
    param([string]$Name, [string]$PidFile)

    if (-not (Test-Running $PidFile)) {
        Write-Host OK  $Name not running
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        return
    }

    $procId = Get-Content $PidFile
    Write-Host --  stopping $Name (PID $procId)...
    try {
        # Kill the process tree (Start-Process with npmphp may spawn children)
        Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {
        Write-Host     could not stop PID $procId (may have already exited)
    }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host     $Name stopped
}

function Invoke-Start {
    # Vite on Windows, npm is npm.cmd
    Start-One -Name 'vite' -PidFile $VitePidFile -LogFile $ViteLog `
        -FilePath 'npm.cmd' -ArgList @('run', 'dev')

    Start-One -Name 'artisan serve' -PidFile $ArtisanPidFile -LogFile $ArtisanLog `
        -FilePath 'php' -ArgList @('artisan', 'serve', '--host', $ArtisanHost, '--port', $ArtisanPort)

    Write-Host ''
    Write-Host Laravel http${ArtisanHost}${ArtisanPort}
    Write-Host Logs    $LogDir
    Write-Host Run '.dev-serve.ps1 logs' to tail both, or '.dev-serve.ps1 stop' to shut down.
}

function Invoke-Stop {
    Stop-One -Name 'vite' -PidFile $VitePidFile
    Stop-One -Name 'artisan serve' -PidFile $ArtisanPidFile
}

function Invoke-Status {
    if (Test-Running $VitePidFile) {
        Write-Host vite           running (PID $(Get-Content $VitePidFile))
    } else {
        Write-Host vite           stopped
    }
    if (Test-Running $ArtisanPidFile) {
        Write-Host artisan serve  running (PID $(Get-Content $ArtisanPidFile))
    } else {
        Write-Host artisan serve  stopped
    }
}

function Invoke-Logs {
    New-Item -ItemType File -Force -Path $ViteLog, $ArtisanLog  Out-Null
    Get-Content -Path $ViteLog, $ArtisanLog -Wait -Tail 20
}

switch ($Action) {
    'start'   { Invoke-Start }
    'stop'    { Invoke-Stop }
    'restart' { Invoke-Stop; Invoke-Start }
    'status'  { Invoke-Status }
    'logs'    { Invoke-Logs }
}