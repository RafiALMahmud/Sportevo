<?php

namespace Tests\Feature;

use App\Models\FeaturedPlacement;
use App\Models\FeaturedRequest;
use App\Models\FeaturedSetting;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class FeaturedComplexTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        $this->freezeTime();
        Queue::fake();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        FeaturedSetting::findOrFail(1)->update(['payment_details' => [['provider' => 'bKash', 'number' => '01712345678']]]);
    }

    private function person(string $role): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
    }

    private function complex(bool $approved = true): Turf
    {
        $owner = $this->person('turf');
        $turf = Turf::create(['name' => 'Arena '.$owner->id, 'email' => $owner->email, 'phone' => '01712345678', 'location' => 'Bangladesh',
            'turf_manager_id' => $owner->id, 'is_approved' => $approved]);
        $turf->fields()->create(['name' => 'Main field', 'price_per_slot' => 1000]);
        return $turf;
    }

    private function quote(Turf $turf, int $days = 15): int
    {
        return $this->actingAs($turf->manager)->postJson('/api/featured/requests', ['days' => $days, 'provider' => 'bKash', 'amount' => 1])
            ->assertCreated()->json('request.id');
    }

    public function test_only_superadmins_can_read_or_change_platform_payment_settings(): void
    {
        foreach (['user', 'turf', 'admin'] as $role) {
            $this->actingAs($this->person($role))->getJson('/api/admin/featured/payment-settings')->assertForbidden();
            $this->putJson('/api/admin/featured/payment-settings', ['methods' => []])->assertForbidden();
        }
        $this->actingAs($this->person('superadmin'))->putJson('/api/admin/featured/payment-settings', ['methods' => [
            ['provider' => 'Nagad', 'number' => '01812345678'], ['provider' => 'Card', 'number' => 'TEST-RECEIVER-ONLY'],
        ], 'instructions' => 'Use your request number'])->assertOk();
        $this->getJson('/api/admin/featured/payment-settings')->assertOk()->assertJsonPath('methods.0.provider', 'Nagad');
        $this->assertStringNotContainsString('01812345678', DB::table('featured_settings')->value('payment_details'));
        $this->putJson('/api/admin/featured/payment-settings', ['methods' => [['provider' => 'bKash', 'number' => '01712345678'], ['provider' => 'bKash', 'number' => '01712345678']]])->assertUnprocessable();
    }

    public function test_fixed_server_quotes_and_receiving_snapshots_cannot_be_tampered_with(): void
    {
        $turf = $this->complex();
        foreach ([15 => '150.00', 30 => '300.00', 60 => '500.00'] as $days => $price) {
            $id = $this->quote($turf, $days);
            $quote = FeaturedRequest::findOrFail($id);
            $this->assertSame($price, $quote->amount);
            $this->postJson('/api/featured/requests/'.$id.'/cancel')->assertOk();
        }
        $this->postJson('/api/featured/requests', ['days' => 14, 'provider' => 'bKash'])->assertUnprocessable();
        $id = $this->quote($turf);
        FeaturedSetting::findOrFail(1)->update(['payment_details' => [['provider' => 'bKash', 'number' => '01999999999']]]);
        $this->getJson('/api/featured/owner')->assertOk()->assertJsonPath('requests.data.0.receiver_number', '01712345678')
            ->assertJsonPath('payment.methods.0.number', '01999999999');
        $this->assertNotSame('01712345678', DB::table('featured_requests')->where('id', $id)->value('receiver_number'));
    }

    public function test_owners_can_submit_only_their_own_reference_and_cannot_cancel_submitted_payments(): void
    {
        $turf = $this->complex(); $id = $this->quote($turf);
        $this->actingAs($this->person('turf'))->postJson('/api/featured/requests/'.$id.'/reference', ['reference' => 'TRX-TEST'])->assertForbidden();
        $this->postJson('/api/featured/requests/'.$id.'/cancel')->assertForbidden();
        $this->actingAs($turf->manager)->postJson('/api/featured/requests/'.$id.'/reference', ['reference' => 'TRX-TEST'])->assertOk()->assertJsonPath('request.status', 'submitted');
        $this->assertNotSame('TRX-TEST', DB::table('featured_requests')->where('id', $id)->value('payment_reference'));
        $this->postJson('/api/featured/requests/'.$id.'/cancel')->assertConflict();
        $this->postJson('/api/featured/requests', ['days' => 30, 'provider' => 'bKash'])->assertConflict();
        $this->getJson('/api/admin/featured')->assertForbidden();
        $this->getJson('/api/featured-complexes')->assertOk()->assertJsonPath('mode', 'browse')->assertJsonMissingPath('data.0.receiver_number');
    }

    public function test_admin_and_superadmin_can_confirm_directly_but_only_once_and_after_verifying_receipt(): void
    {
        foreach (['admin', 'superadmin'] as $role) {
            $turf = $this->complex(); $id = $this->quote($turf);
            $this->travel(2)->days();
            $this->actingAs($this->person($role))->postJson('/api/admin/featured/requests/'.$id.'/approve', [])->assertUnprocessable();
            $this->postJson('/api/admin/featured/requests/'.$id.'/approve', ['payment_received' => true, 'starts_at' => now()->subDays(30)])->assertOk();
            $quote = FeaturedRequest::findOrFail($id);
            $this->assertSame(now()->getTimestamp(), $quote->starts_at->getTimestamp());
            $this->assertSame(now()->addDays(15)->getTimestamp(), $quote->ends_at->getTimestamp());
            $this->assertNull($quote->payment_reference);
            $this->postJson('/api/admin/featured/requests/'.$id.'/approve', ['payment_received' => true])->assertConflict();
            $this->assertSame(1, FeaturedPlacement::where('turf_id', $turf->id)->count());
        }
        $this->assertDatabaseCount('wallet_entries', 0);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_renewal_preserves_remaining_days_and_freezes_each_approved_payment_period(): void
    {
        $turf = $this->complex(); $id = $this->quote($turf); $admin = $this->person('admin');
        $this->actingAs($admin)->postJson('/api/admin/featured/requests/'.$id.'/approve', ['payment_received' => true])->assertOk();
        $firstEnd = FeaturedRequest::findOrFail($id)->ends_at;
        $this->travel(2)->days(); $renewal = $this->quote($turf, 30);
        $this->actingAs($admin)->postJson('/api/admin/featured/requests/'.$renewal.'/approve', ['payment_received' => true])->assertOk();
        $this->assertTrue(FeaturedRequest::findOrFail($renewal)->starts_at->equalTo($firstEnd));
        $this->assertTrue(FeaturedPlacement::first()->ends_at->equalTo($firstEnd->copy()->addDays(30)));
        $this->assertTrue(FeaturedRequest::findOrFail($id)->ends_at->equalTo($firstEnd));
        $this->getJson('/api/featured-complexes')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('mode', 'featured');
    }

    public function test_both_admin_roles_can_add_edit_order_and_remove_without_erasing_payment_or_complex_history(): void
    {
        foreach (['admin', 'superadmin'] as $role) {
            $turf = $this->complex(); $id = $this->quote($turf); $admin = $this->person($role);
            $this->actingAs($admin)->postJson('/api/admin/featured/requests/'.$id.'/approve', ['payment_received' => true])->assertOk();
            $placement = FeaturedPlacement::where('turf_id', $turf->id)->firstOrFail();
            $before = FeaturedRequest::findOrFail($id)->getRawOriginal();
            $this->putJson('/api/admin/featured/placements/'.$placement->id, ['starts_at' => now()->toIso8601String(), 'ends_at' => now()->addDays(20)->toIso8601String(), 'priority' => 1, 'note' => 'Adjust listing'])->assertOk();
            $this->assertSame($before, FeaturedRequest::findOrFail($id)->getRawOriginal());
            $this->deleteJson('/api/admin/featured/placements/'.$placement->id, ['note' => 'Remove listing'])->assertOk();
            $this->assertFalse($placement->fresh()->is_enabled);
            $this->assertNotNull(Turf::find($turf->id));
            $this->assertNotNull(FeaturedRequest::find($id));
            $this->postJson('/api/admin/featured/placements', ['turf_id' => $turf->id, 'days' => 60, 'priority' => 2, 'note' => 'Manual placement'])->assertCreated();
            $this->assertFalse($placement->fresh()->is_sponsored);
            $this->assertSame('approved', FeaturedRequest::findOrFail($id)->status);
        }
    }

    public function test_expired_unapproved_archived_and_deleted_owner_placements_are_not_featured_and_public_data_is_safe(): void
    {
        $turf = $this->complex(); $id = $this->quote($turf); $admin = $this->person('admin');
        $this->actingAs($admin)->postJson('/api/admin/featured/requests/'.$id.'/approve', ['payment_received' => true])->assertOk();
        $response = $this->getJson('/api/featured-complexes')->assertOk()->assertJsonPath('data.0.is_sponsored', true);
        foreach (['payment_reference', 'payment_details', 'receiver_number', 'admin_note', 'email', 'phone', 'turf_manager_id'] as $field) $response->assertJsonMissingPath('data.0.'.$field);
        $turf->update(['is_approved' => false]); $this->getJson('/api/featured-complexes')->assertOk()->assertJsonCount(0, 'data');
        $turf->update(['is_approved' => true]); $turf->manager->delete(); $this->getJson('/api/featured-complexes')->assertOk()->assertJsonCount(0, 'data');
        $turf->manager->restore(); $this->travel(16)->days();
        $this->getJson('/api/featured-complexes')->assertOk()->assertJsonPath('mode', 'browse')->assertJsonMissingPath('data.0.is_sponsored');
        $turf->delete(); $this->getJson('/api/featured-complexes')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_capacity_includes_open_payment_requests_and_cancellation_or_rejection_frees_a_place(): void
    {
        $ids = [];
        for ($i = 0; $i < 9; $i++) $ids[] = $this->quote($this->complex());
        $extra = $this->complex();
        $this->actingAs($extra->manager)->postJson('/api/featured/requests', ['days' => 15, 'provider' => 'bKash'])->assertConflict();
        $first = FeaturedRequest::findOrFail($ids[0]);
        $this->actingAs($first->owner)->postJson('/api/featured/requests/'.$first->id.'/cancel')->assertOk();
        $newId = $this->quote($extra);
        $this->actingAs($this->person('admin'))->postJson('/api/admin/featured/requests/'.$newId.'/reject', ['note' => 'Unable to verify payment'])->assertOk();
        $this->quote($extra);
        $this->getJson('/api/featured/owner')->assertOk()->assertJsonPath('occupied', 9);
    }

    public function test_admin_priority_controls_public_order_and_bad_dates_or_unapproved_complexes_are_rejected(): void
    {
        $one = $this->complex(); $two = $this->complex(); $unapproved = $this->complex(false);
        $this->actingAs($this->person('admin'));
        foreach ([[$one, 50], [$two, 1]] as [$turf, $order]) {
            $this->postJson('/api/admin/featured/placements', ['turf_id' => $turf->id, 'days' => 15, 'priority' => $order, 'note' => 'Manual feature'])->assertCreated();
        }
        $this->getJson('/api/featured-complexes')->assertOk()->assertJsonPath('data.0.id', $two->id)->assertJsonPath('data.1.id', $one->id);
        $this->postJson('/api/admin/featured/placements', ['turf_id' => $unapproved->id, 'days' => 15, 'note' => 'Manual feature'])->assertUnprocessable();
        $placement = FeaturedPlacement::firstOrFail();
        $this->putJson('/api/admin/featured/placements/'.$placement->id, ['starts_at' => now(), 'ends_at' => now()->subDay(), 'priority' => 0, 'note' => 'Bad dates'])->assertUnprocessable();
        $this->actingAs($this->person('turf'))->deleteJson('/api/admin/featured/placements/'.$placement->id, ['note' => 'Forged removal'])->assertForbidden();
    }

    public function test_empty_checkout_blocks_requests_and_rollback_will_not_destroy_settings_or_history(): void
    {
        $turf = $this->complex();
        FeaturedSetting::findOrFail(1)->update(['payment_details' => []]);
        $this->actingAs($turf->manager)->postJson('/api/featured/requests', ['days' => 15, 'provider' => 'bKash'])->assertUnprocessable();
        $migration = require database_path('migrations/2026_11_02_000002_add_featured_complex_placements.php');
        try { $migration->down(); $this->fail('Configured payment settings must be preserved.'); }
        catch (\RuntimeException $error) { $this->assertStringContainsString('Export and remove', $error->getMessage()); }
        $this->assertDatabaseCount('featured_requests', 0);
        $this->assertDatabaseHas('turfs', ['id' => $turf->id]);
    }
}
