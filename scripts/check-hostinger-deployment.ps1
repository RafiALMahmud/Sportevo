$ErrorActionPreference = 'Continue'
$workspacePath = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-deployment-check.log'
$command = @'
{
echo DEPLOYMENT_INSPECTION
php -v
command -v composer
ps -u "$(id -u)" -o pid,etime,args | grep -E 'composer|artisan|deploy-hostinger' | grep -v grep
ls -dt "$HOME"/.sportevo-deploy-* 2>/dev/null | head -3
cd "$HOME/domains/sportevo.games/sportevo" || exit 1
test ! -f vendor/autoload.php || echo AUTOLOADER_PRESENT
test ! -f vendor/composer/installed.json || echo INSTALLED_PACKAGES_PRESENT
test ! -f vendor/autoload.php || php artisan migrate:status
ls -l ../public_html/index.php ../public_html/default.php 2>/dev/null
echo PUBLIC_DIRECTORY_PERMISSIONS
ls -ld ../public_html ../public_html/build
echo ADMIN_ACCOUNT_CHECK
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
echo 'Users: '.App\Models\User::count().PHP_EOL;
echo 'Superadmins: '.App\Models\User::whereHas('role', fn ($q) => $q->where('name', 'superadmin'))->count().PHP_EOL;
PHP
echo QUEUE_CRON_CHECK
if command -v crontab >/dev/null; then
  cronfile=$(mktemp)
  if crontab -l > "$cronfile" 2>/dev/null; then
    if grep 'artisan queue:work' "$cronfile"; then echo EMAIL_CRON_PRESENT; else echo EMAIL_CRON_MISSING; fi
  else echo 'EMAIL_CRON_UNAVAILABLE_OR_NOT_CONFIGURED: use Hostinger hPanel cron jobs'; fi
  rm -f "$cronfile"
else echo 'EMAIL_CRON_UNAVAILABLE: use Hostinger hPanel cron jobs'; fi
echo PUBLIC_DIRECTORY_FIX
chmod 755 ../public_html
ls -ld ../public_html
echo CHECK_COMPLETE
} 2>&1
'@
Write-Host 'Enter your SSH password to verify deployment and set public_html permissions to 755. Database contents stay intact.'
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command.Replace("`r`n", "`n")))
& ssh -p 65002 -o ConnectTimeout=20 u302655234@147.93.78.83 "echo $encodedCommand | base64 -d | sh" | Tee-Object -FilePath $logPath
Write-Host "Inspection exit code: $LASTEXITCODE"
Write-Host "Log saved to $logPath"
Read-Host 'Press Enter to close this window'
