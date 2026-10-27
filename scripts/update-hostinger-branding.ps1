$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$archive = Join-Path $backendPath 'storage/app/private/hostinger-deploy/branding-update.tar.gz'
$files = @('app/Services/BookingNotificationService.php', 'app/Http/Controllers/Api/AuthController.php', 'app/Http/Controllers/Api/OperationsController.php', 'resources/views/app.blade.php')
& tar.exe -czf $archive -C $backendPath @files public/build
if ($LASTEXITCODE -ne 0) { throw 'Update archive failed.' }
$remote = 'u302655234@147.93.78.83'
$name = '.sportevo-branding-' + [Guid]::NewGuid().ToString('N')
$logPath = Join-Path $backendPath 'storage/logs/hostinger-branding-update.log'
Write-Host 'Enter your SSH password for upload and activation. This updates the SportEvo brand name in pages, metadata and emails. Existing database, encryption keys and credentials stay intact.'
try {
    & scp -P 65002 $archive "${remote}:$name.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed.' }
    $command = @'
set -eu
umask 077
name=STAGE_NAME
stage="$HOME/$name"
app="$HOME/domains/sportevo.games/sportevo"
public="$HOME/domains/sportevo.games/public_html"
test -f "$app/artisan"
test -f "$public/index.php"
mkdir "$stage"
tar -czf "$stage/previous-code.tar.gz" -C "$app" app/Services app/Http/Controllers/Api resources/views
tar -czf "$stage/previous-build.tar.gz" -C "$public" build
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
for file in app/Services/BookingNotificationService.php app/Http/Controllers/Api/AuthController.php app/Http/Controllers/Api/OperationsController.php resources/views/app.blade.php; do
  php -l "$stage/$file"
done
for file in app/Services/BookingNotificationService.php app/Http/Controllers/Api/AuthController.php app/Http/Controllers/Api/OperationsController.php resources/views/app.blade.php; do
  cp "$stage/$file" "$app/$file"
  chmod 644 "$app/$file"
done
cd "$app"
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$path = base_path('.env');
$content = file_get_contents($path);
foreach (['SESSION_COOKIE' => config('session.cookie'), 'CACHE_PREFIX' => config('cache.prefix')] as $key => $value) {
    if (!preg_match('/^'.preg_quote($key, '/').'=/m', $content)) $content .= PHP_EOL.$key.'="'.$value.'"'.PHP_EOL;
}
foreach (['APP_NAME', 'MAIL_FROM_NAME'] as $key) {
    $line = $key.'="SportEvo"';
    if (preg_match('/^'.$key.'=/m', $content)) $content = preg_replace('/^'.$key.'=.*$/m', $line, $content);
    else $content .= PHP_EOL.$line.PHP_EOL;
}
if (file_put_contents($path, $content) === false) throw new RuntimeException('Brand configuration update failed.');
chmod($path, 0600);
echo 'Brand display name updated; credentials and encryption keys preserved.'.PHP_EOL;
PHP
php artisan config:cache
chmod 600 bootstrap/cache/config.php
php artisan view:clear
php artisan view:cache
cp -R "$stage/public/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/manifest.json"
echo BRANDING_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Update failed. See the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
