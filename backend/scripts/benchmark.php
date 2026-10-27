<?php

use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TurfController;
use App\Models\EmailDelivery;
use App\Models\Turf;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

// CLI-only, opt-in synthetic data is always rolled back. Never sends email.
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

function sample(callable $run, int $iterations = 10): array
{
    $values = [];
    for ($i = 0; $i < $iterations; $i++) {
        $start = hrtime(true);
        $run();
        $values[] = (hrtime(true) - $start) / 1e6;
    }
    sort($values);

    return ['samples' => count($values), 'p50_ms' => round($values[(int) floor((count($values) - 1) * .5)], 2),
        'p95_ms' => round($values[(int) ceil((count($values) - 1) * .95)], 2), 'max_ms' => round(max($values), 2)];
}
function endpoint(callable $run): array
{
    $result = sample(function () use ($run) {
        $run()->getContent();
    }, 5);
    DB::enableQueryLog();
    DB::flushQueryLog();
    $response = $run();
    $body = $response->getContent();
    $queries = DB::getQueryLog();
    DB::disableQueryLog();

    return $result + ['queries' => count($queries), 'sql_ms' => round(array_sum(array_column($queries, 'time')), 2), 'response_bytes' => strlen($body)];
}
$result = ['php' => PHP_VERSION, 'driver' => DB::connection()->getDriverName(), 'opcache_loaded' => extension_loaded('Zend OPcache')];
$result['connection'] = sample(function () {
    DB::purge();
    DB::connection()->getPdo();
}, 5);
$result['select_1'] = sample(fn () => DB::select('SELECT 1'), 30);
if (in_array('--smtp', $argv, true)) {
    try {
        $result['smtp_connect_auth'] = sample(function () {
            $transport = Mail::mailer('smtp')->getSymfonyTransport();
            $transport->start();
            $transport->stop();
        }, 3);
        $result['smtp_note'] = 'Connection, TLS and authentication only. No email was sent.';
    } catch (Throwable $error) {
        $result['smtp_error_class'] = get_class($error);
    }
}
DB::beginTransaction();
try {
    if (in_array('--fixtures', $argv, true)) {
        $roles = DB::table('roles')->pluck('id', 'name');
        if (! isset($roles['turf'], $roles['user'])) {
            throw new RuntimeException('Seed roles before benchmarking.');
        }
        $stamp = now();
        $tag = 'perf-'.bin2hex(random_bytes(4));
        $customerIds = [];
        for ($i = 0; $i < 10; $i++) {
            $customerIds[] = DB::table('users')->insertGetId(['name' => Crypt::encryptString('Performance customer'), 'email' => Crypt::encryptString("$tag-c$i@example.invalid"), 'email_hash' => User::emailHash("$tag-c$i@example.invalid"), 'password' => 'not-an-authenticatable-password', 'role_id' => $roles['user'], 'created_at' => $stamp, 'updated_at' => $stamp]);
        }
        $bookingRows = [];
        $fieldIds = [];
        $reviewRows = [];
        $photoRows = [];
        $sportId = DB::table('sports')->value('id');
        for ($i = 0; $i < 40; $i++) {
            $ownerId = DB::table('users')->insertGetId(['name' => Crypt::encryptString('Performance owner'), 'email' => Crypt::encryptString("$tag-o$i@example.invalid"), 'email_hash' => User::emailHash("$tag-o$i@example.invalid"), 'password' => 'not-an-authenticatable-password', 'role_id' => $roles['turf'], 'created_at' => $stamp, 'updated_at' => $stamp]);
            $turfId = DB::table('turfs')->insertGetId(['name' => "Performance complex $i", 'email' => Crypt::encryptString("$tag-t$i@example.invalid"), 'email_hash' => Turf::emailHash("$tag-t$i@example.invalid"), 'phone' => null, 'location' => 'Dhaka', 'turf_manager_id' => $ownerId, 'is_approved' => $i % 4 !== 0, 'price_per_slot' => 100, 'commission_rate' => 10, 'created_at' => $stamp, 'updated_at' => $stamp]);
            $firstOwner ??= $ownerId;
            for ($f = 0; $f < 2; $f++) {
                $fieldId = DB::table('fields')->insertGetId(['turf_id' => $turfId, 'name' => "Field $f", 'price_per_slot' => 100, 'created_at' => $stamp, 'updated_at' => $stamp]);
                $fieldIds[] = $fieldId;
                if ($sportId) {
                    DB::table('field_sport')->insert(['field_id' => $fieldId, 'sport_id' => $sportId]);
                }
                for ($j = 0; $j < 125; $j++) {
                    $start = now()->startOfDay()->addDays(1 + intdiv($j, 12))->addHours(8 + $j % 12);
                    $status = $j % 5 === 0 ? 'booked' : ($j % 5 === 1 ? 'pending' : 'available');
                    $bookingRows[] = ['turf_id' => $turfId, 'field_id' => $fieldId, 'user_id' => $status === 'available' ? null : $customerIds[$j % 10], 'status' => $status, 'start_time' => $start, 'end_time' => $start->copy()->addHour(), 'price' => $status === 'available' ? null : 100, 'commission_rate' => 10, 'commission_amount' => $status === 'booked' ? 10 : null, 'created_at' => $stamp, 'updated_at' => $stamp];
                }
                for ($p = 0; $p < 12; $p++) {
                    $photoRows[] = ['turf_id' => $turfId, 'field_id' => $fieldId, 'path' => "benchmark/$tag/$fieldId-$p.jpg", 'sort_order' => $p, 'created_at' => $stamp, 'updated_at' => $stamp];
                }
            }
        }
        foreach (array_chunk($bookingRows, 500) as $chunk) {
            DB::table('bookings')->insert($chunk);
        }
        foreach (array_chunk($photoRows, 500) as $chunk) {
            DB::table('turf_photos')->insert($chunk);
        }
        $charges = DB::table('bookings')->whereIn('field_id', $fieldIds)->where('status', 'booked')->get(['id', 'turf_id'])->map(fn ($b) => ['booking_id' => $b->id, 'turf_id' => $b->turf_id, 'type' => 'commission_charge', 'amount' => 10, 'created_at' => $stamp, 'updated_at' => $stamp])->all();
        foreach (array_chunk($charges, 500) as $chunk) {
            DB::table('wallet_entries')->insert($chunk);
        }
        $result['synthetic_dataset'] = ['complexes' => 40, 'fields' => 80, 'slots' => 10000, 'wallet_entries' => count($charges), 'photos' => count($photoRows), 'rolled_back' => true];
    }
    $request = Request::create('/api/dashboard/platform');
    $result['platform'] = endpoint(fn () => app(DashboardController::class)->platform($request));
    $result['directory'] = endpoint(fn () => app(TurfController::class)->index(Request::create('/api/turfs')));
    if (isset($firstOwner)) {
        $owner = User::find($firstOwner);
        $request->setUserResolver(fn () => $owner);
        $result['owner_dashboard'] = endpoint(fn () => app(DashboardController::class)->turf($request));
    }
    $result['outbox_write'] = sample(fn () => EmailDelivery::create(['recipient' => 'benchmark@example.invalid', 'subject' => 'Benchmark, never sent', 'body' => 'This transaction is rolled back.']), 20);
} finally {
    DB::rollBack();
}
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
