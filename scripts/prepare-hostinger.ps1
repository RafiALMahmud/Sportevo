$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
New-Item -ItemType Directory -Path $packagePath -Force | Out-Null
Push-Location (Join-Path $workspacePath 'frontend')
try {
    & npm.cmd run build:local
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }

# Explicit allowlist keeps .env, local logs, database files and uploads out of the package.
$privateArchive = Join-Path $packagePath 'backend.tar.gz'
& tar.exe -czf $privateArchive --exclude=bootstrap/cache/*.php -C $backendPath app bootstrap config database resources routes artisan composer.json composer.lock
if ($LASTEXITCODE -ne 0) { throw 'Private archive failed.' }

$publicPath = Join-Path $packagePath 'public'
New-Item -ItemType Directory -Path $publicPath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $backendPath 'public/.htaccess') -Destination $publicPath
Copy-Item -LiteralPath (Join-Path $backendPath 'public/favicon.svg') -Destination $publicPath
Copy-Item -LiteralPath (Join-Path $backendPath 'public/build') -Destination $publicPath -Recurse -Force
$index = @'
<?php
use Illuminate\Http\Request;
define('LARAVEL_START', microtime(true));
$base = dirname(__DIR__).'/sportevo';
if (file_exists($maintenance = $base.'/storage/framework/maintenance.php')) { require $maintenance; }
require $base.'/vendor/autoload.php';
$app = require_once $base.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);
$app->handleRequest(Request::capture());
'@
[IO.File]::WriteAllText((Join-Path $publicPath 'index.php'), $index, [Text.UTF8Encoding]::new($false))
& tar.exe -czf (Join-Path $packagePath 'public.tar.gz') -C $publicPath .
if ($LASTEXITCODE -ne 0) { throw 'Public archive failed.' }
Write-Output "Packages ready in $packagePath"
Write-Output 'Upload .env.hostinger separately as sportevo/.env, outside public_html.'
