<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Services\AdvancePayment;
use App\Services\FieldPricing;
use Carbon\CarbonImmutable;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SlotPricingAndOvernightTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Queue::fake();
    }

    private function person(string $role = 'user'): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
    }

    private function facility(): array
    {
        $owner = $this->person('turf');
        $turf = Turf::create(['name' => 'Night games', 'email' => $owner->email, 'location' => 'Bangladesh',
            'turf_manager_id' => $owner->id, 'is_approved' => true, 'price_per_slot' => 1000, 'commission_rate' => 10]);
        $field = $turf->fields()->create(['name' => 'Main field', 'pricing_mode' => 'hour', 'price_per_hour' => 1000, 'price_per_slot' => 0]);

        return [$owner, $turf, $field];
    }

    private function generation(int $fieldId, array $changes = []): array
    {
        return array_replace(['field_id' => $fieldId, 'date' => now()->addDays(3)->toDateString(),
            'start_time' => '17:00', 'end_time' => '21:00', 'slot_duration' => 60], $changes);
    }

    private function requestSlot(Booking $slot): array
    {
        return ['turf_id' => $slot->turf_id, 'field_id' => $slot->field_id,
            'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()];
    }

    public function test_generate_11pm_to_midnight_and_customer_can_request_it(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $payload = $this->generation($field->id, ['start_time' => '23:00', 'end_time' => '00:00']);
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated()->assertJsonCount(1, 'slots');
        $slot = Booking::firstOrFail();
        $this->assertSame($payload['date'].' 23:00', $slot->start_time->format('Y-m-d H:i'));
        $this->assertSame($slot->start_time->copy()->addDay()->toDateString().' 00:00', $slot->end_time->format('Y-m-d H:i'));
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id.'&date='.$payload['date'])->assertOk()->assertJsonCount(1, 'slots');
        $this->actingAs($this->person())->postJson('/api/bookings', $this->requestSlot($slot))->assertCreated()->assertJsonPath('booking.price', '1000.00');
    }

    public function test_overnight_slots_are_partitioned_by_start_date_and_next_day_overlaps_are_atomic(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $payload = $this->generation($field->id, ['start_time' => '23:00', 'end_time' => '03:00']);
        $url = '/api/turfs/'.$turf->id;
        $this->actingAs($owner)->postJson($url.'/slots', $payload)->assertCreated()->assertJsonCount(4, 'slots');
        $next = now()->addDays(4)->toDateString();
        foreach (['/slots', '/schedule'] as $path) {
            $key = $path === '/slots' ? 'slots' : 'bookings';
            $this->getJson($url.$path.'?field_id='.$field->id.'&date='.$payload['date'])->assertOk()->assertJsonCount(1, $key);
            $this->getJson($url.$path.'?field_id='.$field->id.'&date='.$next)->assertOk()->assertJsonCount(3, $key);
        }
        $payload = $this->generation($field->id, ['date' => $next, 'start_time' => '02:00', 'end_time' => '05:00']);
        $this->postJson($url.'/slots', $payload)->assertConflict();
        $this->assertDatabaseCount('bookings', 4);
        $this->postJson($url.'/slots', array_replace($payload, ['start_time' => '03:00']))->assertCreated()->assertJsonCount(2, 'slots');
    }

    public function test_peak_window_sets_only_overlapping_slots_and_remains_fixed_when_field_rate_changes(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $payload = $this->generation($field->id, ['peak_enabled' => true, 'peak_start' => '18:00', 'peak_end' => '20:00', 'peak_pricing_mode' => 'hour', 'peak_rate' => 1500]);
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated();
        $slots = Booking::orderBy('start_time')->get();
        $this->assertSame([false, true, true, false], $slots->pluck('is_peak')->all());
        $this->assertSame([1000.0, 1500.0, 1500.0, 1000.0], $slots->map(fn ($slot) => FieldPricing::forSlot($slot, $field))->all());
        $field->update(['price_per_hour' => 2000]);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()
            ->assertJsonPath('slots.0.price', '2000.00')->assertJsonPath('slots.1.price', '1500.00')->assertJsonPath('slots.1.is_peak', true);
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()->assertJsonPath('bookings.1.price', '1500.00');
    }

    public function test_peak_period_crossing_midnight_applies_to_both_dates_and_respects_adjacent_boundaries(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $payload = $this->generation($field->id, ['start_time' => '22:00', 'end_time' => '03:00',
            'peak_enabled' => true, 'peak_start' => '23:00', 'peak_end' => '02:00', 'peak_pricing_mode' => 'slot', 'peak_rate' => 1800]);
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated()->assertJsonCount(5, 'slots');
        $this->assertSame([false, true, true, true, false], Booking::orderBy('start_time')->pluck('is_peak')->map(fn ($v) => (bool) $v)->all());
        $next = now()->addDays(4)->toDateString();
        $this->postJson('/api/turfs/'.$turf->id.'/slots', array_replace($payload, ['date' => $next, 'start_time' => '03:00', 'end_time' => '05:00']))
            ->assertCreated()->assertJsonPath('slots.0.is_peak', false);
    }

    public function test_partial_peak_overlap_uses_full_slot_rate_and_hourly_rounding_and_fixed_rates_work(): void
    {
        foreach ([['hour', 1500, 2250.0], ['slot', 700, 700.0], ['hour', 0, 0.0], ['hour', 1.01, 1.52]] as [$mode, $rate, $expected]) {
            [$owner, $turf, $field] = $this->facility();
            $payload = $this->generation($field->id, ['start_time' => '17:30', 'end_time' => '19:00', 'slot_duration' => 90,
                'peak_enabled' => true, 'peak_start' => '18:00', 'peak_end' => '20:00', 'peak_pricing_mode' => $mode, 'peak_rate' => $rate]);
            $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated();
            $slot = $field->bookings()->firstOrFail();
            $this->assertTrue($slot->is_peak);
            $this->assertSame($expected, FieldPricing::forSlot($slot, $field));
        }
    }

    public function test_peak_validation_and_equal_times_do_not_create_any_slots(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $url = '/api/turfs/'.$turf->id.'/slots';
        $base = $this->generation($field->id, ['peak_enabled' => true, 'peak_start' => '18:00', 'peak_end' => '20:00', 'peak_pricing_mode' => 'slot', 'peak_rate' => 1500]);
        $this->actingAs($owner);
        foreach ([['peak_start' => '25:00'], ['peak_end' => '18:00'], ['peak_rate' => -1], ['peak_rate' => 100001], ['peak_rate' => null], ['peak_pricing_mode' => 'day'], ['end_time' => '17:00']] as $invalid) {
            $this->postJson($url, array_replace($base, $invalid))->assertUnprocessable();
            $this->assertDatabaseCount('bookings', 0);
        }
        $this->postJson($url, array_replace($base, ['peak_enabled' => false, 'peak_rate' => null, 'peak_start' => 'bad']))->assertCreated()->assertJsonPath('slots.0.is_peak', false);
    }

    public function test_available_slot_can_have_an_individual_hourly_or_fixed_price_and_reset_to_field_rate(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $this->generation($field->id, ['slot_duration' => 90]))->assertCreated();
        $slot = Booking::firstOrFail();
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/price';
        $this->patchJson($url, ['pricing_mode' => 'hour', 'rate' => 1600])->assertOk()->assertJsonPath('booking.price', '2400.00');
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '2400.00')->assertJsonPath('slots.1.price', '1500.00');
        $this->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 800])->assertOk()->assertJsonPath('booking.price', '800.00');
        $field->update(['price_per_hour' => 2000]);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '800.00');
        $this->patchJson($url, ['use_field_price' => true])->assertOk()->assertJsonPath('booking.price', '3000.00')->assertJsonPath('booking.slot_rate', null);
        $this->assertNull($slot->fresh()->price);
    }

    public function test_custom_price_is_used_for_customer_quote_advance_and_commission_and_is_immutable_after_request(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $turf->update(['advance_enabled' => true, 'advance_amount' => 500, 'advance_window_minutes' => 60, 'payment_provider' => 'bKash', 'payment_number' => '01712345678']);
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $this->generation($field->id))->assertCreated();
        $slot = Booking::firstOrFail();
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/price';
        $this->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 400])->assertOk();
        $this->actingAs($this->person())->postJson('/api/bookings', $this->requestSlot($slot) + ['price' => 1])->assertCreated()
            ->assertJsonPath('booking.price', '400.00')->assertJsonPath('booking.advance_amount', '400.00');
        $this->actingAs($owner)->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 900])->assertConflict();
        $field->update(['price_per_hour' => 9000]);
        $this->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();
        $this->patchJson($url, ['use_field_price' => true])->assertConflict();
        $this->postJson('/api/bookings/'.$slot->id.'/advance/confirm')->assertOk()->assertJsonPath('booking.commission_amount', '40.00');
        $this->assertSame('400.00', $slot->fresh()->price);
        $this->assertSame(40.0, $turf->walletBalance());
    }

    public function test_rejected_cancelled_and_expired_reservations_release_the_same_custom_rate(): void
    {
        foreach (['reject', 'cancel', 'expire'] as $action) {
            [$owner, $turf, $field] = $this->facility();
            if ($action === 'expire') {
                $turf->update(['advance_enabled' => true, 'advance_amount' => 500, 'advance_window_minutes' => 30, 'payment_provider' => 'Nagad', 'payment_number' => '01712345678']);
            }
            $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $this->generation($field->id, ['peak_enabled' => true,
                'peak_start' => '17:00', 'peak_end' => '21:00', 'peak_pricing_mode' => 'hour', 'peak_rate' => 1750]))->assertCreated();
            $slot = $field->bookings()->firstOrFail();
            $customer = $this->person();
            $this->actingAs($customer)->postJson('/api/bookings', $this->requestSlot($slot))->assertCreated();
            if ($action === 'cancel') {
                $this->postJson('/api/bookings/'.$slot->id.'/cancel')->assertOk();
            } elseif ($action === 'reject') {
                $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/reject')->assertOk();
            } else {
                $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();
                $this->travel(31)->minutes();
                $this->assertTrue(app(AdvancePayment::class)->expire($slot->id));
                $this->travelBack();
            }
            $released = Booking::where('field_id', $field->id)->where('start_time', $slot->start_time)->where('status', 'available')->firstOrFail();
            $this->assertSame('1750.00', $released->slot_rate);
            $this->assertTrue($released->is_peak);
            $this->assertSame(1750.0, FieldPricing::forSlot($released, $field));
        }
    }

    public function test_only_owner_can_price_future_open_slots_and_invalid_prices_and_foreign_ids_fail(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $this->generation($field->id))->assertCreated();
        $slot = Booking::firstOrFail();
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/price';
        foreach (['turf', 'user', 'admin', 'superadmin'] as $role) {
            $this->actingAs($this->person($role))->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 1])->assertForbidden();
        }
        $this->actingAs($owner);
        foreach ([['rate' => -1], ['rate' => 100001], ['rate' => 'oops'], ['pricing_mode' => 'day'], ['use_field_price' => 'oops']] as $invalid) {
            $this->patchJson($url, array_replace(['pricing_mode' => 'slot', 'rate' => 100], $invalid))->assertUnprocessable();
        }
        $this->patchJson($url, [])->assertUnprocessable();
        [, $other] = $this->facility();
        $this->patchJson('/api/turfs/'.$other->id.'/slots/'.$slot->id.'/price', ['pricing_mode' => 'slot', 'rate' => 100])->assertForbidden();
        foreach (['unavailable', 'pending', 'booked', 'completed', 'cancelled', 'rejected'] as $status) {
            $slot->update(['status' => $status]);
            $this->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 100])->assertConflict();
        }
        $slot->update(['status' => 'available', 'start_time' => now()->subHour()]);
        $this->patchJson($url, ['pricing_mode' => 'slot', 'rate' => 100])->assertUnprocessable();
    }

    public function test_offline_booking_snapshots_custom_rate_and_reopening_keeps_its_slot_specific_price(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $this->generation($field->id))->assertCreated();
        $slot = Booking::firstOrFail();
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id;
        $this->patchJson($url.'/price', ['pricing_mode' => 'hour', 'rate' => 1800])->assertOk();
        $this->patchJson($url.'/availability', ['available' => false, 'unavailable_type' => 'offline_booking'])->assertOk()->assertJsonPath('booking.price', '1800.00');
        $field->update(['price_per_hour' => 9000]);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '1800.00');
        $this->patchJson($url.'/availability', ['available' => true])->assertOk();
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '1800.00');
        $this->assertDatabaseCount('wallet_entries', 0);
    }

    public function test_peak_comparison_works_with_immutable_dates_in_bangladesh_timezone(): void
    {
        $start = CarbonImmutable::parse('2027-01-16 00:00', 'Asia/Dhaka');
        $this->assertTrue(FieldPricing::overlapsPeak($start, $start->addHour(), '23:00', '02:00'));
        $this->assertFalse(FieldPricing::overlapsPeak($start->addHours(2), $start->addHours(3), '23:00', '02:00'));
    }
}
