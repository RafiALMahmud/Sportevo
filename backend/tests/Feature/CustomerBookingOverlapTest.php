<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CustomerBookingOverlapTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Queue::fake();
    }

    private function customer(): User
    {
        return User::factory()->create(['role_id' => Role::where('name', 'user')->value('id')]);
    }

    private function slot(string $start, string $end, string $status = 'available', ?User $customer = null): Booking
    {
        $owner = User::factory()->create(['role_id' => Role::where('name', 'turf')->value('id')]);
        $turf = Turf::create(['name' => 'Overlap test', 'location' => 'Bangladesh', 'email' => $owner->email,
            'turf_manager_id' => $owner->id, 'is_approved' => true, 'price_per_slot' => 100, 'commission_rate' => 10]);
        $field = $turf->fields()->create(['name' => 'Test field', 'price_per_slot' => 100]);

        return Booking::create(['turf_id' => $turf->id, 'field_id' => $field->id, 'user_id' => $customer?->id,
            'start_time' => $start, 'end_time' => $end, 'status' => $status, 'price' => 100, 'commission_rate' => 10]);
    }

    private function requestSlot(Booking $slot)
    {
        return $this->postJson('/api/bookings', ['turf_id' => $slot->turf_id, 'field_id' => $slot->field_id,
            'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()]);
    }

    public function test_pending_and_accepted_bookings_block_all_kinds_of_overlap_across_complexes(): void
    {
        $this->travelTo(now()->startOfDay());
        $customer = $this->customer();
        $date = now()->addDays(2)->toDateString();
        $existing = $this->slot("$date 10:00", "$date 11:00", 'pending', $customer);
        $this->actingAs($customer);

        foreach (['pending', 'booked'] as $status) {
            $existing->update(['status' => $status]);
            foreach ([['10:00', '11:00'], ['09:30', '10:30'], ['10:30', '11:30'], ['09:00', '12:00'], ['10:15', '10:45']] as [$start, $end]) {
                $target = $this->slot("$date $start", "$date $end");
                $this->requestSlot($target)->assertStatus(409)->assertJsonPath('message', 'You already have a pending request or accepted booking during this time. Wait for the pending request to be rejected or cancel it before requesting another overlapping slot.');
                $this->assertSame('available', $target->fresh()->status);
                $this->assertNull($target->fresh()->user_id);
            }
        }
        Queue::assertNothingPushed();
    }

    public function test_rejection_releases_the_customer_time_for_another_request(): void
    {
        $customer = $this->customer();
        $date = now()->addDays(2)->toDateString();
        $existing = $this->slot("$date 10:00", "$date 11:00", 'pending', $customer);
        $target = $this->slot("$date 10:00", "$date 11:00");
        $this->actingAs($customer);
        $this->requestSlot($target)->assertStatus(409);
        $this->actingAs($existing->turf->manager)->postJson('/api/bookings/'.$existing->id.'/reject')->assertOk();
        $this->actingAs($customer);
        $this->requestSlot($target)->assertCreated();
        $this->assertSame('pending', $target->fresh()->status);
    }

    public function test_cancelled_rejected_and_completed_history_does_not_block_time(): void
    {
        $date = now()->addDays(2)->toDateString();
        foreach (['rejected', 'cancelled', 'completed'] as $status) {
            $customer = $this->customer();
            $this->slot("$date 10:00", "$date 11:00", $status, $customer);
            $target = $this->slot("$date 10:15", "$date 11:15");
            $this->actingAs($customer);
            $this->requestSlot($target)->assertCreated();
        }
    }

    public function test_adjacent_slots_and_other_dates_remain_available(): void
    {
        $customer = $this->customer();
        $date = now()->addDays(2)->toDateString();
        $otherDate = now()->addDays(3)->toDateString();
        $this->slot("$date 10:00", "$date 11:00", 'pending', $customer);
        $this->actingAs($customer);
        foreach ([["$date 09:00", "$date 10:00"], ["$date 11:00", "$date 12:00"], ["$otherDate 10:00", "$otherDate 11:00"]] as [$start, $end]) {
            $this->requestSlot($this->slot($start, $end))->assertCreated();
        }
    }

    public function test_other_customers_do_not_block_each_other_on_different_fields(): void
    {
        $date = now()->addDays(2)->toDateString();
        $this->slot("$date 10:00", "$date 11:00", 'pending', $this->customer());
        $this->actingAs($this->customer());
        $this->requestSlot($this->slot("$date 10:00", "$date 11:00"))->assertCreated();
    }

    public function test_overlaps_across_midnight_are_blocked(): void
    {
        $customer = $this->customer();
        $date = now()->addDays(2)->toDateString();
        $nextDate = now()->addDays(3)->toDateString();
        $this->slot("$date 23:30", "$nextDate 00:30", 'pending', $customer);
        $this->actingAs($customer);
        $this->requestSlot($this->slot("$nextDate 00:00", "$nextDate 01:00"))->assertStatus(409);
    }
}
