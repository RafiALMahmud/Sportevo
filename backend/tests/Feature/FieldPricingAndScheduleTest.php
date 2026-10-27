<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Field;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class FieldPricingAndScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, SportSeeder::class]);
        Queue::fake();
    }

    private function person(string $role = 'user'): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
    }

    private function facility(string $mode = 'hour', float $rate = 1000): array
    {
        $owner = $this->person('turf');
        $turf = Turf::create(['name' => 'Schedule test complex', 'email' => $owner->email, 'location' => 'Bangladesh',
            'turf_manager_id' => $owner->id, 'is_approved' => true, 'price_per_slot' => 100, 'commission_rate' => 10]);
        $field = $turf->fields()->create(['name' => 'Football', 'pricing_mode' => $mode,
            'price_per_slot' => $mode === 'slot' ? $rate : 0, 'price_per_hour' => $mode === 'hour' ? $rate : null]);
        $field->sports()->attach(Sport::first()->id);

        return [$owner, $turf, $field];
    }

    private function slot(Field $field, int $minutes = 90, int $hour = 10): Booking
    {
        $start = now()->addDays(2)->setTime($hour, 0);

        return Booking::create(['turf_id' => $field->turf_id, 'field_id' => $field->id,
            'start_time' => $start, 'end_time' => $start->copy()->addMinutes($minutes), 'status' => 'available']);
    }

    private function payload(Booking $slot): array
    {
        return ['turf_id' => $slot->turf_id, 'field_id' => $slot->field_id,
            'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()];
    }

    public function test_hourly_quote_matches_public_price_and_commission_and_ignores_customer_price(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()
            ->assertJsonPath('pricing_mode', 'hour')->assertJsonPath('slots.0.price', '1500.00');
        $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot) + ['price' => 1])->assertCreated()
            ->assertJsonPath('booking.price', '1500.00');
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk()
            ->assertJsonPath('booking.price', '1500.00')->assertJsonPath('booking.commission_amount', '150.00');
        $this->assertSame(150.0, $turf->walletBalance());
    }

    public function test_fixed_slot_price_does_not_scale_with_duration_and_hourly_rounding_supports_zero(): void
    {
        foreach ([['slot', 200, 30, '200.00'], ['slot', 200, 90, '200.00'], ['hour', 1.01, 30, '0.51'], ['hour', 0, 90, '0.00']] as [$mode, $rate, $duration, $price]) {
            [, $turf, $field] = $this->facility($mode, $rate);
            $slot = $this->slot($field, $duration);
            $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', $price);
            $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot))->assertCreated()->assertJsonPath('booking.price', $price);
        }
    }

    public function test_pricing_changes_update_open_slots_but_preserve_pending_and_accepted_quotes(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $pending = $this->slot($field, 90, 10);
        $booked = $this->slot($field, 60, 12);
        $available = $this->slot($field, 90, 14);
        foreach ([$pending, $booked] as $slot) {
            $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot))->assertCreated();
        }
        $this->actingAs($owner)->postJson('/api/bookings/'.$booked->id.'/accept')->assertOk();
        $this->putJson('/api/turfs/'.$turf->id.'/fields/'.$field->id, ['name' => $field->name, 'sports' => [Sport::first()->id],
            'pricing_mode' => 'hour', 'price_per_hour' => 2000])->assertOk();
        $visible = $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->json('slots');
        $this->assertSame('3000.00', collect($visible)->firstWhere('id', $available->id)['price']);
        $this->assertSame('in_process', collect($visible)->firstWhere('id', $pending->id)['display_status']);
        $this->assertSame('already_booked', collect($visible)->firstWhere('id', $booked->id)['display_status']);
        $this->assertNull($available->fresh()->price);
        $this->assertSame('1500.00', $pending->fresh()->price);
        $this->assertSame('1000.00', $booked->fresh()->price);
        $this->assertSame('100.00', $booked->fresh()->commission_amount);
        $this->postJson('/api/bookings/'.$pending->id.'/accept')->assertOk()->assertJsonPath('booking.price', '1500.00');
    }

    public function test_hourly_registration_creates_the_first_field_and_invalid_rates_are_rejected(): void
    {
        $owner = $this->person('turf');
        $payload = ['name' => 'New hourly complex', 'email' => $owner->email, 'location' => 'Bangladesh',
            'payment_provider' => 'bKash', 'payment_number' => '01712345678',
            'pricing_mode' => 'hour', 'price_per_hour' => 800, 'sports' => [Sport::first()->id]];
        $this->actingAs($owner)->postJson('/api/turfs', $payload)->assertCreated()
            ->assertJsonPath('turf.fields.0.pricing_mode', 'hour')->assertJsonPath('turf.fields.0.price_per_hour', '800.00');
        $turf = $owner->turf()->firstOrFail();
        $fieldPayload = ['name' => 'Tennis', 'sports' => [Sport::first()->id], 'pricing_mode' => 'hour'];
        $this->postJson('/api/turfs/'.$turf->id.'/fields', $fieldPayload)->assertUnprocessable()->assertJsonValidationErrors('price_per_hour');
        foreach ([-1, 100001, 'not-a-number'] as $invalid) {
            $this->postJson('/api/turfs/'.$turf->id.'/fields', $fieldPayload + ['price_per_hour' => $invalid])->assertUnprocessable()->assertJsonValidationErrors('price_per_hour');
        }
        $this->postJson('/api/turfs/'.$turf->id.'/fields', ['name' => 'Bad mode', 'sports' => [Sport::first()->id], 'pricing_mode' => 'day'])->assertUnprocessable()->assertJsonValidationErrors('pricing_mode');
        $this->assertSame(1, $turf->fields()->count());
    }

    public function test_generation_and_schedule_are_field_scoped_and_display_computed_prices(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $other = $turf->fields()->create(['name' => 'Cricket', 'price_per_slot' => 300]);
        $this->slot($other);
        $date = now()->addDays(2)->toDateString();
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id,
            'date' => $date, 'start_time' => '09:00', 'end_time' => '12:00', 'slot_duration' => 90])->assertCreated()->assertJsonCount(2, 'slots');
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id.'&date='.$date)->assertOk()
            ->assertJsonCount(2, 'bookings')->assertJsonPath('bookings.0.price', '1500.00')->assertJsonPath('timezone', config('app.timezone'));
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$other->id.'&date='.$date)->assertOk()
            ->assertJsonCount(1, 'bookings')->assertJsonPath('bookings.0.price', '300.00');
        $this->actingAs($this->person('turf'))->getJson('/api/turfs/'.$turf->id.'/schedule')->assertForbidden();
        $this->putJson('/api/turfs/'.$turf->id.'/fields/'.$field->id, ['name' => 'Unauthorized', 'pricing_mode' => 'hour', 'price_per_hour' => 1, 'sports' => [Sport::first()->id]])->assertForbidden();
    }

    public function test_schedule_keeps_pending_customer_contacts_private_and_rejects_foreign_fields_and_bad_dates(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $customer = $this->person();
        $slot = $this->slot($field);
        $this->actingAs($customer)->postJson('/api/bookings', $this->payload($slot))->assertCreated();
        $this->actingAs($owner)->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()->assertJsonMissing(['email' => $customer->email]);
        [, , $foreign] = $this->facility();
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$foreign->id)->assertNotFound();
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id.'&date=bad-date')->assertUnprocessable();
    }

    public function test_migration_preserves_existing_fixed_prices_and_booking_quotes(): void
    {
        [, , $field] = $this->facility('slot', 1234);
        $slot = $this->slot($field);
        $slot->update(['status' => 'pending', 'price' => 1234, 'user_id' => $this->person()->id]);
        $bookingsBefore = DB::table('bookings')->get()->toJson();
        $migration = require database_path('migrations/2026_10_14_000002_add_field_hourly_pricing.php');
        $migration->down();
        $migration->up();
        $this->assertSame('slot', $field->fresh()->pricing_mode);
        $this->assertNull($field->fresh()->price_per_hour);
        $this->assertSame('1234.00', $field->fresh()->price_per_slot);
        $this->assertSame($bookingsBefore, DB::table('bookings')->get()->toJson());
    }

    public function test_owner_can_record_offline_booking_without_customer_or_payment_and_publicly_show_already_booked(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $this->actingAs($owner)->patchJson($url, ['available' => false, 'unavailable_type' => 'offline_booking'])
            ->assertOk()->assertJsonPath('booking.status', 'unavailable')
            ->assertJsonPath('booking.unavailable_type', 'offline_booking')
            ->assertJsonPath('booking.price', '1500.00')->assertJsonPath('booking.commission_amount', null);
        $this->assertTrue($slot->fresh()->isOfflineBooking());
        $this->assertNull($slot->fresh()->user_id);
        $this->assertFalse($slot->fresh()->advance_required);
        $this->assertDatabaseCount('wallet_entries', 0);
        $this->assertDatabaseCount('email_deliveries', 0);

        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()
            ->assertJsonPath('bookings.0.unavailable_type', 'offline_booking');
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()
            ->assertJsonPath('slots.0.display_status', 'already_booked')->assertJsonPath('slots.0.can_request', false)
            ->assertJsonMissingPath('slots.0.unavailable_reason')->assertJsonMissingPath('slots.0.unavailable_by')
            ->assertJsonMissingPath('slots.0.unavailable_type')->assertJsonMissingPath('slots.0.user_id');
        $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot))->assertConflict();
    }

    public function test_owner_can_convert_legacy_unavailable_to_offline_and_reopen_without_losing_history(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $slot->update(['status' => 'unavailable', 'unavailable_reason' => 'Old block']);
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $this->actingAs($owner)->patchJson($url, ['available' => false, 'unavailable_type' => 'offline_booking', 'reason' => 'Walk-in booking'])
            ->assertOk()->assertJsonPath('booking.unavailable_reason', 'Walk-in booking');
        $this->patchJson($url, ['available' => false, 'unavailable_type' => 'offline_booking'])->assertConflict();
        $this->patchJson($url, ['available' => false, 'unavailable_type' => 'unavailable', 'reason' => 'Maintenance'])
            ->assertOk()->assertJsonPath('booking.unavailable_type', 'unavailable');
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.display_status', 'unavailable');
        $this->patchJson($url, ['available' => false, 'unavailable_type' => 'offline_booking'])->assertOk();
        $this->patchJson($url, ['available' => true])->assertOk()
            ->assertJsonPath('booking.status', 'available')->assertJsonPath('booking.unavailable_type', null)
            ->assertJsonPath('booking.unavailable_reason', null)->assertJsonPath('booking.unavailable_by', null)
            ->assertJsonPath('booking.unavailable_at', null);
        $this->assertDatabaseCount('bookings', 1);
        $this->assertDatabaseHas('activities', ['action' => 'Booking.updated']);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.can_request', true);
        $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot))->assertCreated();
    }

    public function test_offline_booking_keeps_recorded_price_and_past_schedule_while_open_slots_follow_new_rates(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $this->actingAs($owner)->patchJson($url, ['available' => false, 'unavailable_type' => 'offline_booking'])->assertOk();
        $field->update(['price_per_hour' => 2000]);
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()->assertJsonPath('bookings.0.price', '1500.00');
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '1500.00');
        $this->travel(3)->days();
        $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()->assertJsonPath('bookings.0.unavailable_type', 'offline_booking');
        $this->patchJson($url, ['available' => true])->assertUnprocessable();
        $this->travelBack();
        $this->patchJson($url, ['available' => true])->assertOk();
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.0.price', '3000.00');
        $this->assertNull($slot->fresh()->price);
    }

    public function test_offline_classification_cannot_replace_online_bookings_or_bypass_owner_and_validation_checks(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $payload = ['available' => false, 'unavailable_type' => 'offline_booking'];
        foreach (['turf', 'user', 'admin', 'superadmin'] as $role) {
            $this->actingAs($this->person($role))->patchJson($url, $payload)->assertForbidden();
        }
        $this->actingAs($owner)->patchJson($url, ['available' => false, 'unavailable_type' => 'booked', 'reason' => 'Invalid'])
            ->assertUnprocessable()->assertJsonValidationErrors('unavailable_type');
        $this->patchJson($url, $payload + ['reason' => str_repeat('x', 501)])->assertUnprocessable();
        $this->actingAs($this->person())->postJson('/api/bookings', $this->payload($slot))->assertCreated();
        $this->actingAs($owner)->patchJson($url, $payload)->assertConflict();
        $this->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();
        $this->patchJson($url, $payload)->assertConflict();
        $this->assertNull($slot->fresh()->unavailable_type);
        $this->assertSame('booked', $slot->fresh()->status);
    }

    public function test_offline_booking_blocks_generation_and_stale_open_rows_without_affecting_other_fields(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field, 60);
        $this->actingAs($owner)->patchJson('/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability',
            ['available' => false, 'unavailable_type' => 'offline_booking'])->assertOk();
        $generation = ['field_id' => $field->id, 'date' => $slot->start_time->toDateString(), 'start_time' => '10:00', 'end_time' => '11:00', 'slot_duration' => 60];
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $generation)->assertConflict();
        $other = $turf->fields()->create(['name' => 'Cricket', 'price_per_slot' => 500]);
        $generation['field_id'] = $other->id;
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $generation)->assertCreated();
        $stale = $this->slot($field, 60);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()
            ->assertJsonCount(1, 'slots')->assertJsonPath('slots.0.display_status', 'already_booked');
        $customer = $this->person();
        $this->actingAs($customer)->postJson('/api/bookings', $this->payload($stale))->assertConflict();
        $stale->update(['status' => 'pending', 'user_id' => $customer->id, 'price' => 1000]);
        $this->actingAs($owner)->postJson('/api/bookings/'.$stale->id.'/accept')->assertConflict();
        $this->assertDatabaseCount('wallet_entries', 0);
    }
}
