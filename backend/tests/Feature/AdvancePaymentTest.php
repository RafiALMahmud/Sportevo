<?php

namespace Tests\Feature;

use App\Jobs\ExpireBookingAdvance;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use App\Models\WalletEntry;
use App\Services\AdvancePayment;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class AdvancePaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, SportSeeder::class]);
        Queue::fake();
        Mail::fake();
        $this->freezeTime();
    }

    private function person(string $role = 'user'): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id'), 'phone' => '01712345678']);
    }

    private function fixture(float $price = 1000, bool $enabled = true): array
    {
        $owner = $this->person('turf');
        $customer = $this->person();
        $turf = Turf::create(['name' => 'Advance arena', 'email' => 'arena@example.test', 'phone' => '01712345678',
            'location' => 'Bangladesh', 'turf_manager_id' => $owner->id, 'is_approved' => true, 'commission_rate' => 10,
            'advance_enabled' => $enabled, 'advance_amount' => 500, 'advance_window_minutes' => 60, 'payment_provider' => 'bKash', 'payment_number' => '01812345678']);
        $field = $turf->fields()->create(['name' => 'Football', 'price_per_slot' => $price]);
        $field->sports()->sync([Sport::first()->id]);
        $slot = $field->bookings()->create(['turf_id' => $turf->id, 'status' => 'available',
            'start_time' => now()->addDays(2)->setTime(12, 0), 'end_time' => now()->addDays(2)->setTime(13, 0)]);

        return [$owner, $customer, $turf, $field, $slot];
    }

    private function requestSlot(User $customer, Booking $slot)
    {
        return $this->actingAs($customer)->postJson('/api/bookings', ['turf_id' => $slot->turf_id, 'field_id' => $slot->field_id,
            'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()]);
    }

    private function accepted(float $price = 1000, bool $enabled = true): array
    {
        $fixture = $this->fixture($price, $enabled);
        [$owner, $customer, , , $slot] = $fixture;
        $this->requestSlot($customer, $slot)->assertCreated();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();

        return $fixture;
    }

    public function test_phone_is_required_for_signup_profile_and_legacy_customer_booking(): void
    {
        $payload = ['name' => 'Customer', 'email' => 'new@example.test', 'password' => 'password123', 'password_confirmation' => 'password123'];
        $this->postJson('/api/register', $payload)->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->postJson('/api/register', $payload + ['phone' => '01712345678'])->assertCreated();
        [, $customer, , , $slot] = $this->fixture();
        $customer->update(['phone' => null]);
        $this->requestSlot($customer, $slot)->assertUnprocessable();
        $this->patchJson('/api/profile', ['name' => 'Customer', 'phone' => ''])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->patchJson('/api/profile', ['name' => 'Customer', 'phone' => '01712345678'])->assertOk();
        $this->requestSlot($customer->fresh(), $slot)->assertCreated();
    }

    public function test_new_complex_requires_receiving_account_and_defaults_to_500_and_60_minutes(): void
    {
        $owner = $this->person('turf');
        $payload = ['name' => 'New complex', 'email' => $owner->email, 'location' => 'Bangladesh', 'price_per_slot' => 1000, 'sports' => [Sport::first()->id]];
        $this->actingAs($owner)->postJson('/api/turfs', $payload)->assertUnprocessable()->assertJsonValidationErrors(['payment_number', 'payment_provider']);
        $this->postJson('/api/turfs', $payload + ['payment_provider' => 'Nagad', 'payment_number' => '01912345678'])->assertCreated();
        $turf = $owner->turf()->firstOrFail();
        $this->assertTrue($turf->advance_enabled);
        $this->assertSame('500.00', $turf->advance_amount);
        $this->assertSame(60, $turf->advance_window_minutes);
        $this->assertNotSame('01912345678', DB::table('turfs')->where('id', $turf->id)->value('payment_number'));
        $this->assertArrayNotHasKey('payment_number', $turf->toArray());
    }

    public function test_settings_have_ownership_guards_minimum_window_and_admin_disable(): void
    {
        [$owner, $customer, $turf] = $this->fixture();
        $url = '/api/turfs/'.$turf->id.'/advance-settings';
        $this->actingAs($customer)->getJson($url)->assertForbidden();
        $this->actingAs($this->person('turf'))->putJson($url, ['advance_enabled' => false])->assertForbidden();
        $this->actingAs($owner)->putJson($url, ['advance_window_minutes' => 29])->assertUnprocessable();
        $this->putJson($url, ['advance_amount' => -5])->assertUnprocessable();
        $this->putJson($url, ['payment_number' => ''])->assertUnprocessable();
        $this->putJson($url, ['advance_window_minutes' => 30, 'payment_provider' => 'Other wallet', 'payment_number' => '01912345678'])
            ->assertOk()->assertJsonPath('settings.advance_window_minutes', 30)->assertJsonPath('settings.payment_provider', 'Other wallet');
        $this->actingAs($this->person('admin'))->putJson($url, ['advance_enabled' => false])->assertOk()->assertJsonPath('settings.advance_enabled', false);
    }

    public function test_acceptance_starts_deadline_queues_expiry_and_does_not_charge_commission(): void
    {
        [$owner, , $turf, , $slot] = $this->accepted();
        $slot->refresh();
        $this->assertSame('awaiting_payment', $slot->advance_status);
        $this->assertSame(now()->addHour()->timestamp, $slot->advance_due_at->timestamp);
        $this->assertNull($slot->commission_amount);
        $this->assertSame(0.0, $turf->walletBalance());
        Queue::assertPushed(ExpireBookingAdvance::class, fn ($job) => $job->bookingId === $slot->id && $job->delay->timestamp === $slot->advance_due_at->timestamp);
        $this->actingAs($owner)->getJson('/api/turfs/'.$turf->id.'/advance-bookings')->assertOk()->assertJsonPath('data.0.id', $slot->id)->assertJsonPath('data.0.user.phone', '01712345678');
    }

    public function test_occupied_slots_remain_visible_without_leaking_customer_or_payment_data(): void
    {
        [$owner, $customer, $turf, $field, $slot] = $this->fixture();
        $this->requestSlot($customer, $slot)->assertCreated();
        $url = '/api/turfs/'.$turf->id.'/slots?field_id='.$field->id;
        $this->getJson($url)->assertOk()->assertJsonPath('slots.0.display_status', 'in_process')->assertJsonPath('slots.0.can_request', false);
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();
        $this->postJson('/api/bookings/'.$slot->id.'/advance/confirm')->assertOk();
        $data = $this->getJson($url)->assertOk()->assertJsonPath('slots.0.display_status', 'already_booked')->assertJsonCount(1, 'slots')->json('slots.0');
        foreach (['user', 'user_id', 'payment_reference', 'payment_number', 'payment_note', 'commission_amount'] as $key) {
            $this->assertArrayNotHasKey($key, $data);
        }
        $this->getJson('/api/turfs/'.$turf->id)->assertOk()->assertJsonMissingPath('turf.payment_number');
    }

    public function test_only_the_customer_can_submit_a_reference_after_acceptance_and_before_deadline(): void
    {
        [$owner, $customer, , , $slot] = $this->fixture();
        $url = '/api/bookings/'.$slot->id.'/advance/reference';
        $this->requestSlot($customer, $slot)->assertCreated();
        $this->postJson($url, ['reference' => 'ABC123'])->assertConflict();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();
        $this->actingAs($this->person())->postJson($url, ['reference' => 'ABC123'])->assertForbidden();
        $this->actingAs($customer)->postJson($url, ['reference' => '   '])->assertUnprocessable();
        $this->postJson($url, ['reference' => 'Sender reference name'])->assertOk()->assertJsonPath('booking.advance_status', 'submitted');
        $this->assertNotSame('Sender reference name', DB::table('bookings')->where('id', $slot->id)->value('payment_reference'));
        $this->assertNotSame('01812345678', DB::table('bookings')->where('id', $slot->id)->value('payment_number'));
    }

    public function test_timely_reference_holds_beyond_deadline_and_owner_confirmation_charges_once(): void
    {
        [$owner, $customer, $turf, , $slot] = $this->accepted();
        $this->travel(59)->minutes();
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/advance/reference', ['reference' => 'TXN123'])->assertOk();
        $this->travel(2)->hours();
        $this->assertFalse(app(AdvancePayment::class)->expire($slot->id));
        $url = '/api/bookings/'.$slot->id.'/advance/confirm';
        $this->actingAs($owner)->postJson($url)->assertOk()->assertJsonPath('booking.advance_status', 'confirmed')->assertJsonPath('booking.commission_amount', '100.00');
        $this->postJson($url)->assertConflict();
        $this->assertSame(1, WalletEntry::where('booking_id', $slot->id)->count());
        $this->assertSame(100.0, $turf->walletBalance());
    }

    public function test_unsubmitted_advance_expires_without_debt_and_job_is_idempotent(): void
    {
        [, $customer, $turf, $field, $slot] = $this->accepted();
        $this->travel(60)->minutes();
        (new ExpireBookingAdvance($slot->id))->handle(app(AdvancePayment::class));
        $this->assertSame('cancelled', $slot->fresh()->status);
        $this->assertSame('expired', $slot->fresh()->advance_status);
        $this->assertSame(0.0, $turf->walletBalance());
        $this->assertSame(1, Booking::where('field_id', $field->id)->where('status', 'available')->count());
        (new ExpireBookingAdvance($slot->id))->handle(app(AdvancePayment::class));
        $this->assertSame(1, Booking::where('field_id', $field->id)->where('status', 'available')->count());
        $newSlot = Booking::where('field_id', $field->id)->where('status', 'available')->firstOrFail();
        $this->requestSlot($customer, $newSlot)->assertCreated();
    }

    public function test_expired_deadline_cannot_be_bypassed_by_reference_confirmation_or_waiver(): void
    {
        [$owner, $customer, , , $slot] = $this->accepted();
        $this->travel(60)->minutes();
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/advance/reference', ['reference' => 'Late payment'])->assertConflict();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/advance/confirm')->assertConflict();
        $this->postJson('/api/bookings/'.$slot->id.'/advance/waive')->assertConflict();
        $this->assertSame(0, WalletEntry::where('booking_id', $slot->id)->count());
    }

    public function test_direct_receipt_confirmation_works_without_a_customer_reference(): void
    {
        [$owner, , , , $slot] = $this->accepted();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/advance/confirm', ['note' => 'Receipt checked after customer phone call'])
            ->assertOk()->assertJsonPath('booking.payment_reference', null)->assertJsonPath('booking.advance_status', 'confirmed');
        $this->assertSame($owner->id, $slot->fresh()->payment_confirmed_by);
        $this->assertNotSame('Receipt checked after customer phone call', DB::table('bookings')->where('id', $slot->id)->value('payment_note'));
    }

    public function test_other_customers_and_owners_cannot_confirm_payments_or_read_private_inbox(): void
    {
        [, $customer, $turf, , $slot] = $this->accepted();
        $confirm = '/api/bookings/'.$slot->id.'/advance/confirm';
        $this->actingAs($customer)->postJson($confirm)->assertForbidden();
        $this->actingAs($this->person('turf'))->postJson($confirm)->assertForbidden();
        $this->getJson('/api/turfs/'.$turf->id.'/advance-bookings')->assertForbidden();
        $this->actingAs($this->person('admin'))->postJson($confirm)->assertOk();
    }

    public function test_missing_receiving_number_blocks_enabling_and_existing_requests_keep_snapshot(): void
    {
        [$owner, $customer, $turf, , $slot] = $this->fixture();
        $turf->update(['advance_enabled' => false, 'payment_number' => null]);
        $this->actingAs($owner)->putJson('/api/turfs/'.$turf->id.'/advance-settings', ['advance_enabled' => true])->assertUnprocessable();
        $this->requestSlot($customer, $slot)->assertCreated()->assertJsonPath('booking.advance_required', false);
        $this->actingAs($owner)->putJson('/api/turfs/'.$turf->id.'/advance-settings', ['advance_enabled' => true, 'payment_number' => '01812345678'])->assertOk();
        $this->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk()->assertJsonPath('booking.advance_required', false);
        $this->assertSame('100.00', $slot->fresh()->commission_amount);
    }

    public function test_unverified_payment_cannot_be_completed_or_used_to_review_a_complex(): void
    {
        [$owner, $customer, $turf, , $slot] = $this->accepted();
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/advance/reference', ['reference' => 'Pending receipt'])->assertOk();
        $this->travel(3)->days();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/complete')->assertUnprocessable();
        $review = ['booking_id' => $slot->id, 'rating' => 5, 'comment' => 'Played here'];
        $this->actingAs($customer)->postJson('/api/turfs/'.$turf->id.'/reviews', $review)->assertUnprocessable();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/advance/confirm')->assertOk();
        $this->postJson('/api/bookings/'.$slot->id.'/complete')->assertOk();
        $this->actingAs($customer)->postJson('/api/turfs/'.$turf->id.'/reviews', $review)->assertCreated();
    }

    public function test_reference_rejection_allows_correction_only_before_original_deadline(): void
    {
        [$owner, $customer, , , $slot] = $this->accepted();
        $due = $slot->fresh()->advance_due_at;
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/advance/reference', ['reference' => 'wrong'])->assertOk();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/advance/reject', ['reason' => 'Check the transaction ID'])->assertOk();
        $this->assertTrue($slot->fresh()->advance_due_at->equalTo($due));
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/advance/reference', ['reference' => 'corrected'])->assertOk();
        $this->travel(61)->minutes();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/advance/reject', ['reason' => 'Payment not found'])->assertOk();
        $this->assertSame('expired', $slot->fresh()->advance_status);
        $this->assertSame('cancelled', $slot->fresh()->status);
    }

    public function test_settings_changes_do_not_rewrite_snapshots_and_admin_can_waive_a_hold(): void
    {
        [$owner, , $turf, $field, $slot] = $this->accepted();
        $this->actingAs($owner)->putJson('/api/turfs/'.$turf->id.'/advance-settings', ['advance_amount' => 900, 'advance_window_minutes' => 30, 'advance_enabled' => false, 'payment_provider' => 'Nagad', 'payment_number' => '01912345678'])->assertOk();
        $field->update(['price_per_slot' => 2000]);
        $this->assertSame('500.00', $slot->fresh()->advance_amount);
        $this->assertSame('bKash', $slot->fresh()->payment_provider);
        $this->assertSame('1000.00', $slot->fresh()->price);
        $this->actingAs($this->person('admin'))->postJson('/api/bookings/'.$slot->id.'/advance/waive')->assertOk();
        $this->assertSame('waived', $slot->fresh()->advance_status);
        $this->assertSame('100.00', $slot->fresh()->commission_amount);
    }

    public function test_small_and_zero_prices_never_require_more_than_the_booking_price(): void
    {
        [, , , , $small] = $this->accepted(200);
        $this->assertSame('200.00', $small->fresh()->advance_amount);
        [, , , , $free] = $this->accepted(0);
        $this->assertFalse($free->fresh()->advance_required);
        $this->assertSame('not_required', $free->fresh()->advance_status);
        $this->assertSame('0.00', $free->fresh()->commission_amount);
    }

    public function test_unpaid_hold_can_be_cancelled_without_commission_but_submitted_receipt_needs_owner_decision(): void
    {
        [, $customer, , , $slot] = $this->accepted();
        $this->actingAs($customer)->postJson('/api/bookings/'.$slot->id.'/cancel')->assertOk();
        $this->assertSame('cancelled', $slot->fresh()->status);
        $this->assertSame(0, WalletEntry::where('booking_id', $slot->id)->count());
        [$owner, $payer, , , $paid] = $this->accepted();
        $this->actingAs($payer)->postJson('/api/bookings/'.$paid->id.'/advance/reference', ['reference' => 'TXN789'])->assertOk();
        $response = $this->postJson('/api/bookings/'.$paid->id.'/cancel')->assertOk();
        $this->assertSame('booked', $paid->fresh()->status);
        $this->actingAs($owner)->postJson('/api/bookings/'.$paid->id.'/advance/reject', ['reason' => 'Payment not found'])->assertConflict();
        $this->actingAs($owner)->postJson('/api/cancellations/'.$response->json('cancellation.id').'/decision', ['decision' => 'accepted'])
            ->assertOk();
        $this->assertSame('not_eligible', $paid->fresh()->cancellationRequest->refund_status);
    }

    public function test_public_read_releases_due_holds_when_worker_has_not_run_and_command_also_sweeps(): void
    {
        [, , $turf, $field, $slot] = $this->accepted();
        $this->travel(61)->minutes();
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()
            ->assertJsonCount(1, 'slots')->assertJsonPath('slots.0.display_status', 'available')->assertJsonPath('slots.0.can_request', true);
        $this->assertSame('expired', $slot->fresh()->advance_status);
        [, , , , $second] = $this->accepted();
        $this->travel(61)->minutes();
        $this->artisan('bookings:expire-advances')->assertSuccessful();
        $this->assertSame('expired', $second->fresh()->advance_status);
    }

    public function test_legacy_disabled_advance_keeps_immediate_confirmation_and_commission_behavior(): void
    {
        [, , $turf, , $slot] = $this->accepted(1000, false);
        $this->assertFalse($slot->fresh()->advance_required);
        $this->assertNull($slot->fresh()->advance_due_at);
        $this->assertSame('100.00', $slot->fresh()->commission_amount);
        $this->assertSame(100.0, $turf->walletBalance());
    }
}
