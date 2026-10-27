<?php

namespace Tests\Feature;

use App\Jobs\SendTrackedEmail;
use App\Models\ContactMessage;
use App\Models\EmailDelivery;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ContactMessagesTest extends TestCase
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

    private function payload(): array
    {
        return ['name' => 'Contact Visitor', 'email' => 'visitor@example.test', 'type' => 'complaint',
            'subject' => 'Please check my booking', 'message' => 'My booking disappeared. <script>alert(1)</script>', 'website' => ''];
    }

    public function test_guest_message_is_encrypted_and_emails_every_current_admin(): void
    {
        $admin = $this->person('admin');
        $superadmin = $this->person('superadmin');
        $this->person('turf');
        $this->person('user');
        $removed = $this->person('admin');
        $removed->delete();
        $response = $this->postJson('/api/contact', $this->payload())->assertCreated()->assertJsonStructure(['message', 'reference']);
        $response->assertJsonMissingPath('name')->assertJsonMissingPath('email');
        $message = ContactMessage::firstOrFail();
        foreach (['name', 'email', 'subject', 'message'] as $field) {
            $this->assertNotSame($this->payload()[$field], DB::table('contact_messages')->value($field));
            $this->assertSame($this->payload()[$field], $message->$field);
        }
        $this->assertEqualsCanonicalizing([$admin->email, $superadmin->email], EmailDelivery::all()->pluck('recipient')->all());
        $this->assertStringContainsString('&lt;script&gt;', EmailDelivery::firstOrFail()->body);
        $this->assertStringNotContainsString('<script>', EmailDelivery::firstOrFail()->body);
        Queue::assertPushed(SendTrackedEmail::class, 2);
    }

    public function test_only_admins_can_read_and_handle_messages_and_the_dashboard_counts_new_messages(): void
    {
        $this->postJson('/api/contact', $this->payload())->assertCreated();
        $message = ContactMessage::firstOrFail();
        $this->getJson('/api/admin/contact-messages')->assertUnauthorized();
        foreach (['user', 'turf'] as $role) {
            $this->actingAs($this->person($role))->getJson('/api/admin/contact-messages')->assertForbidden();
            $this->patchJson('/api/admin/contact-messages/'.$message->id, ['status' => 'resolved'])->assertForbidden();
        }
        $admin = $this->person('admin');
        $this->actingAs($admin)->getJson('/api/dashboard/platform')->assertOk()->assertJsonPath('newContactMessages', 1);
        $this->getJson('/api/admin/contact-messages?status=new')->assertOk()->assertJsonPath('data.0.email', 'visitor@example.test');
        $this->patchJson('/api/admin/contact-messages/'.$message->id, ['status' => 'resolved'])->assertOk();
        $this->assertSame($admin->id, $message->fresh()->handled_by);
        $this->getJson('/api/dashboard/platform')->assertJsonPath('newContactMessages', 0);
        $this->getJson('/api/admin/contact-messages?status=new')->assertJsonCount(0, 'data');
    }

    public function test_validation_and_honeypot_do_not_store_or_email_invalid_submissions(): void
    {
        $payload = $this->payload();
        $payload['email'] = 'invalid';
        $payload['type'] = 'admin';
        $this->postJson('/api/contact', $payload)->assertUnprocessable()->assertJsonValidationErrors(['email', 'type']);
        $this->postJson('/api/contact', $this->payload() + ['status' => 'resolved'])->assertCreated();
        $this->assertSame('new', ContactMessage::firstOrFail()->status);
        $payload = $this->payload();
        $payload['website'] = 'spam.example';
        $this->postJson('/api/contact', $payload)->assertUnprocessable()->assertJsonValidationErrors('website');
        $this->assertSame(1, ContactMessage::count());
        Queue::assertNothingPushed();
    }

    public function test_public_form_is_rate_limited(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/contact', $this->payload())->assertCreated();
        }
        $this->postJson('/api/contact', $this->payload())->assertStatus(429);
        $this->assertSame(3, ContactMessage::count());
    }
}
