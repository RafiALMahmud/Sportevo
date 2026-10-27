<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class DeletedAccountRegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Queue::fake();
    }

    private function register(string $email)
    {
        return $this->postJson('/api/register', ['name' => 'New customer', 'email' => $email,
            'phone' => '01712345678',
            'password' => 'new-password-2026', 'password_confirmation' => 'new-password-2026', 'role' => 'user']);
    }

    public function test_admin_deleted_email_can_register_a_fresh_unverified_account(): void
    {
        $old = User::factory()->create(['password' => 'old-password-2026']);
        $old->createToken('old-session');
        $before = DB::table('users')->where('id', $old->id)->first();
        $admin = User::factory()->create(['role_id' => Role::where('name', 'admin')->value('id')]);
        $this->actingAs($admin)->deleteJson('/api/admin/users/'.$old->id)->assertOk();
        $this->register(strtoupper($old->email))->assertCreated();
        $new = User::whereEmail($old->email)->firstOrFail();
        $this->assertNull($new->email_verified_at);
        $this->assertNotSame($old->id, $new->id);
        $this->assertSoftDeleted($old);
        $this->assertSame(0, $old->tokens()->count());
        $after = DB::table('users')->where('id', $old->id)->first();
        $this->assertSame($before->email, $after->email);
        $this->assertSame($before->name, $after->name);
        $this->assertNotSame($before->email_hash, $after->email_hash);
        $this->register($old->email)->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/api/login', ['email' => $old->email, 'password' => 'old-password-2026'])->assertUnauthorized();
    }

    public function test_previously_deleted_accounts_are_repaired_without_changing_personal_data_or_active_hashes(): void
    {
        $old = User::factory()->create();
        $old->delete();
        DB::table('users')->where('id', $old->id)->update(['email_hash' => User::emailHash($old->email)]);
        $before = (array) DB::table('users')->where('id', $old->id)->first();
        $active = User::factory()->create();
        $activeBefore = (array) DB::table('users')->where('id', $active->id)->first();
        $migration = require database_path('migrations/2026_10_14_000001_release_deleted_user_email_identifiers.php');
        $migration->up();
        $migration->up();
        $after = (array) DB::table('users')->where('id', $old->id)->first();
        $this->assertSame(User::archivedEmailHash($old->id, $old->email), $after['email_hash']);
        unset($before['email_hash'], $after['email_hash']);
        $this->assertSame($before, $after);
        $this->assertSame($activeBefore, (array) DB::table('users')->where('id', $active->id)->first());
        $this->register($old->email)->assertCreated();
    }

    public function test_restoring_an_unused_email_restores_its_login_lookup(): void
    {
        $old = User::factory()->create();
        $old->delete();
        $old->restore();
        $this->assertSame($old->id, User::whereEmail($old->email)->firstOrFail()->id);
        $this->register($old->email)->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_an_archived_account_cannot_be_restored_over_a_new_account_with_the_same_email(): void
    {
        $old = User::factory()->create();
        $old->delete();
        $this->register($old->email)->assertCreated();
        $new = User::whereEmail($old->email)->firstOrFail();
        try {
            $old->restore();
            $this->fail('An active email must not be taken by an archived account.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('email', $error->errors());
        }
        $this->assertSoftDeleted($old);
        $this->assertSame($new->id, User::whereEmail($old->email)->firstOrFail()->id);
    }
}
