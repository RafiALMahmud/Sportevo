param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SportEvo - Idle logout and UI fixes'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$packagePath = Join-Path $backendPath 'storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'session-ui-update.tar.gz'
$statePath = Join-Path $packagePath 'session-ui-state.json'
$logPath = Join-Path $backendPath 'storage/logs/hostinger-session-ui-update.log'
$files = @('app/Http/Controllers/Api/AuthController.php', 'app/Http/Middleware/ValidateSessionVersion.php', 'config/sanctum.php')
$remote = 'u302655234@147.93.78.83'
if ($Resume) {
    $name = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).stage
    if ($name -notmatch '^\.sportevo-session-ui-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
} else {
    foreach ($file in $files) {
        & php -l (Join-Path $backendPath $file)
        if ($LASTEXITCODE -ne 0) { throw "PHP validation failed: $file" }
    }
    & tar.exe -czf $archive -C $backendPath @files public/build
    if ($LASTEXITCODE -ne 0) { throw 'Archive failed.' }
    $name = '.sportevo-session-ui-' + [Guid]::NewGuid().ToString('N')
    @{ stage = $name } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
Write-Host 'Enter your Hostinger SSH password for upload and activation.'
Write-Host 'This adds logout after 45 inactive minutes, fixes photo buttons and light-mode login, and includes the Bangla switch.'
Write-Host 'Database contents, .env, credentials and encryption keys are preserved. A brief maintenance window updates the code.'
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
files='app/Http/Controllers/Api/AuthController.php app/Http/Middleware/ValidateSessionVersion.php config/sanctum.php'
for file in $files; do php -l "$stage/$file"; done
test -f "$stage/public/build/manifest.json"
if ! test -f "$stage/previous-code.tar.gz"; then
  tar -czf "$stage/previous-code.tar.gz" -C "$app" $files
  tar -czf "$stage/previous-build.tar.gz" -C "$public" build
fi
mkdir -p "$public/build/assets"
cp -R "$stage/public/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cd "$app"
env_before=$(sha256sum .env | cut -d ' ' -f 1)
php artisan down --retry=15
finish() {
  result=$?
  set +e
  if test "$result" -ne 0; then
    tar -xzf "$stage/previous-code.tar.gz" -C "$app"
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    php artisan config:cache
    echo PREVIOUS_CODE_RESTORED
  fi
  php artisan up
}
trap finish EXIT
for file in $files; do cp "$stage/$file" "$app/$file"; done
php artisan config:cache
php <<'VERIFY'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (config('sanctum.expiration') !== 45) { fwrite(STDERR, "AUTH_TIMEOUT_CHECK_FAILED\n"); exit(1); }
echo "IDLE_LOGOUT_CODE_READY\n";
VERIFY
cp "$stage/public/build/index.html" "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/index.html" "$public/build/manifest.json"
php artisan view:clear
test "$env_before" = "$(sha256sum .env | cut -d ' ' -f 1)"
echo PRIVATE_CONFIGURATION_PRESERVED
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in
  *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
echo SESSION_UI_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
