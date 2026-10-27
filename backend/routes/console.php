<?php

use App\Services\AdvancePayment;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('bookings:expire-advances', function () {
    $this->info(app(AdvancePayment::class)->expireDue().' unpaid booking holds expired.');
})->purpose('Release accepted bookings whose advance payment deadline elapsed without a submitted reference');
Schedule::command('bookings:expire-advances')->everyMinute()->withoutOverlapping();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('privacy:snapshot', function () {
    $directory = storage_path('app/private/encryption-snapshots');
    if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
        throw new RuntimeException('Cannot create snapshot directory.');
    }
    $path = $directory.'/personal-data-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.encrypted';
    $handle = fopen($path, 'xb');
    if (! $handle) {
        throw new RuntimeException('Cannot create encrypted snapshot.');
    }
    try {
        DB::transaction(function () use ($handle) {
            foreach (['users', 'turfs', 'activities', 'email_deliveries'] as $table) {
                foreach (DB::table($table)->orderBy('id')->lazyById(100) as $row) {
                    $line = Crypt::encryptString(json_encode(['table' => $table, 'row' => $row], JSON_THROW_ON_ERROR))."\n";
                    if (fwrite($handle, $line) !== strlen($line)) {
                        throw new RuntimeException('Snapshot write failed.');
                    }
                }
            }
        });
    } finally {
        fclose($handle);
    }
    $this->info('Encrypted personal-table snapshot: '.$path);
    $this->info('Preserve the existing APP_KEY separately. This snapshot supplements a complete database backup.');
})->purpose('Create an encrypted raw snapshot of the tables changed by personal-data encryption');
