<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\EmailDelivery;
use App\Models\IssueReport;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class IssueReportsAndNotificationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Queue::fake();
    }

    private function person(string $role): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
    }

    public function test_reports_are_private_encrypted_and_admins_can_respond(): void
    {
        $customer = $this->person('user');
        $owner = $this->person('turf');
        $admin = $this->person('admin');
        $this->postJson('/api/reports', ['subject' => 'Issue', 'message' => 'Booking issue'])->assertUnauthorized();
        $this->actingAs($customer)->postJson('/api/reports', ['subject' => 'Booking issue', 'message' => 'My booking was missing.'])->assertCreated();
        $report = IssueReport::firstOrFail();
        $this->assertNotSame('My booking was missing.', DB::table('issue_reports')->value('message'));
        $this->actingAs($owner)->getJson('/api/reports')->assertJsonCount(0, 'data');
        $this->actingAs($owner)->patchJson('/api/admin/reports/'.$report->id, ['status' => 'resolved'])->assertForbidden();
        $this->actingAs($owner)->getJson('/api/admin/reports')->assertForbidden();
        $this->actingAs($owner)->postJson('/api/reports', ['subject' => 'Owner issue', 'message' => 'Please check my slots.'])->assertCreated();
        $this->actingAs($admin)->getJson('/api/admin/reports')->assertJsonCount(2, 'data');
        $this->actingAs($admin)->patchJson('/api/admin/reports/'.$report->id, ['status' => 'resolved', 'admin_reply' => 'We fixed your booking.'])->assertOk();
        $this->assertNotSame('We fixed your booking.', DB::table('issue_reports')->where('id', $report->id)->value('admin_reply'));
        $this->actingAs($customer)->getJson('/api/reports')->assertJsonCount(1, 'data')->assertJsonPath('data.0.admin_reply', 'We fixed your booking.')->assertJsonPath('data.0.status', 'resolved');
    }

    public function test_report_validation_prevents_invalid_and_oversized_content(): void
    {
        $this->actingAs($this->person('user'))->postJson('/api/reports', ['subject' => '', 'message' => str_repeat('x', 5001)])->assertUnprocessable()->assertJsonValidationErrors(['subject', 'message']);
        $report = IssueReport::create(['user_id' => auth()->id(), 'subject' => 'Issue', 'message' => 'Help']);
        $this->actingAs($this->person('superadmin'))->patchJson('/api/admin/reports/'.$report->id, ['status' => 'invalid'])->assertUnprocessable();
    }

    public function test_booking_emails_reach_owner_and_contact_once_and_setting_can_disable_them(): void
    {
        $owner = $this->person('turf');
        $customer = $this->person('user');
        $turf = Turf::create(['name' => 'Complex', 'email' => 'contact@example.test', 'location' => 'Dhaka', 'price_per_slot' => 100,
            'commission_rate' => 10, 'turf_manager_id' => $owner->id, 'is_approved' => true]);
        $field = $turf->fields()->create(['name' => 'Football field', 'price_per_slot' => 100]);
        $slot = Booking::create(['turf_id' => $turf->id, 'field_id' => $field->id, 'start_time' => now()->addDays(2), 'end_time' => now()->addDays(2)->addHour(), 'status' => 'available']);
        $payload = ['turf_id' => $turf->id, 'field_id' => $field->id, 'start_time' => $slot->start_time->toIso8601String(), 'end_time' => $slot->end_time->toIso8601String()];
        $this->actingAs($customer)->postJson('/api/bookings', $payload)->assertCreated();
        $deliveries = EmailDelivery::all();
        $this->assertEqualsCanonicalizing([$owner->email, $customer->email, 'contact@example.test'], $deliveries->pluck('recipient')->all());
        $this->assertStringContainsString('Football field', $deliveries->firstWhere('recipient', $owner->email)->body);
        $this->assertStringNotContainsString($customer->email, $deliveries->firstWhere('recipient', $owner->email)->body);
        $this->actingAs($customer)->putJson('/api/my-turf', ['booking_request_emails' => false])->assertForbidden();
        $this->actingAs($owner)->putJson('/api/my-turf', ['booking_request_emails' => false])->assertOk();
        $slot->refresh()->update(['status' => 'available', 'user_id' => null]);
        $this->actingAs($customer)->postJson('/api/bookings', $payload)->assertCreated();
        $this->assertCount(4, EmailDelivery::all());
        $this->actingAs($owner)->putJson('/api/my-turf', ['booking_request_emails' => true, 'email' => $owner->email])->assertOk();
        $slot->refresh()->update(['status' => 'available', 'user_id' => null]);
        $this->actingAs($customer)->postJson('/api/bookings', $payload)->assertCreated();
        $this->assertCount(6, EmailDelivery::all());
    }
}
