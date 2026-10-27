$ErrorActionPreference = 'Continue'
$workspacePath = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-mail-check.log'
$command = @'
set -u
echo MAIL_DIAGNOSTICS
echo SSH_PHP
command -v php
php -r 'echo PHP_VERSION.PHP_EOL;'
echo CRON_PHP
if test -x /usr/bin/php; then /usr/bin/php -r 'echo PHP_VERSION.PHP_EOL;' 2>&1; fi
for bin in /opt/alt/php82/usr/bin/php /opt/alt/php83/usr/bin/php /opt/alt/php84/usr/bin/php /opt/alt/php85/usr/bin/php; do
  if test -x "$bin"; then echo "$bin"; "$bin" -r 'echo PHP_VERSION.PHP_EOL;'; fi
done
cd "$HOME/domains/sportevo.games/sportevo" || exit 1
php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
echo 'MAILER: '.config('mail.default').PHP_EOL;
echo 'SMTP_HOST: '.config('mail.mailers.smtp.host').PHP_EOL;
echo 'SMTP_PORT: '.config('mail.mailers.smtp.port').PHP_EOL;
echo 'SMTP_PASSWORD_CONFIGURED: '.(config('mail.mailers.smtp.password') ? 'YES' : 'NO').PHP_EOL;
echo 'QUEUE_CONNECTION: '.config('queue.default').PHP_EOL;
echo 'QUEUE_NAME: '.config('queue.connections.'.config('queue.default').'.queue', 'default').PHP_EOL;
echo 'SERVER_TIME: '.now()->toIso8601String().PHP_EOL;
echo 'OUTBOX_STATUS_COUNTS: '.App\Models\EmailDelivery::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status')->toJson().PHP_EOL;
foreach (App\Models\EmailDelivery::latest('id')->limit(8)->get() as $delivery) {
    echo 'DELIVERY: '.json_encode(['id' => $delivery->id, 'status' => $delivery->status, 'attempts' => $delivery->attempts, 'created_at' => (string) $delivery->created_at, 'sent_at' => (string) $delivery->sent_at]).PHP_EOL;
    $error = strtolower((string) $delivery->last_error);
    if ($error) {
        $category = match (true) {
            str_contains($error, 'authenticate'), str_contains($error, '535') => 'SMTP_AUTHENTICATION_FAILED',
            str_contains($error, 'timed out'), str_contains($error, 'timeout') => 'SMTP_TIMEOUT',
            str_contains($error, 'connection'), str_contains($error, 'network') => 'SMTP_CONNECTION_FAILED',
            str_contains($error, 'certificate'), str_contains($error, 'crypto') => 'SMTP_TLS_FAILED',
            default => 'TRANSPORT_ERROR_REQUIRES_INSPECTION',
        };
        echo 'ERROR_CATEGORY: '.$category.PHP_EOL;
    }
}
echo 'PENDING_JOBS: '.Illuminate\Support\Facades\DB::table('jobs')->count().PHP_EOL;
echo 'READY_JOBS: '.Illuminate\Support\Facades\DB::table('jobs')->whereNull('reserved_at')->where('available_at', '<=', time())->count().PHP_EOL;
echo 'FAILED_JOBS: '.Illuminate\Support\Facades\DB::table('failed_jobs')->count().PHP_EOL;
if (config('mail.default') !== 'smtp') { echo 'SMTP_AUTH_SKIPPED: mailer is not SMTP'.PHP_EOL; exit(0); }
try {
    config(['mail.mailers.smtp.timeout' => 15]);
    $transport = app('mailer')->getSymfonyTransport();
    $transport->start();
    $transport->stop();
    echo 'LIVE_SMTP_AUTH_SUCCESS: no email sent.'.PHP_EOL;
} catch (Throwable $error) {
    echo 'LIVE_SMTP_AUTH_FAILED: '.get_class($error).' CODE: '.$error->getCode().PHP_EOL;
}
PHP
echo MAIL_CHECK_COMPLETE
'@
Write-Host 'Enter your SSH password to inspect LIVE email configuration, queues and SMTP authentication. No email is sent; no configuration or database is changed.'
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($command.Replace("`r`n", "`n")))
& ssh -p 65002 -o ConnectTimeout=20 u302655234@147.93.78.83 "echo $encoded | base64 -d | sh 2>&1" | Tee-Object -FilePath $logPath
Write-Host "Inspection exit code: $LASTEXITCODE"
Write-Host "Log saved to $logPath"
Read-Host 'Press Enter to close this window'
