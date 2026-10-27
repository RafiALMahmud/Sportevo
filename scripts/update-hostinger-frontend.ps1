param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $workspacePath 'backend/storage/app/private/hostinger-deploy'
$archive = Join-Path $packagePath 'frontend-update.tar.gz'
& tar.exe -czf $archive -C (Join-Path $workspacePath 'backend/public') build
if ($LASTEXITCODE -ne 0) { throw 'Frontend archive failed.' }
$remote = 'u302655234@147.93.78.83'
$name = '.sportevo-frontend-' + [Guid]::NewGuid().ToString('N')
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-frontend-update.log'
Write-Host 'Enter your SSH password at the upload and activation prompts.'
Write-Host 'This updates frontend assets only. Database and environment settings stay intact.'
try {
    if (-not $Resume) {
        & scp -P 65002 $archive "${remote}:$name.tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Upload failed.' }
    }
    $command = @'
set -eu
umask 077
public="$HOME/domains/sportevo.games/public_html"
name=STAGE_NAME
stage="$HOME/$name"
test -f "$public/index.php"
mkdir "$stage"
tar -czf "$stage/previous-build.tar.gz" -C "$public" build
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
test -f "$stage/build/manifest.json"
mkdir -p "$public/build/assets"
cp -R "$stage/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cp "$stage/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/manifest.json"
entry=$(php -r '$m=json_decode(file_get_contents($argv[1]),true); echo $m["index.html"]["file"];' "$public/build/manifest.json")
content_type=$(curl -fsS --max-time 20 -o /dev/null -w '%{content_type}' "https://sportevo.games/build/$entry?deploy_check=$(date +%s)")
case "$content_type" in
  *javascript*) echo ENTRY_HTTP_JAVASCRIPT_VERIFIED ;;
  *) echo ENTRY_HTTP_CHECK_FAILED; exit 1 ;;
esac
echo 'FRONTEND_UPDATE_COMPLETE'
'@
    if ($Resume) {
        $resumeName = @'
name=$(ls -t "$HOME"/.sportevo-frontend-*.tar.gz | head -1)
test -n "$name"
name=${name##*/}
name=${name%.tar.gz}
'@
        $command = $command.Replace('name=STAGE_NAME', $resumeName)
        $command = $command.Replace('stage="$HOME/$name"', 'stage="$HOME/$name-resume-$(date +%s)"')
    } else { $command = $command.Replace('STAGE_NAME', $name) }
    $command = $command.Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Frontend activation failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
