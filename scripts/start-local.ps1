param(
    [ValidateRange(1024, 65535)][int]$Port = 8001,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$frontendPath = Join-Path $workspacePath 'frontend'
$phpPath = (Get-Command php -ErrorAction Stop).Source

if (-not $SkipBuild) {
    Push-Location $frontendPath
    try {
        & npm.cmd run build:local
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'public/build/manifest.json'))) {
    throw 'Missing frontend build. Run npm run build:local in frontend first.'
}

# Enable the installed opcode cache for these processes only; do not edit php.ini.
$phpFlags = @()
$modules = & $phpPath -m
$opcacheDll = Join-Path (Split-Path -Parent $phpPath) 'ext/php_opcache.dll'
if (($modules -notcontains 'Zend OPcache') -and (Test-Path -LiteralPath $opcacheDll)) {
    $phpFlags += @('-d', ('zend_extension="' + $opcacheDll + '"'))
}
$phpFlags += @('-d', 'opcache.enable_cli=1', '-d', 'opcache.validate_timestamps=1', '-d', 'opcache.revalidate_freq=1')

$listener = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($listener.Count -gt 0) {
    $server = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener[0].OwningProcess)
    if ($server.CommandLine -notmatch [regex]::Escape($backendPath)) {
        throw "Port $Port belongs to another process. Choose another port; no existing process was stopped."
    }
    Write-Output ("Existing Sportsevo server PID: " + $server.ProcessId)
} else {
    $publicPath = Join-Path $backendPath 'public'
    $routerPath = Join-Path $backendPath 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'
    $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $serverArgs = $phpFlags + @('-S', "127.0.0.1:$Port", '-t', ('"' + $publicPath + '"'), ('"' + $routerPath + '"'))
    $server = Start-Process -FilePath $phpPath -WorkingDirectory $publicPath -ArgumentList $serverArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backendPath "storage/logs/local-http-$runStamp.log") -RedirectStandardError (Join-Path $backendPath "storage/logs/local-http-$runStamp-error.log")
    Write-Output ("Started Sportsevo HTTP server PID: " + $server.Id)
}

$workers = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'php.exe' -and $_.CommandLine -match 'queue:work' -and $_.CommandLine -match [regex]::Escape($backendPath) })
if ($workers.Count -eq 0) {
    $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $workerArgs = $phpFlags + @(('"' + (Join-Path $backendPath 'artisan') + '"'), 'queue:work', '--sleep=1', '--tries=5', '--timeout=60')
    $worker = Start-Process -FilePath $phpPath -WorkingDirectory $backendPath -ArgumentList $workerArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backendPath "storage/logs/local-mail-$runStamp.log") -RedirectStandardError (Join-Path $backendPath "storage/logs/local-mail-$runStamp-error.log")
    Write-Output ("Started Sportsevo mail worker PID: " + $worker.Id)
} else {
    Write-Output ("Existing Sportsevo mail worker PID(s): " + ($workers.ProcessId -join ', '))
}
Write-Output "Sportsevo local URL: http://localhost:$Port"
Write-Output 'Loopback-only local hosting. This PHP development server is not a production load balancer.'
