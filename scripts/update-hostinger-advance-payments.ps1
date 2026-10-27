param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SportEvo - Manual advance payments'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'advance-payments-update.tar.gz'
$statePath = Join-Path $packagePath 'advance-payments-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-advance-payments-update.log'
$files = @('app/Http/Controllers/Api/AdvancePaymentController.php', 'app/Http/Controllers/Api/BookingController.php', 'app/Http/Controllers/Api/TurfController.php', 'app/Http/Controllers/Api/DashboardController.php', 'app/Http/Controllers/Api/WorkflowController.php', 'app/Http/Controllers/Api/ReviewController.php', 'app/Http/Controllers/Api/AuthController.php', 'app/Http/Requests/RegisterRequest.php', 'app/Http/Requests/StoreUserRequest.php', 'app/Http/Requests/StoreTurfRequest.php', 'app/Models/Booking.php', 'app/Models/Turf.php', 'app/Services/AdvancePayment.php', 'app/Services/BookingNotificationService.php', 'app/Services/FacilityDeletion.php', 'app/Jobs/ExpireBookingAdvance.php', 'app/Observers/ActivityObserver.php', 'routes/api.php', 'routes/console.php', 'database/migrations/2026_10_19_000001_add_manual_advance_payments.php')
$files += 'database/migrations/2026_10_19_000002_add_offline_booking_type.php'
$files += @('app/Http/Requests/GenerateSlotsRequest.php', 'app/Http/Requests/UpdateSlotPriceRequest.php', 'app/Services/FieldPricing.php', 'database/migrations/2026_10_26_000001_add_slot_pricing.php')
$files += @('app/Models/Field.php', 'app/Http/Controllers/Api/FieldController.php', 'app/Services/FieldSports.php', 'database/seeders/SportSeeder.php', 'database/seeders/DemoSeeder.php', 'database/migrations/2026_10_26_000002_add_players_per_side.php', 'database/migrations/2026_10_26_000003_merge_futsal_into_football.php')
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-advances-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Archive failed.' }
    $name = '.sportevo-advances-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Enter your Hostinger SSH password for upload and activation.'
