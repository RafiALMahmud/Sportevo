param([switch]$PrepareOnly, [switch]$UsePrepared, [switch]$Resume)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SportEvo - Coordinated feature deployment'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'maps-auth-update.tar.gz'
$statePath = Join-Path $packagePath 'maps-auth-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-maps-auth-update.log'
$remote = 'u302655234@147.93.78.83'
if (-not $UsePrepared -and -not $Resume) {
    & php (Join-Path $PSScriptRoot 'prepare-hostinger-maps-auth.php')
    if ($LASTEXITCODE -ne 0) { throw 'Google configuration preparation failed.' }
    & npm.cmd --prefix (Join-Path $workspacePath 'frontend') run build:local
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    $lintPaths = @('app', 'config', 'routes', 'database/migrations', 'bootstrap')
    foreach ($folder in $lintPaths) {
        foreach ($source in (Get-ChildItem -LiteralPath (Join-Path $backendPath $folder) -Filter '*.php' -File -Recurse | Where-Object { $_.FullName -notmatch '\\bootstrap\\cache\\' })) {
            & php -l $source.FullName | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "PHP syntax check failed: $($source.Name)" }
        }
    }
    # Explicit paths exclude credentials, database copies, logs, uploads and local vendor files.
    & tar.exe -czf $archive -C $backendPath app config routes resources database/migrations database/seeders database/factories bootstrap/app.php bootstrap/providers.php artisan composer.json composer.lock public/build -C $packagePath google-settings.json
    if ($LASTEXITCODE -ne 0) { throw 'Maps/auth archive failed.' }
    $name = '.sportevo-maps-auth-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name; sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$name = $state.stage
if ($name -notmatch '^\.sportevo-maps-auth-[a-f0-9]{32}$' -or $state.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid saved deployment state.' }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.sha256) { throw 'Prepared archive changed; prepare a fresh release.' }
if ($PrepareOnly) { Write-Output 'MAPS_AUTH_PACKAGE_READY'; return }
Write-Host 'Enter your Hostinger SSH password for upload and activation.'
Write-Host 'This publishes featured complexes, manual promotion payments, 10-minute advance options, mobile slot popups and the bilingual booking guide.'
Write-Host 'Dependencies are installed privately before maintenance. Existing records, uploads, SMTP credentials and encryption keys are preserved.'
Write-Host 'Only GOOGLE_CLIENT_ID is added/updated in production configuration. No Google Maps billing or client secret is used.'
$exitCode = 0
try {
    if (-not $Resume) {
        & scp -P 65002 $archive "${remote}:$name.tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed; activation was not started. Retry without -Resume.' }
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
if test -f "$stage/activation-complete"; then echo MAPS_AUTH_ALREADY_ACTIVATED; exit 0; fi
printf '%s  %s\n' 'ARCHIVE_HASH' "$HOME/$name.tar.gz" | sha256sum -c -
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
chmod 600 "$stage/google-settings.json"
command -v composer >/dev/null
php -r 'exit(version_compare(PHP_VERSION,"8.2.0",">=") ? 0 : 1);'
cd "$stage"
composer install --no-dev --prefer-dist --optimize-autoloader --no-scripts --no-interaction --no-progress
php -r 'require "vendor/autoload.php"; if (!class_exists("Firebase\\JWT\\JWT")) exit(1);'
echo STAGED_DEPENDENCIES_READY
cd "$app"
if command -v flock >/dev/null; then
  exec 9>storage/framework/maps-auth-deployment.lock
  flock -n 9 || { echo ANOTHER_MAPS_AUTH_DEPLOYMENT_IS_RUNNING; exit 1; }
fi
if ! test -f "$stage/backup-complete"; then
  tar -czf "$stage/previous-code.tar.gz" -C "$app" app config routes resources database/migrations database/seeders database/factories bootstrap/app.php bootstrap/providers.php composer.json composer.lock
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
  cp "$app/.env" "$stage/previous.env"
  chmod 600 "$stage/previous.env"
  touch "$stage/backup-complete"
fi
# Add hashed assets first, keeping old filenames for current visitors and rollback.
mkdir -p "$public/build/assets"
cp -R "$stage/public/build/assets/." "$public/build/assets/"
chmod 755 "$public" "$public/build"
find "$public/build/assets" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  set +e
  if test "$result" -ne 0; then
    echo RESTORING_PREVIOUS_RELEASE
    if test -d "$stage/previous-vendor"; then
      if test -d "$app/vendor"; then mv "$app/vendor" "$stage/failed-vendor-$(date +%s)"; fi
      mv "$stage/previous-vendor" "$app/vendor"
    fi
    tar -xzf "$stage/previous-code.tar.gz" -C "$app"
    cp "$stage/previous.env" "$app/.env"
    chmod 600 "$app/.env"
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    cd "$app"
    php artisan route:clear
    php artisan config:cache
    chmod 600 bootstrap/cache/config.php
    php artisan view:clear
    php artisan queue:restart
    echo PREVIOUS_RELEASE_RESTORED_ADDITIVE_COLUMNS_RETAINED
  fi
  cd "$app"
  php artisan up
  exit "$result"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
php artisan down --retry=15
cat > "$stage/records.php" <<'RECORDS'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::class;
$columns = [
    'users' => ['id','email','email_hash','password','role_id','auth_version'],
    'turfs' => ['id','name','email','phone','location','turf_manager_id','commission_rate','advance_enabled','advance_amount','payment_number'],
    'fields' => ['id','turf_id','name','pricing_mode','price_per_slot','price_per_hour','players_per_side'],
    'bookings' => ['id','turf_id','field_id','user_id','start_time','end_time','price','commission_rate','commission_amount'],
    'wallet_entries' => ['id','turf_id','booking_id','type','amount'],
    'commission_refunds' => ['id','turf_id','booking_id','amount'],
    'turf_photos' => ['id','turf_id','field_id','path'],
];
$file = $argv[1];
$before = is_file($file) ? json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR) : null;
foreach (['featured_settings' => ['id','payment_details','instructions'],
    'featured_requests' => ['id','turf_id','owner_id','days','amount','provider','receiver_number','payment_reference','status','decided_by','starts_at','ends_at'],
    'featured_placements' => ['id','turf_id','is_enabled','is_sponsored','priority','starts_at','ends_at']] as $table => $fields) {
    if ($before ? isset($before[$table]) : Illuminate\Support\Facades\Schema::hasTable($table)) $columns[$table] = $fields;
}
$current = [];
foreach ($columns as $table => $fields) {
    $max = $before[$table]['max'] ?? (int) $db::table($table)->max('id');
    $hash = hash_init('sha256'); $count = 0;
    foreach ($db::table($table)->select($fields)->where('id','<=',$max)->orderBy('id')->cursor() as $row) {
        hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR)); $count++;
    }
    $current[$table] = ['max' => $max, 'count' => $count, 'hash' => hash_final($hash)];
}
if ($before && $before !== $current) throw new RuntimeException('Protected existing records changed; stopping activation.');
if (!$before) file_put_contents($file, json_encode($current, JSON_THROW_ON_ERROR));
echo $before ? "EXISTING_ACCOUNTS_QUOTES_LEDGER_AND_PHOTOS_PRESERVED\n" : "PROTECTED_RECORD_SNAPSHOT_READY\n";
RECORDS
php "$stage/records.php" "$stage/records-before.json"
for folder in app config routes resources database/migrations database/seeders database/factories; do
  mkdir -p "$app/$folder"
  cp -R "$stage/$folder/." "$app/$folder/"
  find "$app/$folder" -type d -exec chmod 755 {} +
  find "$app/$folder" -type f -exec chmod 644 {} +
