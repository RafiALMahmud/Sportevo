<?php

namespace Tests\Feature;

use App\Jobs\SendTrackedEmail;
use App\Models\Activity;
use App\Models\Booking;
use App\Models\CancellationRequest;
use App\Models\EmailDelivery;
use App\Models\Field;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\TurfDeletionRequest;
use App\Models\User;
use App\Models\WalletEntry;
use Database\Seeders\DemoSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ComplexWorkflowTest extends TestCase
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

    private function complex(?User $owner = null, float $rate = 10): Turf
    {
        $owner ??= $this->person('turf');

        return Turf::create(['name' => 'Sports Complex A', 'email' => $owner->email, 'phone' => '01700000000',
            'location' => 'Dhaka', 'turf_manager_id' => $owner->id, 'is_approved' => true,
            'price_per_slot' => 100, 'commission_rate' => $rate]);
    }

    private function field(Turf $turf, string $name = 'Football', float $price = 100): Field
    {
        $field = $turf->fields()->create(['name' => $name, 'price_per_slot' => $price]);
        $field->sports()->sync([Sport::first()->id]);

        return $field;
    }

    private function slot(Field $field, string $status = 'available', ?User $user = null): Booking
    {
        return Booking::create(['turf_id' => $field->turf_id, 'field_id' => $field->id, 'user_id' => $user?->id,
            'start_time' => now()->addDays(2)->setTime(11, 0), 'end_time' => now()->addDays(2)->setTime(12, 0),
            'status' => $status, 'price' => $status === 'available' ? null : $field->price_per_slot,
            'commission_rate' => 10, 'commission_amount' => $status === 'booked' ? 10 : null]);
    }

    private function requestSlot(User $user, Booking $slot)
    {
        return $this->actingAs($user)->postJson('/api/bookings', ['turf_id' => $slot->turf_id, 'field_id' => $slot->field_id,
            'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()]);
    }

    private function acceptedBooking(): array
    {
        $owner = $this->person('turf');
        $user = $this->person();
        $turf = $this->complex($owner);
        $slot = $this->slot($this->field($turf));
        $this->requestSlot($user, $slot)->assertCreated();
        $this->actingAs($owner)->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk();

        return [$owner, $user, $turf, $slot->fresh()];
    }

    public function test_owner_can_block_and_reopen_slots_for_phone_offline_and_maintenance_without_commission(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $football = $this->field($turf);
        $cricket = $this->field($turf, 'Cricket');
        $slot = $this->slot($football);
        $otherSlot = $this->slot($cricket);
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        foreach (['Phone booking', 'Offline booking', 'Maintenance work'] as $reason) {
            $this->actingAs($owner)->patchJson($url, ['available' => false, 'reason' => $reason])
                ->assertOk()->assertJsonPath('booking.status', 'unavailable')
                ->assertJsonPath('booking.unavailable_reason', $reason)
                ->assertJsonPath('booking.unavailable_by', $owner->id);
            $this->assertNotNull($slot->fresh()->unavailable_at);
            $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$football->id)->assertOk()->assertJsonCount(1, 'slots')->assertJsonPath('slots.0.status', 'unavailable')->assertJsonPath('slots.0.can_request', false);
            $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$cricket->id)->assertOk()->assertJsonPath('slots.0.id', $otherSlot->id);
            $this->requestSlot($this->person(), $slot)->assertStatus(409);
            $this->actingAs($owner)->patchJson($url, ['available' => true])->assertOk()
                ->assertJsonPath('booking.status', 'available')->assertJsonPath('booking.unavailable_reason', null);
            $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$football->id)->assertOk()->assertJsonPath('slots.0.id', $slot->id);
            $this->assertDatabaseHas('activities', ['action' => 'Booking.updated']);
            $logged = Activity::where('action', 'Booking.updated')->latest('id')->first();
            $this->assertSame($reason, $logged->details['before']['unavailable_reason']);
            $this->assertSame('available', $logged->details['after']['status']);
        }
        $this->assertDatabaseCount('wallet_entries', 0);
        $this->assertDatabaseCount('email_deliveries', 0);
        $this->assertSame(0.0, $turf->walletBalance());
        $this->requestSlot($this->person(), $slot)->assertCreated();
    }

    public function test_blocked_slots_prevent_overlapping_generation_but_not_other_fields(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $slot = $this->slot($field);
        $this->actingAs($owner)->patchJson('/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability',
            ['available' => false, 'reason' => 'Maintenance'])->assertOk();
        $payload = ['field_id' => $field->id, 'date' => $slot->start_time->toDateString(),
            'start_time' => '10:30', 'end_time' => '12:30', 'slot_duration' => 60];
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertStatus(409);
        $this->assertDatabaseCount('bookings', 1);
        $payload['field_id'] = $this->field($turf, 'Cricket')->id;
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated();
        $this->assertSame('unavailable', $slot->fresh()->status);
    }

    public function test_only_actual_owner_can_change_availability_and_slots_must_belong_to_complex(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $slot = $this->slot($this->field($turf));
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $payload = ['available' => false, 'reason' => 'Offline booking'];
        foreach (['user', 'turf', 'admin', 'superadmin'] as $role) {
            $this->actingAs($this->person($role))->patchJson($url, $payload)->assertForbidden();
        }
        $otherSlot = $this->slot($this->field($this->complex()));
        $this->actingAs($owner)->patchJson('/api/turfs/'.$turf->id.'/slots/'.$otherSlot->id.'/availability', $payload)->assertNotFound();
        $this->assertSame('available', $slot->fresh()->status);
        $this->assertSame('available', $otherSlot->fresh()->status);
    }

    public function test_availability_controls_cannot_overwrite_online_requests_or_booking_history(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $customer = $this->person();
        foreach (['pending', 'booked', 'completed', 'rejected', 'cancelled'] as $status) {
            $slot = $this->slot($field, $status, $customer);
            $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
            $this->actingAs($owner)->patchJson($url, ['available' => false, 'reason' => 'Maintenance'])->assertStatus(409);
            $this->patchJson($url, ['available' => true])->assertStatus(409);
            $this->assertSame($status, $slot->fresh()->status);
            $this->assertSame($customer->id, $slot->fresh()->user_id);
        }
    }

    public function test_slot_availability_validates_reason_and_disallows_past_or_stale_changes(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $slot = $this->slot($this->field($turf));
        $url = '/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability';
        $this->actingAs($owner)->patchJson($url, ['available' => false])->assertUnprocessable();
        $this->patchJson($url, ['available' => false, 'reason' => '   '])->assertUnprocessable();
        $this->patchJson($url, ['available' => false, 'reason' => str_repeat('x', 501)])->assertUnprocessable();
        $this->patchJson($url, ['available' => 'invalid', 'reason' => 'Offline'])->assertUnprocessable();
        $this->patchJson($url, ['available' => true])->assertStatus(409);
        $this->patchJson($url, ['available' => false, 'reason' => 'Phone booking'])->assertOk();
        $this->patchJson($url, ['available' => false, 'reason' => 'Replacement note'])->assertStatus(409);
        $this->assertSame('Phone booking', $slot->fresh()->unavailable_reason);
        $slot->update(['start_time' => now()->subHours(2), 'end_time' => now()->subHour()]);
        $this->patchJson($url, ['available' => true])->assertUnprocessable();
        $this->assertSame('unavailable', $slot->fresh()->status);
    }

    public function test_legacy_overlaps_with_blocked_slots_are_not_advertised_requested_or_accepted(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $blocked = $this->slot($field);
        $blocked->update(['status' => 'unavailable', 'unavailable_reason' => 'Maintenance']);
        $staleOpen = $this->slot($field);
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertOk()->assertJsonCount(1, 'slots')->assertJsonPath('slots.0.status', 'unavailable')->assertJsonPath('slots.0.can_request', false);
        $this->requestSlot($this->person(), $staleOpen)->assertStatus(409);
        $stalePending = $this->slot($field, 'pending', $this->person());
        $this->actingAs($owner)->postJson('/api/bookings/'.$stalePending->id.'/accept')->assertStatus(409);
        $this->patchJson('/api/turfs/'.$turf->id.'/slots/'.$blocked->id.'/availability', ['available' => true])->assertStatus(409);
        $this->assertSame('unavailable', $blocked->fresh()->status);
        $this->assertDatabaseCount('wallet_entries', 0);
    }

    public function test_admin_can_filter_unavailable_slots_and_see_owner_block_reason(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $slot = $this->slot($this->field($turf));
        $this->actingAs($owner)->patchJson('/api/turfs/'.$turf->id.'/slots/'.$slot->id.'/availability',
            ['available' => false, 'reason' => 'Pitch maintenance'])->assertOk();
        $this->actingAs($this->person('admin'))->getJson('/api/admin/slots?status=unavailable')->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.unavailable_reason', 'Pitch maintenance');
    }

    public function test_registration_creates_one_default_field_and_owner_cannot_create_second_complex(): void
    {
        $owner = $this->person('turf');
        $payload = ['name' => 'Sports A', 'email' => 'arena@example.test', 'location' => 'Dhaka',
            'payment_provider' => 'bKash', 'payment_number' => '01712345678',
            'field_name' => 'Football field', 'price_per_slot' => 250, 'sports' => [Sport::first()->id]];
        $this->actingAs($owner)->postJson('/api/turfs', $payload)->assertCreated()
            ->assertJsonPath('turf.fields.0.name', 'Football field')
            ->assertJsonPath('turf.commission_rate', '10.00');
        $this->assertDatabaseCount('fields', 1);
        $this->postJson('/api/turfs', $payload)->assertStatus(409);
        $this->assertDatabaseCount('turfs', 1);
    }

    public function test_each_field_has_its_own_price_sports_photos_and_bookings(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $football = $this->field($turf);
        $response = $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/fields',
            ['name' => 'Cricket', 'price_per_slot' => 300, 'sports' => [Sport::where('slug', 'cricket')->value('id')]])->assertCreated();
        $cricket = Field::findOrFail($response->json('field.id'));
        $user = $this->person();
        $a = $this->slot($football);
        $b = $this->slot($cricket);
        $this->requestSlot($user, $a)->assertCreated()->assertJsonPath('booking.price', '100.00');
        $this->requestSlot($this->person(), $b)->assertCreated()->assertJsonPath('booking.price', '300.00');
        $this->actingAs($owner)->postJson('/api/bookings/'.$a->id.'/accept')->assertOk();
        $this->postJson('/api/bookings/'.$b->id.'/accept')->assertOk();
        $this->assertSame(40.0, $turf->walletBalance());
        $this->assertDatabaseCount('wallet_entries', 2);
        $this->postJson('/api/bookings/'.$a->id.'/accept')->assertStatus(422);
        $this->assertDatabaseCount('wallet_entries', 2);

        Storage::fake('public');
        $this->post('/api/turfs/'.$turf->id.'/photos', ['field_id' => $football->id,
            'photos' => [UploadedFile::fake()->image('football.jpg')]], ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame(1, $football->photos()->count());
        $this->assertSame(0, $cricket->photos()->count());
        Storage::disk('public')->assertExists($football->photos()->first()->path);
    }

    public function test_slot_generation_rejects_any_overlap_without_creating_partial_slots(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $slot = $this->slot($field);
        $payload = ['field_id' => $field->id, 'date' => $slot->start_time->toDateString(), 'start_time' => '10:30', 'end_time' => '12:30', 'slot_duration' => 60];
        foreach (['available', 'pending', 'booked'] as $status) {
            $slot->update(['status' => $status]);
            $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertStatus(409);
            $this->assertDatabaseCount('bookings', 1);
            $this->assertSame($status, $slot->fresh()->status);
        }
        $payload['start_time'] = '12:00';
        $payload['end_time'] = '13:00';
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated();
        $other = $this->field($turf, 'Cricket');
        $payload['field_id'] = $other->id;
        $payload['start_time'] = '11:00';
        $payload['end_time'] = '12:00';
        $this->postJson('/api/turfs/'.$turf->id.'/slots', $payload)->assertCreated();
    }

    public function test_pending_contacts_are_hidden_then_revealed_only_after_acceptance(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $user = $this->person();
        $slot = $this->slot($this->field($turf));
        $this->requestSlot($user, $slot)->assertCreated();
        $response = $this->actingAs($owner)->getJson('/api/dashboard/turf')->assertOk();
        $this->assertArrayNotHasKey('user', $response->json('requests.0'));
        $this->assertArrayNotHasKey('user_id', $response->json('requests.0'));
        $this->assertStringNotContainsString($user->email, $response->getContent());
        $this->getJson('/api/turfs/'.$turf->id.'/schedule')->assertOk()->assertJsonMissing(['email' => $user->email]);
        $this->postJson('/api/bookings/'.$slot->id.'/accept')->assertOk()->assertJsonPath('booking.user.email', $user->email);
        $this->getJson('/api/dashboard/turf')->assertJsonPath('upcoming.0.user.email', $user->email);
    }

    public function test_fields_and_owner_dashboard_are_protected_from_other_owners_and_admins(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $payload = ['name' => 'Changed', 'price_per_slot' => 20, 'sports' => [Sport::first()->id]];
        $this->actingAs($this->person('turf'))->putJson('/api/turfs/'.$turf->id.'/fields/'.$field->id, $payload)->assertForbidden();
        foreach (['admin', 'superadmin'] as $role) {
            $this->actingAs($this->person($role))->getJson('/api/dashboard/turf')->assertForbidden();
            $this->getJson('/api/my-turf')->assertForbidden();
            $this->postJson('/api/turfs/'.$turf->id.'/fields', $payload)->assertForbidden();
        }
    }

    public function test_booking_cannot_target_another_complex_field_or_an_ungenerated_time(): void
    {
        $turf = $this->complex();
        $field = $this->field($turf);
        $otherField = $this->field($this->complex());
        $slot = $this->slot($field);
        $payload = ['turf_id' => $turf->id, 'field_id' => $otherField->id, 'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()];
        $this->actingAs($this->person())->postJson('/api/bookings', $payload)->assertNotFound();
        $payload['field_id'] = $field->id;
        $payload['start_time'] = $slot->start_time->copy()->addMinutes(15)->toIso8601String();
        $payload['end_time'] = $slot->end_time->copy()->addMinutes(15)->toIso8601String();
        $this->postJson('/api/bookings', $payload)->assertStatus(409);
    }

    public function test_quotes_are_preserved_and_zero_commission_is_allowed(): void
    {
        $owner = $this->person('turf');
        $admin = $this->person('admin');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $a = $this->slot($field);
        $this->requestSlot($this->person(), $a)->assertCreated();
        $this->actingAs($owner)->putJson('/api/turfs/'.$turf->id.'/fields/'.$field->id, ['name' => 'Football', 'price_per_slot' => 200, 'sports' => [Sport::first()->id]])->assertOk();
        $this->actingAs($admin)->putJson('/api/admin/turfs/'.$turf->id.'/commission', ['commission_rate' => 0])->assertOk();
        $this->postJson('/api/admin/slots/'.$a->id.'/accept')->assertOk()->assertJsonPath('booking.price', '100.00')->assertJsonPath('booking.commission_amount', '10.00');
        $b = $this->slot($this->field($turf, 'Cricket', 500));
        $user = $this->person();
        $this->requestSlot($user, $b)->assertCreated()->assertJsonPath('booking.commission_rate', '0.00');
        $this->actingAs($owner)->postJson('/api/bookings/'.$b->id.'/accept')->assertOk()->assertJsonPath('booking.commission_amount', '0.00')->assertJsonPath('booking.user.email', $user->email);
        $this->assertSame(10.0, $turf->walletBalance());
    }

    public function test_cancellation_requires_owner_then_admin_and_reverses_commission_once(): void
    {
        [$owner, $user, $turf, $booking] = $this->acceptedBooking();
        $admin = $this->person('admin');
        $this->actingAs($user)->postJson('/api/bookings/'.$booking->id.'/cancel', ['reason' => 'Plans changed'])->assertOk();
        $cancellation = CancellationRequest::firstOrFail();
        $this->assertSame('booked', $booking->fresh()->status);
        $this->assertSame(10.0, $turf->walletBalance());
        $this->actingAs($admin)->getJson('/api/admin/cancellations')->assertOk()->assertJsonPath('data.0.owner_status', 'pending');
        $this->postJson('/api/admin/cancellations/'.$cancellation->id.'/refund', ['decision' => 'accepted'])->assertStatus(422);
        $this->actingAs($this->person('turf'))->postJson('/api/cancellations/'.$cancellation->id.'/decision', ['decision' => 'accepted'])->assertForbidden();
        $this->actingAs($owner)->postJson('/api/cancellations/'.$cancellation->id.'/decision', ['decision' => 'accepted'])->assertOk();
        $this->assertSame('cancelled', $booking->fresh()->status);
        $this->assertSame(10.0, $turf->walletBalance());
        $this->assertDatabaseHas('bookings', ['field_id' => $booking->field_id, 'status' => 'available']);
        $this->postJson('/api/admin/cancellations/'.$cancellation->id.'/refund', ['decision' => 'accepted'])->assertForbidden();
        $this->actingAs($admin)->postJson('/api/admin/cancellations/'.$cancellation->id.'/refund', ['decision' => 'accepted'])->assertOk();
        $this->assertSame(0.0, $turf->walletBalance());
        $this->postJson('/api/admin/cancellations/'.$cancellation->id.'/refund', ['decision' => 'accepted'])->assertStatus(422);
        $this->assertDatabaseCount('commission_refunds', 1);
    }

    public function test_rejected_cancellation_keeps_booking_and_rejected_refund_keeps_debt(): void
    {
        [$owner, $user, $turf, $booking] = $this->acceptedBooking();
        $this->actingAs($user)->postJson('/api/bookings/'.$booking->id.'/cancel')->assertOk();
        $id = CancellationRequest::first()->id;
        $this->actingAs($owner)->postJson('/api/cancellations/'.$id.'/decision', ['decision' => 'rejected'])->assertOk();
        $this->assertSame('booked', $booking->fresh()->status);
        $this->assertSame(10.0, $turf->walletBalance());
        $this->actingAs($user)->postJson('/api/bookings/'.$booking->id.'/cancel')->assertOk();
        $this->actingAs($owner)->postJson('/api/cancellations/'.$id.'/decision', ['decision' => 'accepted'])->assertOk();
        $this->actingAs($this->person('superadmin'))->postJson('/api/admin/cancellations/'.$id.'/refund', ['decision' => 'rejected'])->assertOk();
        $this->assertSame(10.0, $turf->walletBalance());
        $this->assertDatabaseCount('commission_refunds', 0);
    }

    public function test_pending_request_cancellation_is_immediate_and_has_no_commission(): void
    {
        $turf = $this->complex();
        $slot = $this->slot($this->field($turf));
        $user = $this->person();
        $this->requestSlot($user, $slot)->assertCreated();
        $this->postJson('/api/bookings/'.$slot->id.'/cancel')->assertOk();
        $this->assertSame('cancelled', $slot->fresh()->status);
        $this->assertDatabaseCount('wallet_entries', 0);
        $this->assertDatabaseCount('cancellation_requests', 0);
    }

    public function test_only_admin_deletes_complex_and_history_and_wallet_survive(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $admin = $this->person('admin');
        WalletEntry::create(['turf_id' => $turf->id, 'type' => 'commission_charge', 'amount' => 10]);
        $this->actingAs($owner)->deleteJson('/api/admin/turfs/'.$turf->id)->assertForbidden();
        $this->deleteJson('/api/profile')->assertStatus(409);
        $this->postJson('/api/turfs/'.$turf->id.'/deletion-request', ['reason' => 'Closing permanently'])->assertCreated();
        $request = TurfDeletionRequest::first();
        $this->actingAs($admin)->getJson('/api/admin/deletion-requests')->assertOk();
        $this->postJson('/api/admin/deletion-requests/'.$request->id.'/decision', ['decision' => 'accepted'])->assertOk();
        $this->assertSoftDeleted($turf);
        $this->assertDatabaseHas('fields', ['id' => $field->id]);
        $this->getJson('/api/admin/turfs/'.$turf->id.'/wallet')->assertOk()->assertJsonPath('balance', 10);
        $this->getJson('/api/turfs/'.$turf->id)->assertNotFound();
        $this->actingAs($owner)->getJson('/api/dashboard/turf')->assertOk()->assertJsonPath('wallet.balance', 10);
        $this->actingAs($admin)->deleteJson('/api/admin/users/'.$owner->id)->assertOk();
        $this->assertSoftDeleted($owner);
    }

    public function test_complex_cannot_be_deleted_with_unresolved_bookings(): void
    {
        [$owner, $user, $turf, $booking] = $this->acceptedBooking();
        $this->actingAs($this->person('admin'))->deleteJson('/api/admin/turfs/'.$turf->id)->assertStatus(409);
        $this->assertNotSoftDeleted($turf);
    }

    public function test_only_past_real_bookings_can_review_and_moderation_changes_public_ratings(): void
    {
        [$owner, $user, $turf, $booking] = $this->acceptedBooking();
        $payload = ['booking_id' => $booking->id, 'rating' => 5, 'comment' => 'Excellent'];
        $this->actingAs($user)->postJson('/api/turfs/'.$turf->id.'/reviews', $payload)->assertStatus(422);
        $booking->update(['start_time' => now()->subHours(2), 'end_time' => now()->subHour()]);
        $this->actingAs($this->person())->postJson('/api/turfs/'.$turf->id.'/reviews', $payload)->assertStatus(422);
        $this->actingAs($user)->postJson('/api/turfs/'.$turf->id.'/reviews', $payload)->assertCreated();
        $id = $turf->reviews()->first()->id;
        $this->getJson('/api/turfs/'.$turf->id)->assertJsonPath('turf.reviews_count', 1);
        $this->actingAs($this->person('turf'))->patchJson('/api/reviews/'.$id, ['is_hidden' => true])->assertForbidden();
        $this->actingAs($owner)->patchJson('/api/reviews/'.$id, ['is_hidden' => true])->assertOk();
        $this->getJson('/api/turfs/'.$turf->id)->assertJsonPath('turf.reviews_count', 0)->assertJsonCount(0, 'turf.reviews');
        $this->actingAs($user)->postJson('/api/turfs/'.$turf->id.'/reviews', $payload)->assertOk();
        $this->assertTrue($turf->reviews()->first()->is_hidden);
        $this->actingAs($this->person('admin'))->deleteJson('/api/reviews/'.$id)->assertOk();
        $this->assertDatabaseCount('reviews', 0);
    }

    public function test_logs_are_admin_only_exportable_and_exclude_credentials(): void
    {
        $owner = $this->person('turf');
        $turf = $this->complex($owner);
        $this->actingAs($owner)->putJson('/api/my-turf', ['name' => 'Changed complex'])->assertOk();
        $this->getJson('/api/admin/activity')->assertForbidden();
        $admin = $this->person('admin');
        $response = $this->actingAs($admin)->getJson('/api/admin/activity')->assertOk();
        $this->assertGreaterThan(0, $response->json('total'));
        $this->assertStringNotContainsString('password_reset_code', $response->getContent());
        $download = $this->get('/api/admin/activity/download')->assertOk();
        $this->assertStringContainsString('Changed complex', $download->streamedContent());
    }

    public function test_notifications_are_durable_and_body_is_encrypted_and_hidden_from_admin_json(): void
    {
        [$owner, $user, $turf, $booking] = $this->acceptedBooking();
        $this->assertDatabaseCount('email_deliveries', 3);
        $email = EmailDelivery::first();
        $this->assertStringNotContainsString($email->body, DB::table('email_deliveries')->where('id', $email->id)->value('body'));
        $this->actingAs($this->person('admin'))->getJson('/api/admin/emails')->assertOk()->assertJsonMissingPath('data.0.body');
    }

    public function test_email_jobs_track_failure_retry_and_success_without_resending_sent_messages(): void
    {
        $email = EmailDelivery::create(['recipient' => 'test@example.test', 'subject' => 'Status', 'body' => '<p>Test</p>']);
        $job = new SendTrackedEmail($email->id);
        Mail::shouldReceive('html')->once()->andThrow(new \RuntimeException('SMTP unavailable'));
        try {
            $job->handle();
            $this->fail('SMTP error must trigger a retry.');
        } catch (\RuntimeException $e) {
            $this->assertSame('Email transport failed: RuntimeException', $e->getMessage());
        }
        $this->assertSame('retrying', $email->fresh()->status);
        $job->failed(new \RuntimeException('SMTP unavailable'));
        $this->actingAs($this->person('admin'))->postJson('/api/admin/emails/'.$email->id.'/retry')->assertOk();
        Queue::assertPushed(SendTrackedEmail::class, fn ($j) => $j->deliveryId === $email->id);
        Mail::shouldReceive('html')->once()->andReturnNull();
        $job->handle();
        $job->handle();
        $this->assertSame('sent', $email->fresh()->status);
        $this->assertSame(2, $email->fresh()->attempts);
    }

    public function test_password_reset_revokes_all_tokens_and_stale_browser_sessions(): void
    {
        $user = $this->person();
        $user->createToken('old-one');
        $user->createToken('old-two');
        $user->update(['password_reset_code' => Hash::make('123456'), 'password_reset_code_expires_at' => now()->addMinutes(10)]);
        $this->postJson('/api/reset-password', ['email' => $user->email, 'code' => '123456',
            'password' => 'new-password123', 'password_confirmation' => 'new-password123'])->assertOk();
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(1, (int) $user->fresh()->auth_version);
        $this->postJson('/api/reset-password', ['email' => $user->email, 'code' => '123456',
            'password' => 'new-password456', 'password_confirmation' => 'new-password456'])->assertStatus(422);
        $this->withHeaders(['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/'])
            ->actingAs($user->fresh(), 'web')->withSession(['auth_version' => 0])->getJson('/api/me')->assertUnauthorized();
    }

    public function test_verified_accounts_cannot_use_verification_as_passwordless_login(): void
    {
        $user = $this->person();
        $this->postJson('/api/verify-email', ['email' => $user->email, 'code' => '123456'])->assertStatus(422);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_demo_seeder_obeys_one_owner_one_complex_and_field_slots(): void
    {
        $this->seed(DemoSeeder::class);
        $this->seed(DemoSeeder::class);
        $this->assertDatabaseCount('turfs', 5);
        $this->assertDatabaseCount('fields', 5);
        $this->assertSame(5, Turf::distinct()->count('turf_manager_id'));
        $this->assertSame(0, Booking::whereNull('field_id')->count());
    }
}