Write-Host 'This adds peak-hours-only generation and deletion of selected unused available slots, including past unused slots.'
Write-Host 'Booked slots, offline reservations, requests, financial records and booking history are protected from deletion.'
Write-Host 'Sport selections are preserved under Football; a private copy of the previous sport assignments is saved before merging.'
Write-Host 'Existing complexes start with advances off until their receiving numbers are configured. Existing bookings retain their terms.'
Write-Host 'A brief maintenance window applies additive columns. Database history, quotes, credentials and encryption keys are preserved.'
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
files='FILE_LIST'
for file in $files; do php -l "$stage/$file"; done
test -f "$stage/public/build/manifest.json"
if ! test -f "$stage/previous-code.tar.gz"; then
  : > "$stage/previous-code-files.txt"
  for file in $files; do if test -f "$app/$file"; then printf '%s\n' "$file" >> "$stage/previous-code-files.txt"; fi; done
  tar -czf "$stage/previous-code.tar.gz" -C "$app" -T "$stage/previous-code-files.txt"
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
fi
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
    tar -xzf "$stage/previous-code.tar.gz" -C "$app"
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    php artisan route:clear
    php artisan view:clear
    php artisan queue:restart
    echo PREVIOUS_CODE_RESTORED_ADDITIVE_COLUMNS_RETAINED
  fi
  php artisan up
}
trap finish EXIT
env_before=$(sha256sum .env | cut -d ' ' -f 1)
cat > "$stage/metrics.php" <<'METRICS'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$counts = [];
foreach (['users', 'turfs', 'fields', 'bookings', 'wallet_entries', 'commission_refunds', 'turf_photos'] as $table) {
    $counts[$table] = Illuminate\Support\Facades\DB::table($table)->count();
}
$hash = hash_init('sha256');
foreach (Illuminate\Support\Facades\DB::table('bookings')->select('id', 'status', 'price', 'commission_rate', 'commission_amount', 'start_time', 'end_time', 'user_id', 'field_id')->orderBy('id')->cursor() as $row) {
    hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR));
}
echo json_encode($counts, JSON_THROW_ON_ERROR).'|'.hash_final($hash);
METRICS
before=$(php "$stage/metrics.php")
if ! test -f "$stage/sports-before-merge.json"; then
  php <<'SPORTS_SNAPSHOT' > "$stage/sports-before-merge.json"
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$snapshot = [];
foreach (['sports', 'field_sport', 'sport_turf'] as $table) {
    $snapshot[$table] = Illuminate\Support\Facades\DB::table($table)->get()->all();
}
echo json_encode($snapshot, JSON_THROW_ON_ERROR);
SPORTS_SNAPSHOT
fi
for file in $files; do mkdir -p "$(dirname "$app/$file")"; cp "$stage/$file" "$app/$file"; done
php artisan migrate --force --path=database/migrations/2026_10_19_000001_add_manual_advance_payments.php
php artisan migrate --force --path=database/migrations/2026_10_19_000002_add_offline_booking_type.php
php artisan migrate --force --path=database/migrations/2026_10_26_000001_add_slot_pricing.php
php artisan migrate --force --path=database/migrations/2026_10_26_000002_add_players_per_side.php
php artisan migrate --force --path=database/migrations/2026_10_26_000003_merge_futsal_into_football.php
php artisan route:clear
after=$(php "$stage/metrics.php")
test "$before" = "$after"
echo EXISTING_ROWS_QUOTES_AND_LEDGER_PRESERVED
php <<'VERIFY'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$schema = Illuminate\Support\Facades\Schema::getColumnListing('bookings');
foreach (['advance_required', 'advance_status', 'advance_amount', 'advance_due_at', 'payment_reference', 'payment_confirmed_by', 'unavailable_type', 'slot_pricing_mode', 'slot_rate', 'is_peak'] as $column) {
    if (! in_array($column, $schema, true)) { throw new RuntimeException('Missing payment column.'); }
}
$route = $app['router']->getRoutes()->match(Illuminate\Http\Request::create('/api/bookings/1/advance/reference', 'POST'));
if (! str_contains($route->getActionName(), 'AdvancePaymentController@submit')) { throw new RuntimeException('Payment route not ready.'); }
$priceRoute = $app['router']->getRoutes()->match(Illuminate\Http\Request::create('/api/turfs/1/slots/1/price', 'PATCH'));
if (! str_contains($priceRoute->getActionName(), 'TurfController@updateSlotPrice')) { throw new RuntimeException('Slot price route not ready.'); }
echo "SLOT_PRICING_SCHEMA_AND_ROUTE_READY\n";
if (! Illuminate\Support\Facades\Schema::hasColumn('fields', 'players_per_side')) { throw new RuntimeException('Field player count column missing.'); }
if (Illuminate\Support\Facades\DB::table('sports')->whereRaw('LOWER(slug) = ?', ['futsal'])->exists()) { throw new RuntimeException('Futsal merge not ready.'); }
echo "FIELD_PLAYERS_AND_FOOTBALL_MERGE_READY\n";
$deleteRoute = $app['router']->getRoutes()->match(Illuminate\Http\Request::create('/api/turfs/1/slots', 'DELETE'));
if (! str_contains($deleteRoute->getActionName(), 'TurfController@deleteSlots')) { throw new RuntimeException('Slot deletion route not ready.'); }
echo "PEAK_ONLY_AND_SAFE_SLOT_DELETION_READY\n";
echo "ADVANCE_PAYMENT_SCHEMA_AND_ROUTES_READY\n";
VERIFY
cp "$stage/public/build/index.html" "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/index.html" "$public/build/manifest.json"
php artisan view:clear
php artisan queue:restart
test "$env_before" = "$(sha256sum .env | cut -d ' ' -f 1)"
echo PRIVATE_CONFIGURATION_PRESERVED
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in
  *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
echo ADVANCE_PAYMENTS_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace('FILE_LIST', ($files -join ' ')).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
