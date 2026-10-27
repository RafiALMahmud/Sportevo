<?php

use Illuminate\Contracts\Console\Kernel;

// Generate the private upload from the current production environment file.
// No SMTP credentials are printed to the terminal.
require dirname(__DIR__).'/backend/vendor/autoload.php';
$backend = dirname(__DIR__).'/backend';
$values = Dotenv\Dotenv::createArrayBacked($backend, '.env.hostinger')->load();
$defaults = [
    'MAIL_MAILER' => 'smtp', 'MAIL_SCHEME' => 'smtp', 'MAIL_URL' => 'null',
    'MAIL_HOST' => 'smtp.gmail.com', 'MAIL_PORT' => '587',
    'MAIL_USERNAME' => 'sportevobd@gmail.com', 'MAIL_PASSWORD' => '',
    'MAIL_ENCRYPTION' => 'tls', 'MAIL_FROM_ADDRESS' => 'sportevobd@gmail.com',
    'MAIL_FROM_NAME' => 'SportEvo',
];
$settings = [];
foreach ($defaults as $key => $default) {
    $settings[$key] = (string) ($values[$key] ?? $default);
}
$settings['MAIL_PASSWORD'] = preg_replace('/\s+/', '', $settings['MAIL_PASSWORD']);
if ($settings['MAIL_PASSWORD'] === '') {
    throw new RuntimeException('Set MAIL_PASSWORD in backend/.env.hostinger first.');
}
$app = require $backend.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config([
    'mail.default' => 'smtp',
    'mail.mailers.smtp' => [
        'transport' => 'smtp', 'scheme' => $settings['MAIL_SCHEME'], 'url' => null,
        'host' => $settings['MAIL_HOST'], 'port' => (int) $settings['MAIL_PORT'],
        'username' => $settings['MAIL_USERNAME'], 'password' => $settings['MAIL_PASSWORD'],
        'timeout' => 15,
    ],
]);
try {
    $transport = app('mailer')->getSymfonyTransport();
    $transport->start();
    $transport->stop();
} catch (Throwable $error) {
    fwrite(STDERR, 'Gmail authentication failed (code '.$error->getCode().'). Check the new app password. No email sent.'.PHP_EOL);
    exit(1);
}
$path = $backend.'/storage/app/private/hostinger-deploy/smtp-settings.json';
if (file_put_contents($path, json_encode($settings, JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Could not prepare private SMTP settings.');
}
echo 'New production SMTP credentials authenticated. Private upload prepared; no email sent.'.PHP_EOL;
