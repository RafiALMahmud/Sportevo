param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'admin-deletions-update.tar.gz'
$statePath = Join-Path $packagePath 'admin-deletions-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-admin-deletions-update.log'
$files = @(
    'app/Http/Controllers/Api/AdminController.php',
    'app/Http/Controllers/Api/BookingController.php',
    'app/Http/Controllers/Api/TurfController.php',
    'app/Http/Controllers/Api/WorkflowController.php',
    'app/Http/Controllers/SitemapController.php',
    'app/Models/Booking.php',
    'app/Models/Field.php',
    'app/Models/Turf.php',
    'app/Models/TurfPhoto.php',
    'app/Services/FacilityDeletion.php',
    'routes/api.php',
    'database/migrations/2026_10_13_000002_add_soft_deletes_to_fields.php'
)
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-admin-deletions-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Deployment archive failed.' }
    $name = '.sportevo-admin-deletions-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Enter your HOSTINGER SSH password for upload and activation.'
Write-Host 'This adds admin deletion controls and a nullable field archive date. It does not delete existing accounts, complexes, fields, bookings or photos.'
Write-Host 'Environment settings and encryption keys stay intact. A brief maintenance window applies the additive migration.'
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
  tar -czf "$stage/previous-code.tar.gz" -C "$app" app routes database/migrations bootstrap/cache
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
fi
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
test -f "$stage/public/build/manifest.json"
files='app/Http/Controllers/Api/AdminController.php app/Http/Controllers/Api/BookingController.php app/Http/Controllers/Api/TurfController.php app/Http/Controllers/Api/WorkflowController.php app/Http/Controllers/SitemapController.php app/Models/Booking.php app/Models/Field.php app/Models/Turf.php app/Models/TurfPhoto.php app/Services/FacilityDeletion.php routes/api.php database/migrations/2026_10_13_000002_add_soft_deletes_to_fields.php'
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
    php artisan route:clear
    php artisan config:cache
    chmod 600 bootstrap/cache/config.php
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    echo PREVIOUS_RELEASE_RESTORE_ATTEMPTED
  fi
  php artisan up
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
export SPORTEVO_DEPLOY_STAGE="$stage"
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$counts = [];
foreach (['users', 'turfs', 'fields', 'bookings', 'wallet_entries', 'turf_photos'] as $table) {
    $counts[$table] = Illuminate\Support\Facades\DB::table($table)->count();
}
$snapshot = ['counts' => $counts, 'environment' => hash_file('sha256', base_path('.env'))];
if (file_put_contents(getenv('SPORTEVO_DEPLOY_STAGE').'/before.json', json_encode($snapshot, JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Deployment verification snapshot failed.');
}
PHP
for file in $files; do
  mkdir -p "$(dirname "$app/$file")"
  cp "$stage/$file" "$app/$file"
  chmod 644 "$app/$file"
done
php artisan migrate --force --path=database/migrations/2026_10_13_000002_add_soft_deletes_to_fields.php
php artisan route:clear
php artisan config:cache
chmod 600 bootstrap/cache/config.php
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!Illuminate\Support\Facades\Schema::hasColumn('fields', 'deleted_at')) throw new RuntimeException('Field archive migration is missing.');
$before = json_decode(file_get_contents(getenv('SPORTEVO_DEPLOY_STAGE').'/before.json'), true, flags: JSON_THROW_ON_ERROR);
foreach ($before['counts'] as $table => $count) {
    if (Illuminate\Support\Facades\DB::table($table)->count() !== $count) throw new RuntimeException('Row counts changed during deployment: '.$table);
}
if (hash_file('sha256', base_path('.env')) !== $before['environment']) throw new RuntimeException('Environment configuration changed.');
$route = Illuminate\Support\Facades\Route::getRoutes()->match(Illuminate\Http\Request::create('/api/admin/turfs/0/fields/0', 'DELETE'));
if ($route->getActionMethod() !== 'destroyField') throw new RuntimeException('Admin field deletion route missing.');
echo 'FIELD_ARCHIVE_AND_ADMIN_ROUTES_READY'.PHP_EOL;
echo 'EXISTING_DATABASE_ROWS_AND_ENV_PRESERVED'.PHP_EOL;
PHP
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.pending"
chmod 644 "$public/build/manifest.pending"
mv "$public/build/manifest.pending" "$public/build/manifest.json"
php artisan queue:restart
php artisan up
trap - EXIT HUP INT TERM
echo ADMIN_DELETIONS_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; restoration of the previous release was attempted. See the log. Retry with -Resume.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
