param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'site-release.tar.gz'
$statePath = Join-Path $packagePath 'site-release-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-site-release.log'
$files = @(
    'app/Http/Controllers/Api/ContactMessageController.php',
    'app/Http/Controllers/Api/DashboardController.php',
    'app/Http/Controllers/Api/AuthController.php',
    'app/Models/ContactMessage.php',
    'app/Providers/AppServiceProvider.php',
    'app/Services/BookingNotificationService.php',
    'routes/api.php',
    'resources/views/app.blade.php',
    'database/migrations/2026_10_13_000001_create_contact_messages_table.php'
)
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-release-[a-f0-9]{32}$') { throw 'Invalid release state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Release archive failed.' }
    $name = '.sportevo-release-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Deploying the current SportEvo website, contact inbox and generated assets.'
Write-Host 'Enter the HOSTINGER SSH account password for u302655234 at each prompt. Gmail credentials are already configured.'
Write-Host 'Existing data, photos, credentials and encryption keys are preserved. A brief maintenance window applies the additive contact-table migration.'
try {
    if (-not $Resume) {
        & scp -P 65002 $archive "${remote}:$name.tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed; the hosted site was not activated.' }
    }
    $command = @'
set -eu
umask 077
name=STAGE_NAME
stage="$HOME/$name"
app="$HOME/domains/sportevo.games/sportevo"
public="$HOME/domains/sportevo.games/public_html"
test -f "$app/artisan"
test -f "$public/index.php"
mkdir -p "$stage"
chmod 700 "$stage"
if ! test -f "$stage/previous-code.tar.gz"; then
  tar -czf "$stage/previous-code.tar.gz" -C "$app" app routes resources/views database/migrations bootstrap/cache
  cp "$app/.env" "$stage/previous.env"
  chmod 600 "$stage/previous.env"
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
fi
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
test -f "$stage/public/build/manifest.json"
files='app/Http/Controllers/Api/ContactMessageController.php app/Http/Controllers/Api/DashboardController.php app/Http/Controllers/Api/AuthController.php app/Models/ContactMessage.php app/Providers/AppServiceProvider.php app/Services/BookingNotificationService.php routes/api.php resources/views/app.blade.php database/migrations/2026_10_13_000001_create_contact_messages_table.php'
for file in $files; do php -l "$stage/$file"; done
mkdir -p "$public/build/assets"
cp -R "$stage/public/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cd "$app"
php artisan down --retry=15
finish() {
  result=$?
  set +e
  if test "$result" -ne 0; then
    echo RESTORING_PREVIOUS_RELEASE
    tar -xzf "$stage/previous-code.tar.gz" -C "$app"
    cp "$stage/previous.env" "$app/.env"
    chmod 600 "$app/.env"
    php artisan route:clear
    php artisan config:cache
    chmod 600 bootstrap/cache/config.php
    php artisan view:cache
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    echo PREVIOUS_RELEASE_RESTORE_ATTEMPTED
  fi
  php artisan up
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
for file in $files; do
  mkdir -p "$(dirname "$app/$file")"
  cp "$stage/$file" "$app/$file"
  chmod 644 "$app/$file"
done
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$path = base_path('.env');
$content = file_get_contents($path);
$before = Dotenv\Dotenv::parse($content);
foreach (['SESSION_COOKIE' => config('session.cookie'), 'CACHE_PREFIX' => config('cache.prefix')] as $key => $value) {
    if (! preg_match('/^'.preg_quote($key, '/').'=/m', $content)) $content .= PHP_EOL.$key.'="'.$value.'"'.PHP_EOL;
}
foreach (['APP_NAME', 'MAIL_FROM_NAME'] as $key) {
    $line = $key.'="SportEvo"';
    if (preg_match('/^'.$key.'=/m', $content)) $content = preg_replace('/^'.$key.'=.*$/m', $line, $content);
    else $content .= PHP_EOL.$line.PHP_EOL;
}
$after = Dotenv\Dotenv::parse($content);
foreach (['APP_KEY', 'DB_CONNECTION', 'DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'MAIL_USERNAME', 'MAIL_PASSWORD'] as $key) {
    if (($before[$key] ?? null) !== ($after[$key] ?? null)) throw new RuntimeException('Protected configuration changed.');
}
if (file_put_contents($path, $content) === false) throw new RuntimeException('Brand configuration write failed.');
chmod($path, 0600);
echo 'CREDENTIALS_AND_ENCRYPTION_KEY_PRESERVED'.PHP_EOL;
PHP
php artisan migrate --force --path=database/migrations/2026_10_13_000001_create_contact_messages_table.php
php artisan route:clear
php artisan config:cache
chmod 600 bootstrap/cache/config.php
php artisan view:cache
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.pending"
chmod 644 "$public/build/manifest.pending"
mv "$public/build/manifest.pending" "$public/build/manifest.json"
php artisan queue:restart
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!Illuminate\Support\Facades\Schema::hasTable('contact_messages')) throw new RuntimeException('Contact migration missing.');
if (config('app.name') !== 'SportEvo' || config('mail.from.name') !== 'SportEvo') throw new RuntimeException('Brand display configuration mismatch.');
echo 'CONTACT_INBOX_READY'.PHP_EOL;
echo 'ADMIN_NOTIFICATION_RECIPIENTS: '.App\Models\User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'superadmin']))->count().PHP_EOL;
echo 'EMAIL_QUEUE: '.config('queue.default').PHP_EOL;
PHP
php artisan up
trap - EXIT HUP INT TERM
echo SPORTEVO_SITE_RELEASE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; restoration of the previous release was attempted and maintenance was cleared. See the log. Retry this script with -Resume.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
