<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class IdleSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        Mail::fake();
        $this->withHeaders(['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/']);
    }

    private function signedIn(string $role = 'user'): User
    {
        $user = User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
        $this->actingAs($user, 'web')->withSession([
            'auth_version' => (int) $user->auth_version,
            'auth_last_activity_at' => now()->timestamp,
        ]);

        return $user;
    }

    public function test_all_website_roles_expire_after_45_idle_minutes_and_are_logged_out(): void
    {
        foreach (['user', 'turf', 'admin', 'superadmin'] as $role) {
            $this->signedIn($role);
            $this->travel(44)->minutes();
            $this->getJson('/api/me')->assertOk()->assertJsonPath('session_idle_seconds_remaining', 60);
            $this->travel(1)->minutes();
            $this->getJson('/api/me')->assertUnauthorized()->assertJsonPath('message', 'Your session has expired. Please sign in again.');
            $this->assertGuest('web');
            $this->travelBack();
        }
    }

    public function test_background_reads_and_page_reloads_do_not_renew_the_idle_clock(): void
    {
        $this->signedIn();
        $this->travel(20)->minutes();
        $this->getJson('/api/me')->assertOk()->assertJsonPath('session_idle_seconds_remaining', 1500);
        $this->travel(20)->minutes();
        $this->getJson('/api/dashboard/user')->assertOk();
        $this->getJson('/api/me')->assertOk()->assertJsonPath('session_idle_seconds_remaining', 300);
        $this->travel(5)->minutes();
        $this->patchJson('/api/profile', ['name' => 'Should not be saved'])->assertUnauthorized();
        $this->assertDatabaseMissing('users', ['name' => 'Should not be saved']);
    }

    public function test_real_interaction_renews_the_clock_using_the_age_of_the_interaction(): void
    {
        $this->signedIn();
        $this->travel(44)->minutes();
        $this->getJson('/api/me', ['X-Session-Activity-Age' => '30'])
            ->assertOk()->assertJsonPath('session_idle_seconds_remaining', 2670);
        $this->travel(44)->minutes();
        $this->getJson('/api/me')->assertOk()->assertJsonPath('session_idle_seconds_remaining', 30);
        $this->travel(30)->seconds();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_activity_cannot_revive_an_already_expired_login(): void
    {
        $this->signedIn();
        $this->travel(45)->minutes();
        $this->getJson('/api/me', ['X-Session-Activity-Age' => '0'])->assertUnauthorized();
        $this->assertGuest('web');
    }

    public function test_malformed_or_old_activity_cannot_renew_the_session(): void
    {
        $this->signedIn();
        $this->travel(44)->minutes();
        foreach (['-1', '2700', '999999', 'banana'] as $age) {
            $this->getJson('/api/me', ['X-Session-Activity-Age' => $age])
                ->assertOk()->assertJsonPath('session_idle_seconds_remaining', 60);
        }
        $this->travel(1)->minutes();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_login_starts_a_fresh_idle_window_and_a_limited_api_token(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk()->assertJsonPath('session_idle_seconds_remaining', 2700);
        $this->assertSame(2700, $user->tokens()->first()->expires_at->timestamp - now()->timestamp);
    }
}
