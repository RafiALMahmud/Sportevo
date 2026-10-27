<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\EmailDelivery;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Services\ActivityLog;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Psr\Log\LoggerInterface;
use Tests\TestCase;

class PersonalDataEncryptionTest extends TestCase
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
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id'), 'name' => 'Private Person',
            'email' => 'private-'.bin2hex(random_bytes(4)).'@example.test', 'phone' => '01712345678']);
    }

    public function test_account_identity_is_ciphertext_and_lookup_hash_is_hidden(): void
    {
        $user = $this->person();
        $row = DB::table('users')->where('id', $user->id)->first();
        foreach (['name', 'email', 'phone'] as $field) {
            $this->assertNotSame($user->$field, $row->$field);
            $this->assertSame($user->$field, Crypt::decryptString($row->$field));
        }
        $this->assertSame($user->id, User::whereEmail(strtoupper($user->email))->firstOrFail()->id);
        $this->assertNotSame(hash('sha256', $user->email), $row->email_hash);
        $this->actingAs($user)->getJson('/api/me')->assertOk()->assertJsonPath('user.name', 'Private Person');
        $this->assertArrayNotHasKey('email_hash', $user->toArray());
    }

    public function test_case_insensitive_active_emails_remain_reserved(): void
    {
        $user = $this->person();
        $email = $user->email;
        $this->postJson('/api/register', ['name' => 'Different person', 'email' => strtoupper($email),
            'password' => 'secure-password-12', 'password_confirmation' => 'secure-password-12', 'role' => 'user'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_complex_contacts_and_outbox_metadata_are_encrypted(): void
    {
        $owner = $this->person('turf');
        $turf = Turf::create(['name' => 'Public complex', 'email' => $owner->email, 'phone' => $owner->phone, 'location' => 'Dhaka',
            'turf_manager_id' => $owner->id, 'price_per_slot' => 100, 'commission_rate' => 10]);
        $row = DB::table('turfs')->where('id', $turf->id)->first();
        $this->assertSame($owner->email, Crypt::decryptString($row->email));
        $this->assertSame($owner->phone, Crypt::decryptString($row->phone));
        $this->assertSame('Public complex', $row->name);
        $email = EmailDelivery::create(['recipient' => $owner->email, 'subject' => 'Private notification', 'body' => 'Private body', 'last_error' => 'Recipient rejected '.$owner->email]);
        $raw = DB::table('email_deliveries')->where('id', $email->id)->first();
        foreach (['recipient', 'subject', 'body', 'last_error'] as $field) {
            $this->assertSame($email->$field, Crypt::decryptString($raw->$field));
        }
        $this->assertArrayNotHasKey('body', $email->toArray());
    }

    public function test_activity_identity_and_details_stay_encrypted_in_database_and_file_log(): void
    {
        $user = $this->person();
        request()->setUserResolver(fn () => $user);
        $logger = Mockery::mock(LoggerInterface::class);
        $logger->shouldReceive('info')->once()->with('privacy.test', Mockery::on(function ($context) use ($user) {
            $this->assertStringNotContainsString($user->email, json_encode($context));
            $this->assertStringNotContainsString('Private Person', json_encode($context));
            $this->assertSame('Private Person', Crypt::decryptString($context['actor_name']));
            $this->assertSame('Private note', json_decode(Crypt::decryptString($context['details']), true)['note']);

            return true;
        }));
        Log::shouldReceive('channel')->with('activity')->andReturn($logger);
        ActivityLog::record('privacy.test', ['note' => 'Private note']);
        $activity = Activity::where('action', 'privacy.test')->firstOrFail();
        $this->assertSame($user->email, $activity->actor_email);
        $this->assertSame('Private note', $activity->details['note']);
    }

    public function test_admin_substring_search_still_finds_encrypted_accounts_and_activity(): void
    {
        $admin = $this->person('admin');
        $user = $this->person();
        $user->update(['name' => 'Searchable Person', 'email' => 'search.alias@example.test']);
        Activity::create(['actor_id' => $user->id, 'actor_name' => $user->name, 'actor_email' => $user->email, 'action' => 'test.search', 'details' => []]);
        $this->actingAs($admin)->getJson('/api/admin/users?search=ALIAS')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $user->id);
        $this->getJson('/api/admin/activity?search=searchable')->assertOk()->assertJsonPath('data.0.actor_email', $user->email);
    }

    public function test_migration_converts_legacy_plaintext_and_can_resume_without_double_encryption(): void
    {
        $user = $this->person();
        DB::table('users')->where('id', $user->id)->update(['name' => 'Legacy person', 'email' => 'legacy@example.test']);
        $migration = require database_path('migrations/2026_10_11_000001_encrypt_personal_information.php');
        $migration->up();
        $encrypted = DB::table('users')->where('id', $user->id)->value('email');
        $this->assertSame('legacy@example.test', Crypt::decryptString($encrypted));
        $this->assertSame('Legacy person', $user->fresh()->name);
        $this->assertSame($user->id, User::whereEmail('legacy@example.test')->firstOrFail()->id);
        $migration->up();
        $this->assertSame($encrypted, DB::table('users')->where('id', $user->id)->value('email'));
    }
}
