param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'booking-accounts-update.tar.gz'
$statePath = Join-Path $packagePath 'booking-accounts-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-booking-accounts-update.log'
$files = @('app/Http/Controllers/Api/BookingController.php', 'app/Models/User.php', 'app/Rules/UniqueEncryptedEmail.php', 'database/migrations/2026_10_14_000001_release_deleted_user_email_identifiers.php')
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-booking-accounts-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Archive failed.' }
    $name = '.sportevo-booking-accounts-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Enter your Hostinger SSH password for upload and activation.'
Write-Host 'This blocks overlapping customer requests, releases deleted account email identifiers, and prefills owner contact details.'
Write-Host 'Existing personal data, booking history, credentials and encryption keys are preserved. A brief maintenance window applies the repair.'
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
files='app/Http/Controllers/Api/BookingController.php app/Models/User.php app/Rules/UniqueEncryptedEmail.php database/migrations/2026_10_14_000001_release_deleted_user_email_identifiers.php'
for file in $files; do php -l "$stage/$file"; done
test -f "$stage/public/build/manifest.json"
if ! test -f "$stage/previous-code.tar.gz"; then
  tar -czf "$stage/previous-code.tar.gz" -C "$app" app/Http/Controllers/Api/BookingController.php app/Models/User.php app/Rules/UniqueEncryptedEmail.php
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
for file in $files; do
  cp "$stage/$file" "$app/$file.next"
  chmod 644 "$app/$file.next"
  mv "$app/$file.next" "$app/$file"
done
php artisan migrate --force --path=database/migrations/2026_10_14_000001_release_deleted_user_email_identifiers.php
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
App\Models\User::onlyTrashed()->chunkById(100, function ($users) {
    foreach ($users as $user) {
        if ($user->email_hash !== App\Models\User::archivedEmailHash($user->id, $user->email)) {
            throw new RuntimeException('Archived email identifier repair failed.');
        }
    }
});
echo "DELETED_EMAIL_IDENTIFIERS_READY\n";
PHP
env_after=$(sha256sum .env | cut -d ' ' -f 1)
test "$env_before" = "$env_after"
for file in $files; do cmp "$stage/$file" "$app/$file"; done
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/manifest.json"
php artisan queue:restart
php artisan up
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in
  *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
echo PRIVATE_CONFIGURATION_PRESERVED
echo BOOKING_ACCOUNTS_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
