<?php

require dirname(__DIR__).'/backend/vendor/autoload.php';

$root = dirname(__DIR__);
$backend = Dotenv\Dotenv::parse(file_get_contents($root.'/backend/.env'));
$frontend = Dotenv\Dotenv::parse(file_get_contents($root.'/frontend/.env.local'));
$id = $backend['GOOGLE_CLIENT_ID'] ?? '';
if (! preg_match('/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/', $id)
    || $id !== ($frontend['VITE_GOOGLE_CLIENT_ID'] ?? '')) {
    throw new RuntimeException('Matching Google client IDs are required in the private backend/frontend configuration.');
}
$folder = $root.'/backend/storage/app/private/hostinger-deploy';
if (! is_dir($folder) && ! mkdir($folder, 0700, true)) throw new RuntimeException('Cannot create private deployment folder.');
$path = $folder.'/google-settings.json';
if (file_put_contents($path, json_encode(['GOOGLE_CLIENT_ID' => $id], JSON_THROW_ON_ERROR)) === false) {
    throw new RuntimeException('Cannot prepare Google configuration.');
}
chmod($path, 0600);
echo "MATCHING_GOOGLE_CLIENT_IDS_PREPARED_NO_CLIENT_SECRET\n";
