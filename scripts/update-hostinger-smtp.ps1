$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
& php (Join-Path $PSScriptRoot 'prepare-hostinger-smtp.php')
if ($LASTEXITCODE -ne 0) { throw 'SMTP authentication failed. Upload was not started.' }
$payloadPath = Join-Path $workspacePath 'backend/storage/app/private/hostinger-deploy/smtp-settings.json'
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-smtp-update.log'
$remote = 'u302655234@147.93.78.83'
# This directory was created with umask 077 by the verified branding deployment.
$privateStage = '.sportevo-branding-45a90245565345f08abd3a58de529dd4'
Write-Host 'Enter your SSH password for upload and activation. The new SMTP password stays in private configuration files.'
Write-Host 'SSH/SCP prompts require the Hostinger SSH account password for u302655234. Gmail SMTP credentials are already saved and verified.'
try {
    & scp -P 65002 $payloadPath "${remote}:$privateStage/smtp-settings.json"
    if ($LASTEXITCODE -ne 0) { throw 'Private settings upload failed.' }
    $command = @'
set -eu
umask 077
stage="$HOME/.sportevo-branding-45a90245565345f08abd3a58de529dd4"
chmod 700 "$stage"
chmod 600 "$stage/smtp-settings.json"
cd "$HOME/domains/sportevo.games/sportevo"
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$settingsPath = getenv('HOME').'/.sportevo-branding-45a90245565345f08abd3a58de529dd4/smtp-settings.json';
$settings = json_decode(file_get_contents($settingsPath), true, 512, JSON_THROW_ON_ERROR);
$allowed = ['MAIL_MAILER', 'MAIL_SCHEME', 'MAIL_URL', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_ENCRYPTION', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME'];
if (array_diff(array_keys($settings), $allowed) || count($settings) !== count($allowed)) throw new RuntimeException('Invalid settings payload.');
$path = base_path('.env');
$content = file_get_contents($path);
foreach ($settings as $key => $value) {
    if (!is_string($value) || strpbrk($value, "\r\n\"\\") !== false) throw new RuntimeException('Invalid configuration value.');
    $line = $key.'="'.$value.'"';
    $pattern = '/^'.preg_quote($key, '/').'=.*$/m';
    if (preg_match($pattern, $content)) $content = preg_replace_callback($pattern, fn () => $line, $content);
    else $content .= PHP_EOL.$line.PHP_EOL;
}
if (file_put_contents($path, $content) === false) throw new RuntimeException('SMTP configuration write failed.');
chmod($path, 0600);
unlink($settingsPath);
echo 'SMTP settings replaced. Database and encryption keys preserved.'.PHP_EOL;
PHP
php artisan config:cache
chmod 600 bootstrap/cache/config.php
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
try {
    $transport = app('mailer')->getSymfonyTransport();
    $transport->start();
    $transport->stop();
    echo 'PRODUCTION_GMAIL_SMTP_AUTH_SUCCESS: no email sent.'.PHP_EOL;
} catch (Throwable $error) {
    echo 'PRODUCTION_SMTP_AUTH_FAILED: '.get_class($error).PHP_EOL;
    exit(1);
}
PHP
php artisan queue:restart
php artisan queue:work --stop-when-empty --max-time=50 --sleep=1 --tries=5 --timeout=45
echo SMTP_UPDATE_COMPLETE
'@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command.Replace("`r`n", "`n")))
    & ssh -p 65002 -o ConnectTimeout=20 $remote "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw 'SMTP activation or authentication failed; see the log.' }
} catch { Write-Host $_ -ForegroundColor Red }
Read-Host 'Press Enter to close this window'
