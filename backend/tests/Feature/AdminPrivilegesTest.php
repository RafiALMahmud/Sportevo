<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\PlatformAdminSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AdminPrivilegesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    private function makeUser(string $roleName): User
    {
        return User::factory()->create([
            'role_id' => Role::where('name', $roleName)->value('id'),
        ]);
    }

    public function test_admin_can_delete_a_regular_user(): void
    {
        $admin = $this->makeUser('admin');
        $member = $this->makeUser('user');

        $this->actingAs($admin)
            ->deleteJson("/api/admin/users/{$member->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $member->id]);
    }

    public function test_admin_cannot_delete_another_admin(): void
    {
        $admin = $this->makeUser('admin');
        $peer = $this->makeUser('admin');

        $this->actingAs($admin)
            ->deleteJson("/api/admin/users/{$peer->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $peer->id]);
    }

    public function test_admin_cannot_delete_a_superadmin(): void
    {
        $admin = $this->makeUser('admin');
        $superadmin = $this->makeUser('superadmin');

        $this->actingAs($admin)
            ->deleteJson("/api/admin/users/{$superadmin->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $superadmin->id]);
    }

    public function test_superadmin_can_delete_an_admin(): void
    {
        $superadmin = $this->makeUser('superadmin');
        $admin = $this->makeUser('admin');

        $this->actingAs($superadmin)
            ->deleteJson("/api/admin/users/{$admin->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $admin->id]);
    }

    public function test_superadmins_cannot_delete_each_other(): void
    {
        $first = $this->makeUser('superadmin');
        $second = $this->makeUser('superadmin');

        $this->actingAs($first)
            ->deleteJson("/api/admin/users/{$second->id}")
            ->assertForbidden();

        $this->actingAs($second)
            ->deleteJson("/api/admin/users/{$first->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $first->id]);
        $this->assertDatabaseHas('users', ['id' => $second->id]);
    }

    public function test_admin_cannot_change_another_admins_role(): void
    {
        $admin = $this->makeUser('admin');
        $peer = $this->makeUser('admin');
        $userRoleId = Role::where('name', 'user')->value('id');

        $this->actingAs($admin)
            ->postJson("/api/admin/users/{$peer->id}/role", ['role' => 'user'])
            ->assertForbidden();

        $this->assertSame($peer->role_id, $peer->fresh()->role_id);
        $this->assertNotSame($userRoleId, $peer->fresh()->role_id);
    }

    public function test_admin_can_create_another_admin(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'name' => 'New Admin',
                'email' => 'new.admin@example.test',
                'password' => 'password123',
                'role' => 'admin',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('users', ['email_hash' => User::emailHash('new.admin@example.test')]);
    }

    public function test_user_can_delete_their_own_profile(): void
    {
        $user = $this->makeUser('user');
        $user->createToken('auth_token')->plainTextToken;

        $this->actingAs($user)
            ->deleteJson('/api/profile')
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $user->id]);
        $this->assertSame(0, PersonalAccessToken::where('tokenable_id', $user->id)->count());
    }

    public function test_admin_can_delete_their_own_profile(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin)
            ->deleteJson('/api/profile')
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $admin->id]);
    }

    public function test_platform_admin_seeder_creates_two_verified_superadmins(): void
    {
        config(['platform_admin.passwords.1' => 'test-admin-one-123', 'platform_admin.passwords.2' => 'test-admin-two-123']);
        $this->seed(PlatformAdminSeeder::class);

        foreach (['rafi.almahmud.007@gmail.com', 'omarazim45@gmail.com'] as $index => $email) {
            $user = User::whereEmail($email)->first();

            $this->assertNotNull($user, "Missing seeded superadmin {$email}.");
            $this->assertTrue($user->hasRole('superadmin'));
            $this->assertNotNull($user->email_verified_at);
            $this->assertTrue(Hash::check(config('platform_admin.passwords.'.($index + 1)), $user->password));
        }

        // Idempotent: running twice must not duplicate or error.
        $this->seed(PlatformAdminSeeder::class);
        $this->assertSame(2, User::whereIn('email_hash', [
            User::emailHash('rafi.almahmud.007@gmail.com'),
            User::emailHash('omarazim45@gmail.com'),
        ])->count());
    }
}
