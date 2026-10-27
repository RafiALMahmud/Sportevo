<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Field;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\TurfDeletionRequest;
use App\Models\User;
use App\Models\WalletEntry;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminDeletionTest extends TestCase
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

    private function complex(?User $owner = null): Turf
    {
        $owner ??= $this->person('turf');

        return Turf::create(['name' => 'Deletion test complex', 'email' => $owner->email,
            'location' => 'Bangladesh', 'turf_manager_id' => $owner->id, 'is_approved' => true,
            'price_per_slot' => 100, 'commission_rate' => 10]);
    }

    private function field(Turf $turf, string $name = 'Football'): Field
    {
        $field = $turf->fields()->create(['name' => $name, 'price_per_slot' => 100]);
        $field->sports()->attach(Sport::where('name', $name)->value('id') ?? Sport::first()->id);

        return $field;
    }

    private function booking(Field $field, string $status): Booking
    {
        return Booking::create(['turf_id' => $field->turf_id, 'field_id' => $field->id,
            'user_id' => $status === 'available' ? null : $this->person()->id,
            'start_time' => now()->addDays(2), 'end_time' => now()->addDays(2)->addHour(),
            'status' => $status, 'price' => 100, 'commission_rate' => 10,
            'commission_amount' => $status === 'completed' ? 10 : null]);
    }

    public function test_admin_and_superadmin_can_delete_an_owner_with_explicit_complex_confirmation(): void
    {
        foreach (['admin', 'superadmin'] as $role) {
            $owner = $this->person('turf');
            $owner->createToken('existing-session');
            $turf = $this->complex($owner);
            $field = $this->field($turf);
            $booking = $this->booking($field, 'completed');
            $turf->walletEntries()->create(['type' => 'commission_charge', 'amount' => 10, 'booking_id' => $booking->id]);
            $deletion = TurfDeletionRequest::create(['turf_id' => $turf->id, 'reason' => 'Closing', 'status' => 'pending']);
            $actor = $this->person($role);

            $this->actingAs($actor)->deleteJson('/api/admin/users/'.$owner->id, ['delete_complexes' => true])->assertOk();

            $this->assertSoftDeleted($owner);
            $this->assertSoftDeleted($turf);
            $this->assertSoftDeleted($field);
            $this->assertSame(0, $owner->tokens()->count());
            $this->assertSame(1, (int) $owner->fresh()->auth_version);
            $this->assertSame('accepted', $deletion->fresh()->status);
            $this->assertSame($actor->id, $deletion->fresh()->decided_by);
            $this->assertSame($field->name, $booking->fresh('field')->field->name);
            $this->assertSame(10.0, $turf->walletBalance());
            $this->getJson('/api/admin/turfs/'.$turf->id.'/wallet')->assertOk()->assertJsonPath('balance', 10);
            $this->getJson('/api/turfs/'.$turf->id)->assertNotFound();
        }
    }

    public function test_owner_deletion_requires_explicit_confirmation_and_is_atomic_when_bookings_are_active(): void
    {
        $owner = $this->person('turf');
        $owner->createToken('keep-session');
        $turf = $this->complex($owner);
        $field = $this->field($turf);
        $this->actingAs($this->person('admin'))->deleteJson('/api/admin/users/'.$owner->id)->assertStatus(409);

        foreach (['pending', 'booked'] as $status) {
            $booking = $this->booking($field, $status);
            $this->deleteJson('/api/admin/users/'.$owner->id, ['delete_complexes' => true])->assertStatus(409);
            $this->assertNotSoftDeleted($owner);
            $this->assertNotSoftDeleted($turf);
            $this->assertNotSoftDeleted($field);
            $this->assertSame(1, $owner->tokens()->count());
            $this->assertSame(0, (int) $owner->fresh()->auth_version);
            $booking->update(['status' => 'rejected']);
        }
        $this->deleteJson('/api/admin/users/'.$owner->id, ['delete_complexes' => true])->assertOk();
    }

    public function test_field_deletion_hides_its_slots_sport_and_photos_but_preserves_history_and_other_fields(): void
    {
        Storage::fake('public');
        $turf = $this->complex();
        $field = $this->field($turf);
        $remaining = $this->field($turf, 'Cricket');
        $oldBooking = $this->booking($field, 'completed');
        $openSlot = $this->booking($field, 'available');
        Storage::disk('public')->put('delete-test/football.png', 'photo');
        $field->photos()->create(['turf_id' => $turf->id, 'path' => 'delete-test/football.png', 'sort_order' => 1]);
        $remaining->photos()->create(['turf_id' => $turf->id, 'path' => 'delete-test/cricket.png', 'sort_order' => 2]);
        $wallet = WalletEntry::create(['turf_id' => $turf->id, 'booking_id' => $oldBooking->id, 'type' => 'commission_charge', 'amount' => 10]);

        $this->actingAs($this->person('superadmin'))->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertOk();

        $this->assertSoftDeleted($field);
        $this->assertNotSoftDeleted($remaining);
        $this->assertNotSoftDeleted($turf);
        $this->assertDatabaseHas('bookings', ['id' => $openSlot->id]);
        $this->assertDatabaseHas('wallet_entries', ['id' => $wallet->id, 'amount' => 10]);
        Storage::disk('public')->assertExists('delete-test/football.png');
        $this->assertSame($field->name, $oldBooking->fresh('field')->field->name);
        $this->getJson('/api/turfs')->assertOk()->assertJsonPath('data.0.photos.0.path', 'delete-test/cricket.png');
        $this->getJson('/api/turfs?sport=football')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/turfs/'.$turf->id)->assertOk()->assertJsonCount(1, 'turf.fields')->assertJsonCount(1, 'turf.photos');
        $this->getJson('/api/turfs/'.$turf->id.'/slots?field_id='.$field->id)->assertNotFound();
        $this->actingAs($oldBooking->user)->postJson('/api/bookings', ['turf_id' => $turf->id, 'field_id' => $field->id,
            'start_time' => $openSlot->start_time->toIso8601String(), 'end_time' => $openSlot->end_time->toIso8601String()])->assertNotFound();
    }

    public function test_last_field_can_be_removed_and_complex_returns_when_a_new_field_is_added(): void
    {
        $turf = $this->complex();
        $field = $this->field($turf);
        $this->actingAs($this->person('admin'))->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertOk();
        $this->getJson('/api/turfs')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/turfs/'.$turf->id)->assertNotFound();
        $this->assertStringNotContainsString('/turfs/'.$turf->id.'</loc>', $this->get('/sitemap.xml')->assertOk()->getContent());
        $this->actingAs($turf->manager)->postJson('/api/turfs/'.$turf->id.'/fields', [
            'name' => 'New field', 'price_per_slot' => 150, 'sports' => [Sport::first()->id],
        ])->assertCreated();
        $this->getJson('/api/turfs')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_field_deletion_is_admin_only_and_rejects_a_field_from_another_complex(): void
    {
        $turf = $this->complex();
        $field = $this->field($turf);
        $path = "/api/admin/turfs/{$turf->id}/fields/{$field->id}";
        $this->deleteJson($path)->assertUnauthorized();
        foreach ([$this->person(), $turf->manager] as $user) {
            $this->actingAs($user)->deleteJson($path)->assertForbidden();
        }
        $other = $this->complex();
        $this->actingAs($this->person('admin'))->deleteJson("/api/admin/turfs/{$other->id}/fields/{$field->id}")->assertNotFound();
        $this->assertNotSoftDeleted($field);
    }

    public function test_pending_and_booked_fields_cannot_be_deleted_until_bookings_are_resolved(): void
    {
        $turf = $this->complex();
        $field = $this->field($turf);
        foreach (['pending', 'booked'] as $status) {
            $booking = $this->booking($field, $status);
            $this->actingAs($this->person('admin'))->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertStatus(409);
            $this->assertNotSoftDeleted($field);
            $booking->update(['status' => 'cancelled']);
        }
        $this->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertOk();
    }

    public function test_cascade_option_does_not_bypass_admin_or_superadmin_account_protection(): void
    {
        $admin = $this->person('admin');
        $peer = $this->person('admin');
        $superadmin = $this->person('superadmin');
        $turf = $this->complex($superadmin);
        $field = $this->field($turf);
        $this->actingAs($admin)->deleteJson('/api/admin/users/'.$peer->id, ['delete_complexes' => true])->assertForbidden();
        $this->actingAs($this->person('superadmin'))->deleteJson('/api/admin/users/'.$superadmin->id, ['delete_complexes' => true])->assertForbidden();
        $this->assertNotSoftDeleted($superadmin);
        $this->assertNotSoftDeleted($turf);
        $this->assertNotSoftDeleted($field);
    }

    public function test_admin_listing_keeps_deleted_field_names_and_can_filter_bookings_by_field(): void
    {
        $turf = $this->complex();
        $old = $this->field($turf);
        $other = $this->field($turf, 'Cricket');
        $oldBooking = $this->booking($old, 'completed');
        $this->booking($other, 'completed');
        $this->actingAs($this->person('admin'))->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$old->id}")->assertOk();
        $this->getJson('/api/admin/turfs')->assertOk()->assertJsonPath('data.0.fields_count', 1)->assertJsonCount(2, 'data.0.fields');
        $this->getJson('/api/admin/slots?field_id='.$old->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $oldBooking->id)->assertJsonPath('data.0.field.name', 'Football');
        $this->deleteJson('/api/admin/turfs/'.$turf->id)->assertOk();
        $this->getJson('/api/admin/turfs?status=archived')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_admin_can_complete_a_finished_booking_before_deleting_its_field(): void
    {
        $turf = $this->complex();
        $field = $this->field($turf);
        $booking = $this->booking($field, 'booked');
        $booking->update(['start_time' => now()->subHours(2), 'end_time' => now()->subHour(), 'commission_amount' => 10]);
        $turf->walletEntries()->create(['type' => 'commission_charge', 'booking_id' => $booking->id, 'amount' => 10]);
        $this->actingAs($this->person())->postJson('/api/admin/slots/'.$booking->id.'/complete')->assertForbidden();
        $this->actingAs($this->person('admin'))->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertStatus(409);
        $this->postJson('/api/admin/slots/'.$booking->id.'/complete')->assertOk();
        $this->deleteJson("/api/admin/turfs/{$turf->id}/fields/{$field->id}")->assertOk();
        $this->assertSame('completed', $booking->fresh()->status);
        $this->assertSame(10.0, $turf->walletBalance());
    }
}