done
cp "$stage/bootstrap/app.php" "$app/bootstrap/app.php"
cp "$stage/bootstrap/providers.php" "$app/bootstrap/providers.php"
cp "$stage/composer.json" "$stage/composer.lock" "$app/"
chmod 644 "$app/bootstrap/app.php" "$app/bootstrap/providers.php" "$app/composer.json" "$app/composer.lock"
mv "$app/vendor" "$stage/previous-vendor"
mv "$stage/vendor" "$app/vendor"
find "$app/vendor" -type d -exec chmod 755 {} +
find "$app/vendor" -type f -exec chmod 644 {} +
php artisan migrate --force --path=database/migrations/2026_11_02_000001_add_google_identity_and_complex_coordinates.php
php artisan migrate --force --path=database/migrations/2026_11_02_000002_add_featured_complex_placements.php
php <<'CONFIGURE'
<?php
require 'vendor/autoload.php';
$stage = getenv('HOME').'/STAGE_NAME';
$settings = json_decode(file_get_contents($stage.'/google-settings.json'), true, 8, JSON_THROW_ON_ERROR);
if (array_keys($settings) !== ['GOOGLE_CLIENT_ID'] || !preg_match('/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/', $settings['GOOGLE_CLIENT_ID'])) throw new RuntimeException('Invalid Google configuration payload.');
$path = '.env'; $text = file_get_contents($path); $before = Dotenv\Dotenv::parse($text);
$line = 'GOOGLE_CLIENT_ID="'.$settings['GOOGLE_CLIENT_ID'].'"';
$text = preg_match('/^GOOGLE_CLIENT_ID=/m', $text) ? preg_replace_callback('/^GOOGLE_CLIENT_ID=.*$/m', fn () => $line, $text) : rtrim($text).PHP_EOL.$line.PHP_EOL;
$after = Dotenv\Dotenv::parse($text); unset($before['GOOGLE_CLIENT_ID'], $after['GOOGLE_CLIENT_ID']);
if ($before !== $after) throw new RuntimeException('Protected environment configuration changed.');
if (file_put_contents($path, $text) === false) throw new RuntimeException('Cannot save Google client ID.');
chmod($path, 0600);
echo "ONLY_GOOGLE_CLIENT_ID_UPDATED_CREDENTIALS_AND_APP_KEY_PRESERVED\n";
CONFIGURE
php artisan route:clear
php artisan config:cache
chmod 600 bootstrap/cache/config.php
php artisan view:cache
php "$stage/records.php" "$stage/records-before.json"
php <<'VERIFY'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
foreach (['users' => ['google_subject','google_subject_hash'], 'turfs' => ['latitude','longitude'], 'bookings' => ['is_peak','advance_required'], 'fields' => ['players_per_side'], 'featured_requests' => ['amount','receiver_number','status'], 'featured_placements' => ['starts_at','ends_at','is_enabled'], 'featured_settings' => ['payment_details']] as $table => $fields) {
    foreach ($fields as $column) if (!Illuminate\Support\Facades\Schema::hasColumn($table,$column)) throw new RuntimeException('Required schema column missing.');
}
foreach ([['/api/auth/google','POST','AuthController@google'],['/api/auth/google/nonce','GET','AuthController@googleNonce'],['/api/auth/google/register','POST','AuthController@googleRegister'],['/api/auth/google/link','POST','AuthController@googleLink'],['/api/turfs/map','GET','TurfController@map'],['/api/locations/search','GET','PlaceSearchController'],['/api/booking-guide','GET','BookingController@guide']] as [$url,$method,$action]) {
    $route = $app['router']->getRoutes()->match(Illuminate\Http\Request::create($url,$method));
    if (!str_contains($route->getActionName(),$action)) throw new RuntimeException('Required map/auth route missing.');
}
$settings = json_decode(file_get_contents(getenv('HOME').'/STAGE_NAME/google-settings.json'),true);
if (!hash_equals($settings['GOOGLE_CLIENT_ID'], (string)config('services.google.client_id'))) throw new RuntimeException('Production client ID mismatch.');
if (!class_exists(Firebase\JWT\JWT::class)) throw new RuntimeException('JWT verification dependency missing.');
try { $response = Illuminate\Support\Facades\Http::timeout(12)->get('https://www.googleapis.com/oauth2/v1/certs'); }
catch (Throwable $e) { throw new RuntimeException('Google certificate HTTPS check failed. No email sent or account created.'); }
if (!$response->successful() || !is_array($response->json()) || !count($response->json())) throw new RuntimeException('Google certificates unavailable.');
echo "MAPS_AND_GOOGLE_AUTH_SCHEMA_ROUTES_CONFIG_AND_CERTIFICATES_READY\n";
VERIFY
cp "$stage/public/build/index.html" "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.pending"
chmod 644 "$public/build/index.html" "$public/build/manifest.pending"
mv "$public/build/manifest.pending" "$public/build/manifest.json"
php artisan queue:restart
php artisan up
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;; *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;; esac
api_type=$(curl -fsS --max-time 20 -H 'Accept: application/json' -o /dev/null -w '%{content_type}' 'https://sportevo.games/api/turfs?page=1&search=&sport=&sport_name=&location=')
case "$api_type" in *application/json*) echo PUBLIC_DIRECTORY_EMPTY_FILTERS_VERIFIED ;; *) echo DIRECTORY_HTTP_CHECK_FAILED; exit 1 ;; esac
validation_status=$(curl -sS --max-time 20 -H 'Accept: application/json' -o /dev/null -w '%{http_code}' 'https://sportevo.games/api/locations/search?q=ab')
test "$validation_status" = 422 || { echo PLACE_SEARCH_ROUTE_HTTP_CHECK_FAILED; exit 1; }
echo PLACE_SEARCH_PUBLIC_VALIDATION_VERIFIED
featured_type=$(curl -fsS --max-time 20 -H 'Accept: application/json' -o /dev/null -w '%{content_type}' 'https://sportevo.games/api/featured-complexes')
case "$featured_type" in *application/json*) echo PUBLIC_FEATURED_COMPLEXES_VERIFIED ;; *) echo FEATURED_HTTP_CHECK_FAILED; exit 1 ;; esac
touch "$stage/activation-complete"
trap - EXIT HUP INT TERM
echo MAPS_AUTH_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace('ARCHIVE_HASH', $state.sha256).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; see the log. Automatic restoration was attempted. Resume only after a successful upload.' }
} catch { $exitCode = 1; Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
exit $exitCode
