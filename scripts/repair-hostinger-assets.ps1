$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $workspacePath 'backend/storage/app/private/hostinger-deploy'
$name = (Get-Content -LiteralPath (Join-Path $packagePath 'booking-accounts-state.json') -Raw | ConvertFrom-Json).stage
if ($name -notmatch '^\.sportevo-booking-accounts-[a-f0-9]{32}$') { throw 'Invalid deployment state.' }
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-assets-repair.log'
Write-Host 'Enter your Hostinger SSH password to inspect and repair the frontend assets.'
Write-Host 'This uses the existing uploaded build. Database, personal data and environment settings stay intact.'
$command = @'
set -eu
name=STAGE_NAME
stage="$HOME/$name"
public="$HOME/domains/sportevo.games/public_html"
app="$HOME/domains/sportevo.games/sportevo"
test -f "$stage/public/build/manifest.json"
echo ASSET_DIRECTORY_INSPECTION
ls -ld "$public" "$public/build" "$public/build/assets"
find "$public/build" -maxdepth 3 -type f -name 'index-Y_udZmll.js' -print
echo RESTORING_UPLOADED_ASSETS
tar -cf - -C "$stage/public/build" assets | tar -xf - -C "$public/build"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/manifest.json" "$public/build/index.html"
php -r '
$path = $argv[1];
$manifest = json_decode(file_get_contents($path."/manifest.json"), true, 512, JSON_THROW_ON_ERROR);
foreach ($manifest as $entry) {
    if (!is_file($path."/".$entry["file"])) { throw new RuntimeException("Missing asset: ".$entry["file"]); }
}
echo "ALL_MANIFEST_ASSETS_PRESENT\n";
' "$public/build"
cd "$app"
php artisan view:clear
php artisan up
echo HTTP_ENTRY_CHECK
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?asset_repair=$(date +%s)")
echo "ENTRY_CONTENT_TYPE: $content_type"
case "$content_type" in
  *javascript*) echo FRONTEND_ASSETS_REPAIRED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
'@
$command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
try {
    & ssh -p 65002 -o ConnectTimeout=20 u302655234@147.93.78.83 "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Asset repair verification failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
