param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'field-schedule-update.tar.gz'
$statePath = Join-Path $packagePath 'field-schedule-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-field-schedule-update.log'
$files = @('app/Http/Controllers/Api/BookingController.php', 'app/Models/Field.php', 'app/Services/FieldPricing.php', 'app/Http/Controllers/Api/TurfController.php', 'app/Http/Controllers/Api/FieldController.php', 'app/Http/Requests/StoreTurfRequest.php', 'database/migrations/2026_10_14_000002_add_field_hourly_pricing.php')
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-field-schedule-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Archive failed.' }
    $name = '.sportevo-field-schedule-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Enter your Hostinger SSH password for upload and activation.'
Write-Host 'This adds a separate field schedule page, field selection and per-slot/hourly pricing.'
Write-Host 'Existing quotes, commission, personal data and encryption keys are preserved. A brief maintenance window adds pricing columns.'
try {
    if (-not $Resume) {
        & scp -P 65002 $archive "${remote}:$name.tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed; activation was not started.' }
    }
    $command = @'
set -eu
umask 077
name=STAGE_NAME
stage="$HOME/$name"
app="$HOME/domains/sportevo.games/sportevo"
public="$HOME/domains/sportevo.games/public_html"
test -f "$app/artisan"
mkdir -p "$stage"
chmod 700 "$stage"
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
files='app/Http/Controllers/Api/BookingController.php app/Models/Field.php app/Services/FieldPricing.php app/Http/Controllers/Api/TurfController.php app/Http/Controllers/Api/FieldController.php app/Http/Requests/StoreTurfRequest.php database/migrations/2026_10_14_000002_add_field_hourly_pricing.php'
for file in $files; do php -l "$stage/$file"; done
test -f "$stage/public/build/manifest.json"
if ! test -f "$stage/previous-code.tar.gz"; then
  tar -czf "$stage/previous-code.tar.gz" -C "$app" app/Http/Controllers/Api/BookingController.php app/Models/Field.php app/Http/Controllers/Api/TurfController.php app/Http/Controllers/Api/FieldController.php app/Http/Requests/StoreTurfRequest.php
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
fi
cp -R "$stage/public/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cd "$app"
php artisan down --retry=15
finish() {
  result=$?
  set +e
  if test "$result" -ne 0; then
    tar -xzf "$stage/previous-code.tar.gz" -C "$app"
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    echo PREVIOUS_CODE_RESTORED
  fi
  php artisan up
}
trap finish EXIT
env_before=$(sha256sum .env | cut -d ' ' -f 1)
before=$(php <<'METRICS'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$counts = [];
foreach (['users', 'turfs', 'fields', 'bookings', 'wallet_entries', 'turf_photos'] as $table) {
    $counts[$table] = \Illuminate\Support\Facades\DB::table($table)->count();
}
$quotes = \Illuminate\Support\Facades\DB::table('bookings')->select('id', 'status', 'price', 'commission_rate', 'commission_amount')->orderBy('id')->get()->toJson();
echo json_encode($counts).':'.hash('sha256', $quotes);
METRICS
)
for file in $files; do
  cp "$stage/$file" "$app/$file.next"
  chmod 644 "$app/$file.next"
  mv "$app/$file.next" "$app/$file"
done
php artisan migrate --force --path=database/migrations/2026_10_14_000002_add_field_hourly_pricing.php
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!\Illuminate\Support\Facades\Schema::hasColumn('fields', 'pricing_mode') ||
    !\Illuminate\Support\Facades\Schema::hasColumn('fields', 'price_per_hour')) {
    throw new RuntimeException('Pricing columns are unavailable.');
}
$field = new \App\Models\Field(['pricing_mode' => 'hour', 'price_per_hour' => 1000, 'price_per_slot' => 0]);
if (\App\Services\FieldPricing::quote($field, \Carbon\Carbon::parse('2030-01-01 10:00'), \Carbon\Carbon::parse('2030-01-01 11:30')) !== 1500.0) {
    throw new RuntimeException('Hourly pricing verification failed.');
}
echo "HOURLY_PRICING_READY\n";
PHP
after=$(php <<'METRICS'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$counts = [];
foreach (['users', 'turfs', 'fields', 'bookings', 'wallet_entries', 'turf_photos'] as $table) {
    $counts[$table] = \Illuminate\Support\Facades\DB::table($table)->count();
}
$quotes = \Illuminate\Support\Facades\DB::table('bookings')->select('id', 'status', 'price', 'commission_rate', 'commission_amount')->orderBy('id')->get()->toJson();
echo json_encode($counts).':'.hash('sha256', $quotes);
METRICS
)
test "$before" = "$after"
echo EXISTING_ROWS_AND_QUOTES_PRESERVED
env_after=$(sha256sum .env | cut -d ' ' -f 1)
test "$env_before" = "$env_after"
for file in $files; do cmp "$stage/$file" "$app/$file"; done
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/manifest.json"
php artisan queue:restart
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in
  *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
php artisan up
trap - EXIT
echo PRIVATE_CONFIGURATION_PRESERVED
echo FIELD_SCHEDULE_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
