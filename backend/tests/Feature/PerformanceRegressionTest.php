<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TurfController;
use App\Models\Booking;
use App\Models\CommissionRefund;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PerformanceRegressionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Queue::fake();
    }

    private function complex(): Turf
    {
        $owner = User::factory()->create(['role_id' => Role::where('name', 'turf')->value('id')]);

        return Turf::create(['name' => 'Performance complex', 'email' => $owner->email, 'location' => 'Dhaka',
            'turf_manager_id' => $owner->id, 'price_per_slot' => 100, 'commission_rate' => 10, 'is_approved' => true]);
    }

    private function platformQueries(): int
    {
        DB::enableQueryLog();
        DB::flushQueryLog();
        app(DashboardController::class)->platform(Request::create('/api/dashboard/platform'));
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_platform_query_count_does_not_grow_with_complex_count(): void
    {
        $this->complex();
        $oneComplex = $this->platformQueries();
        for ($i = 0; $i < 12; $i++) {
            $turf = $this->complex();
            $turf->walletEntries()->create(['type' => 'commission_charge', 'amount' => 10]);
        }
        $manyComplexes = $this->platformQueries();
        $this->assertSame($oneComplex, $manyComplexes);
        $this->assertLessThanOrEqual(20, $manyComplexes);
    }

    public function test_aggregated_wallet_retains_archived_debt_and_subtracts_settlements_and_refunds(): void
    {
        $turf = $this->complex();
        $turf->walletEntries()->create(['type' => 'commission_charge', 'amount' => 100]);
        $turf->walletEntries()->create(['type' => 'settlement', 'amount' => 20]);
        $field = $turf->fields()->create(['name' => 'Football', 'price_per_slot' => 100]);
        $booking = Booking::create(['turf_id' => $turf->id, 'field_id' => $field->id,
            'start_time' => now()->addDay(), 'end_time' => now()->addDay()->addHour(), 'status' => 'cancelled']);
        CommissionRefund::create(['turf_id' => $turf->id, 'booking_id' => $booking->id, 'amount' => 15, 'created_by' => $turf->turf_manager_id]);
        $turf->delete();
        $active = $this->complex();
        $active->walletEntries()->create(['type' => 'commission_charge', 'amount' => 12.50]);
        $response = app(DashboardController::class)->platform(Request::create('/api/dashboard/platform'))->getData(true);
        $this->assertSame(77.5, $response['walletOutstanding']);
        $this->assertSame(1, $response['stats']['totalTurfs']);
    }

    public function test_directory_returns_one_ordered_cover_per_complex_without_truncating_details(): void
    {
        $turfs = [$this->complex(), $this->complex()];
        foreach ($turfs as $turf) {
            $field = $turf->fields()->create(['name' => 'Football', 'price_per_slot' => 100]);
            foreach ([3, 1, 2] as $order) {
                $turf->photos()->create(['field_id' => $field->id, 'path' => "test/$order.jpg", 'sort_order' => $order]);
            }
        }
        $controller = app(TurfController::class);
        $directory = $controller->index(Request::create('/api/turfs'))->getData(true);
        $this->assertCount(2, $directory['data']);
        foreach ($directory['data'] as $complex) {
            $this->assertCount(1, $complex['photos']);
            $this->assertSame('test/1.jpg', $complex['photos'][0]['path']);
            $this->assertArrayNotHasKey('photos', $complex['fields'][0]);
        }
        $detail = $controller->show($turfs[0])->getData(true);
        $this->assertCount(3, $detail['turf']['photos']);
        $this->assertCount(3, $detail['turf']['fields'][0]['photos']);
    }

    public function test_indexable_date_filter_includes_midnight_and_excludes_next_day(): void
    {
        $turf = $this->complex();
        $field = $turf->fields()->create(['name' => 'Football', 'price_per_slot' => 100]);
        $day = now()->addDays(3)->startOfDay();
        foreach ([$day->copy()->subHour(), $day, $day->copy()->addHours(23), $day->copy()->addDay()] as $start) {
            Booking::create(['turf_id' => $turf->id, 'field_id' => $field->id,
                'start_time' => $start, 'end_time' => $start->copy()->addHour(), 'status' => 'available']);
        }
        $response = $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id.'&date='.$day->toDateString());
        $response->assertOk()->assertJsonCount(2, 'slots');
    }
}
