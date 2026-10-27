$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $workspacePath 'backend/storage/app/private/hostinger-deploy'
$envPath = Join-Path $workspacePath 'backend/.env.hostinger'
$envText = [IO.File]::ReadAllText($envPath)
if ($envText -match 'YOUR_HOSTINGER|YOUR-DOMAIN') { throw 'Complete backend/.env.hostinger before deployment.' }
if ($envText -notmatch '(?m)^APP_DEBUG=false\s*$') { throw 'APP_DEBUG must be false.' }
foreach ($name in @('DB_PASSWORD', 'APP_KEY', 'PLATFORM_ADMIN_1_PASSWORD', 'PLATFORM_ADMIN_2_PASSWORD')) {
    if ($envText -notmatch ('(?m)^' + $name + '=(?!\s*$|""\s*$).+')) { throw "Missing $name in .env.hostinger." }
}
$remote = 'u302655234@147.93.78.83'
$stageName = '.sportevo-deploy-' + [Guid]::NewGuid().ToString('N')
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-deploy.log'
Write-Host 'Enter your SSH password at each SSH/SCP prompt. Passwords are not echoed or saved.'
Write-Host 'This uploads the private app and .env outside public_html, then activates sportevo.games with a fresh database and manual admins.'
try {
    & ssh -p 65002 -o ConnectTimeout=20 $remote "umask 077; test -d domains/sportevo.games/public_html && mkdir $stageName"
    if ($LASTEXITCODE -ne 0) { throw 'SSH staging failed.' }
    & scp -P 65002 (Join-Path $packagePath 'backend.tar.gz') (Join-Path $packagePath 'public.tar.gz') $envPath (Join-Path $PSScriptRoot 'deploy-hostinger.sh') "${remote}:$stageName/"
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed.' }
    # Composer writes progress to stderr. Merge it remotely so Windows PowerShell
    # does not treat normal progress output as a terminating NativeCommandError.
    & ssh -p 65002 -o ServerAliveInterval=15 $remote "sh $stageName/deploy-hostinger.sh `"`$HOME/$stageName`" 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Server deployment stopped. See the deployment log; no database resets were attempted.' }
    Write-Host 'Deployment completed. Return to chat for public verification.'
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
