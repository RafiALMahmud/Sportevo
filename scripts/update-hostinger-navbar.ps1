param([switch]$PrepareOnly, [switch]$UsePrepared, [switch]$Resume)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SportEvo - Navbar layout update'
$workspacePath = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $workspacePath 'backend/storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'navbar-update.tar.gz'
$statePath = Join-Path $packagePath 'navbar-state.json'
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-navbar-update.log'
$remote = 'u302655234@147.93.78.83'
if (-not (Test-Path -LiteralPath $packagePath)) { New-Item -ItemType Directory -Path $packagePath -Force | Out-Null }
if (-not $UsePrepared -and -not $Resume) {
    & npm.cmd --prefix (Join-Path $workspacePath 'frontend') run build:local
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    & tar.exe -czf $archive -C (Join-Path $workspacePath 'backend/public') build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend package failed.' }
    @{ stage = '.sportevo-navbar-' + [Guid]::NewGuid().ToString('N'); sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.stage -notmatch '^\.sportevo-navbar-[a-f0-9]{32}$' -or $state.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid saved deployment state.' }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.sha256) { throw 'Prepared archive changed.' }
if ($PrepareOnly) { Write-Output 'NAVBAR_PACKAGE_READY'; return }
Write-Host 'Enter your Hostinger SSH password at the upload and activation prompts.'
Write-Host 'This publishes the grouped, responsive navbar and frontend assets only. Database and environment settings stay intact.'
$exitCode = 0
try {
    if (-not $Resume) {
        & scp -P 65002 $archive "${remote}:$($state.stage).tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed; activation was not started. Retry with -UsePrepared.' }
    }
    $command = @'
set -eu
umask 077
name=STAGE_NAME
stage="$HOME/$name"
public="$HOME/domains/sportevo.games/public_html"
test -f "$public/index.php"
mkdir -p "$stage"
chmod 700 "$stage"
if test -f "$stage/activation-complete"; then echo NAVBAR_ALREADY_ACTIVATED; exit 0; fi
printf '%s  %s\n' 'ARCHIVE_HASH' "$HOME/$name.tar.gz" | sha256sum -c -
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
test -f "$stage/build/manifest.json"
if command -v flock >/dev/null; then
  exec 9>"$HOME/domains/sportevo.games/sportevo/storage/framework/maps-auth-deployment.lock"
  flock -n 9 || { echo ANOTHER_DEPLOYMENT_IS_RUNNING; exit 1; }
fi
if ! test -f "$stage/previous-build.tar.gz"; then
  tar -czf "$stage/previous-build.pending" -C "$public" build
  mv "$stage/previous-build.pending" "$stage/previous-build.tar.gz"
fi
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  set +e
  if test "$result" -ne 0; then
    tar -xzf "$stage/previous-build.tar.gz" -C "$public"
    find "$public/build" -type d -exec chmod 755 {} +
    find "$public/build" -type f -exec chmod 644 {} +
    echo PREVIOUS_FRONTEND_RESTORED
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$public/build/assets"
# Retain previous hashed assets for open tabs and rollback; publish the manifest last.
cp -R "$stage/build/assets/." "$public/build/assets/"
chmod 755 "$public" "$public/build"
find "$public/build/assets" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cp "$stage/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/build/manifest.json" "$public/build/manifest.pending"
chmod 644 "$public/build/manifest.pending"
mv "$public/build/manifest.pending" "$public/build/manifest.json"
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;; *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;; esac
touch "$stage/activation-complete"
trap - EXIT HUP INT TERM
echo NAVBAR_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $state.stage).Replace('ARCHIVE_HASH', $state.sha256).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Activation failed; inspect the log before resuming this exact uploaded package.' }
} catch { $exitCode = 1; Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
exit $exitCode
