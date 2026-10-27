<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SlotGenerationAndDeletionTest extends TestCase
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
        $turf = Turf::create(['name' => 'Schedule Arena', 'email' => $owner->email, 'location' => 'Bangladesh',
            'turf_manager_id' => $owner->id, 'price_per_slot' => 1000, 'commission_rate' => 10, 'is_approved' => true]);
        $field = $turf->fields()->create(['name' => 'Main field', 'price_per_slot' => 1000]);

        return [$owner, $turf, $field];
    }

    private function slot($field, int $hour = 10, int $days = 3): Booking
    {
        $start = now()->addDays($days)->setTime($hour, 0);

        return $field->bookings()->create(['turf_id' => $field->turf_id, 'start_time' => $start, 'end_time' => $start->copy()->addHour(), 'status' => 'available']);
    }

    private function peakData($field, array $changes = []): array
    {
        return array_replace(['field_id' => $field->id, 'date' => now()->addDays(3)->toDateString(), 'slot_duration' => 60,
            'peak_only' => true, 'peak_start' => '18:00', 'peak_end' => '21:00', 'peak_pricing_mode' => 'hour', 'peak_rate' => 1500], $changes);
    }

    public function test_peak_only_needs_no_regular_times_and_creates_only_peak_slots_with_the_peak_rate(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $regular = $this->slot($field);
        $payload = $this->peakData($field, ['peak_enabled' => false]);
        $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated()
            ->assertJsonCount(3, 'slots')->assertJsonPath('slots.0.is_peak', true)->assertJsonPath('slots.0.slot_rate', '1500.00');
        $created = $field->bookings()->whereKeyNot($regular->id)->orderBy('start_time')->get();
        $this->assertSame(['18:00', '19:00', '20:00'], $created->map(fn ($slot) => $slot->start_time->format('H:i'))->all());
        $this->assertTrue($created->every(fn ($slot) => $slot->is_peak));
        $this->assertSame('available', $regular->fresh()->status);
        $this->assertNull($regular->fresh()->slot_rate);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonPath('slots.1.price', '1500.00');
    }

    public function test_peak_only_crosses_midnight_ignores_regular_times_and_keeps_overlap_atomic(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $payload = $this->peakData($field, ['peak_start' => '23:00', 'peak_end' => '02:00', 'start_time' => 'bad', 'end_time' => 'bad']);
        $url = '/api/turfs/'.$turf->id.'/slots';
        $this->actingAs($owner)->postJson($url, $payload)->assertCreated()->assertJsonCount(3, 'slots');
        $slots = $field->bookings()->orderBy('start_time')->get();
        $this->assertSame('23:00', $slots[0]->start_time->format('H:i'));
        $this->assertSame(now()->addDays(4)->toDateString().' 02:00', $slots[2]->end_time->format('Y-m-d H:i'));
        $this->postJson($url, $payload)->assertConflict();
        $this->assertDatabaseCount('bookings', 3);
    }

    public function test_peak_only_validates_window_rate_duration_and_past_start_before_creating_anything(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $url = '/api/turfs/'.$turf->id.'/slots';
        $this->actingAs($owner);
        foreach ([['peak_start' => null], ['peak_end' => '18:00'], ['peak_rate' => null], ['peak_rate' => -1], ['peak_pricing_mode' => 'day'],
            ['slot_duration' => 10], ['peak_only' => 'bad'], ['date' => now()->subDay()->toDateString()]] as $changes) {
            $this->postJson($url, $this->peakData($field, $changes))->assertUnprocessable();
            $this->assertDatabaseCount('bookings', 0);
        }
        $this->postJson($url, $this->peakData($field, ['peak_start' => '18:00', 'peak_end' => '18:30', 'slot_duration' => 60]))->assertUnprocessable();
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_owner_can_delete_selected_future_and_past_unused_slots_with_activity_and_no_side_effects(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $future = $this->slot($field);
        $past = $this->slot($field, 11, -3);
        $keep = $this->slot($field, 12);
        $this->actingAs($owner)->deleteJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id, 'slot_ids' => [$future->id, $past->id]])
            ->assertOk()->assertJsonPath('deleted_count', 2);
        $this->assertDatabaseMissing('bookings', ['id' => $future->id]);
        $this->assertDatabaseMissing('bookings', ['id' => $past->id]);
        $this->assertDatabaseHas('bookings', ['id' => $keep->id]);
        $this->assertSame(2, DB::table('activities')->where('action', 'Booking.deleted')->count());
        $this->assertDatabaseCount('wallet_entries', 0);
        $this->assertDatabaseCount('email_deliveries', 0);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonCount(1, 'slots');
        $this->postJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id, 'date' => $future->start_time->toDateString(),
            'start_time' => '10:00', 'end_time' => '11:00', 'slot_duration' => 60])->assertCreated();
    }

    public function test_booked_pending_completed_offline_and_history_slots_can_never_be_deleted_even_in_a_mixed_batch(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $free = $this->slot($field);
        $customer = $this->person();
        $this->actingAs($owner);
        foreach (['booked', 'pending', 'completed', 'cancelled', 'rejected', 'unavailable'] as $status) {
            $protected = $this->slot($field, 15);
            $protected->update(['status' => $status, 'user_id' => $status === 'unavailable' ? null : $customer->id,
                'unavailable_type' => $status === 'unavailable' ? 'offline_booking' : null, 'price' => 1000]);
            $this->deleteJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id, 'slot_ids' => [$free->id, $protected->id]])->assertConflict();
            $this->assertDatabaseHas('bookings', ['id' => $protected->id, 'status' => $status]);
            $this->assertDatabaseHas('bookings', ['id' => $free->id]);
        }
        $this->assertSame(0, DB::table('activities')->where('action', 'Booking.deleted')->count());
    }

    public function test_related_payments_decisions_and_cancellations_protect_inconsistent_available_rows(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $withWallet = $this->slot($field);
        $turf->walletEntries()->create(['booking_id' => $withWallet->id, 'type' => 'commission_charge', 'amount' => 10]);
        $withCancellation = $this->slot($field, 11);
        $withCancellation->cancellationRequest()->create(['requested_by' => $owner->id, 'reason' => 'Existing record']);
        $withRefund = $this->slot($field, 12);
        $withRefund->commissionRefund()->create(['turf_id' => $turf->id, 'amount' => 10, 'created_by' => $owner->id]);
        $withDecision = $this->slot($field, 13);
        $withDecision->update(['decided_at' => now()]);
        $withReference = $this->slot($field, 14);
        $withReference->update(['payment_reference' => 'PAST-REF']);
        $this->actingAs($owner);
        foreach ([$withWallet, $withCancellation, $withRefund, $withDecision, $withReference] as $slot) {
            $this->deleteJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id, 'slot_ids' => [$slot->id]])->assertConflict();
            $this->assertDatabaseHas('bookings', ['id' => $slot->id]);
        }
        $schedule = $this->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()->json('bookings');
        $this->assertTrue(collect($schedule)->every(fn ($slot) => $slot['can_delete'] === false));
    }

    public function test_deletion_is_owner_field_scoped_and_validates_each_id_atomically(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $slot = $this->slot($field);
        $url = '/api/turfs/'.$turf->id.'/slots';
        $data = ['field_id' => $field->id, 'slot_ids' => [$slot->id]];
        foreach (['user', 'turf', 'admin', 'superadmin'] as $role) {
            $this->actingAs($this->person($role))->deleteJson($url, $data)->assertForbidden();
        }
        $this->actingAs($owner);
        foreach ([[], ['slot_ids' => []], ['slot_ids' => [$slot->id, $slot->id]], ['slot_ids' => ['bad']], ['slot_ids' => range(1, 201)]] as $invalid) {
            $this->deleteJson($url, $invalid + ['field_id' => $field->id])->assertUnprocessable();
        }
        $other = $turf->fields()->create(['name' => 'Other', 'price_per_slot' => 100]);
        $foreignSlot = $this->slot($other);
        $this->deleteJson($url, ['field_id' => $field->id, 'slot_ids' => [$slot->id, $foreignSlot->id]])->assertNotFound();
        $this->deleteJson($url, ['field_id' => $field->id, 'slot_ids' => [$slot->id, 999999]])->assertNotFound();
        $this->assertDatabaseHas('bookings', ['id' => $slot->id]);
        $this->assertDatabaseHas('bookings', ['id' => $foreignSlot->id]);
    }

    public function test_schedule_exposes_delete_eligibility_and_request_after_selection_cannot_be_deleted(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $free = $this->slot($field);
        $past = $this->slot($field, 11, -2);
        $this->actingAs($owner)->getJson('/api/turfs/'.$turf->id.'/schedule?field_id='.$field->id)->assertOk()
            ->assertJsonPath('bookings.0.can_delete', true)->assertJsonPath('bookings.1.can_delete', true);
        $this->actingAs($this->person())->postJson('/api/bookings', ['turf_id' => $turf->id, 'field_id' => $field->id,
            'start_time' => $free->start_time->toIso8601String(), 'end_time' => $free->end_time->toIso8601String()])->assertCreated();
        $this->actingAs($owner)->deleteJson('/api/turfs/'.$turf->id.'/slots', ['field_id' => $field->id, 'slot_ids' => [$free->id, $past->id]])->assertConflict();
        $this->assertDatabaseHas('bookings', ['id' => $free->id, 'status' => 'pending']);
        $this->assertDatabaseHas('bookings', ['id' => $past->id, 'status' => 'available']);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonMissingPath('slots.0.can_delete');
    }
}
