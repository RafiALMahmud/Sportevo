$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspacePath 'backend'
$archive = Join-Path $backendPath 'storage/app/private/hostinger-deploy/sports-update.tar.gz'
$files = @('app/Services/FieldSports.php', 'app/Http/Controllers/Api/FieldController.php', 'app/Http/Controllers/Api/TurfController.php', 'app/Http/Requests/StoreTurfRequest.php')
& tar.exe -czf $archive -C $backendPath @files public/build
if ($LASTEXITCODE -ne 0) { throw 'Update archive failed.' }
$remote = 'u302655234@147.93.78.83'
$name = '.sportevo-sports-' + [Guid]::NewGuid().ToString('N')
$logPath = Join-Path $backendPath 'storage/logs/hostinger-sports-update.log'
Write-Host 'Enter your SSH password for upload and activation. This updates sport selection and frontend assets without resetting the database or changing .env.'
try {
    & scp -P 65002 $archive "${remote}:$name.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed.' }
    $command = @'
set -eu
umask 077
name=STAGE_NAME
stage="$HOME/$name"
app="$HOME/domains/sportevo.games/sportevo"
public="$HOME/domains/sportevo.games/public_html"
test -f "$app/artisan"
test -f "$public/index.php"
mkdir "$stage"
tar -czf "$stage/previous-code.tar.gz" -C "$app" app/Services app/Http/Controllers/Api app/Http/Requests
tar -czf "$stage/previous-build.tar.gz" -C "$public" build
tar -xzf "$HOME/$name.tar.gz" -C "$stage"
for file in app/Services/FieldSports.php app/Http/Controllers/Api/FieldController.php app/Http/Controllers/Api/TurfController.php app/Http/Requests/StoreTurfRequest.php; do
  php -l "$stage/$file"
done
for file in app/Services/FieldSports.php app/Http/Controllers/Api/FieldController.php app/Http/Controllers/Api/TurfController.php app/Http/Requests/StoreTurfRequest.php; do
  cp "$stage/$file" "$app/$file"
  chmod 644 "$app/$file"
done
cp -R "$stage/public/build/assets/." "$public/build/assets/"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build/assets" -type f -exec chmod 644 {} +
cp "$stage/public/build/index.html" "$public/build/index.html"
chmod 644 "$public/build/index.html"
cp "$stage/public/build/manifest.json" "$public/build/manifest.json"
chmod 644 "$public/build/manifest.json"
echo SPORTS_UPDATE_COMPLETE
'@
    $command = $command.Replace('STAGE_NAME', $name).Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Update failed. See the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
