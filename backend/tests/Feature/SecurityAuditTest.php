<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityAuditTest extends TestCase
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

    private function makeTurf(User $manager, bool $approved = true): Turf
    {
        return Turf::create([
            'name' => 'Test Arena',
            'email' => 'arena@example.test',
            'phone' => '01700000000',
            'location' => 'Dhanmondi, Dhaka',
            'is_approved' => $approved,
            'turf_manager_id' => $manager->id,
        ]);
    }

    public function test_api_responses_carry_security_headers(): void
    {
        $response = $this->getJson('/api/turfs');

        $response->assertOk();
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Permissions-Policy');
        $this->assertStringContainsString(
            "default-src 'none'",
            (string) $response->headers->get('Content-Security-Policy')
        );
    }

    public function test_html_responses_carry_a_spa_compatible_csp(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $csp = (string) $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("frame-ancestors 'self'", $csp);
        $this->assertStringContainsString("object-src 'none'", $csp);
    }

    public function test_login_starts_an_httponly_lax_session_for_the_spa(): void
    {
        // The cookie driver is persistent, so the issued session cookie is observable.
        config(['session.driver' => 'database']);

        $user = $this->makeUser('user');

        $response = $this->withHeaders([
            'Origin' => 'http://localhost:5173',
            'Referer' => 'http://localhost:5173/login',
        ])->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk();

        $sessionCookie = collect($response->baseResponse->headers->getCookies())
            ->first(fn ($cookie) => $cookie->getName() === config('session.cookie'));

        $this->assertNotNull($sessionCookie, 'Login must issue a session cookie for the SPA.');
        $this->assertTrue($sessionCookie->isHttpOnly(), 'Session cookie must be HttpOnly.');
        $this->assertSame('lax', $sessionCookie->getSameSite());
    }

    public function test_session_guard_users_can_call_protected_routes_without_a_bearer_token(): void
    {
        $user = $this->makeUser('user');

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.email', $user->email);
    }

    public function test_logout_succeeds_for_session_users_without_an_access_token(): void
    {
        $user = $this->makeUser('user');

        $this->actingAs($user)->postJson('/api/logout')->assertOk();
    }

    public function test_role_gates_reject_users_without_the_required_role(): void
    {
        $player = $this->makeUser('user');
        $manager = $this->makeUser('turf');

        $this->actingAs($player)->getJson('/api/dashboard/turf')->assertForbidden();
        $this->actingAs($manager)->getJson('/api/dashboard/user')->assertForbidden();
        $this->actingAs($player)->getJson('/api/admin/stats')->assertForbidden();
    }

    public function test_only_the_complex_owner_or_an_admin_may_accept_a_booking(): void
    {
        $owner = $this->makeUser('turf');
        $turf = $this->makeTurf($owner);
        $booker = $this->makeUser('user');
        $rivalManager = $this->makeUser('turf');

        $booking = Booking::create([
            'turf_id' => $turf->id,
            'user_id' => $booker->id,
            'start_time' => now()->addDay()->setTime(10, 0),
            'end_time' => now()->addDay()->setTime(11, 0),
            'status' => 'pending',
            'price' => 100,
            'commission_rate' => 10,
        ]);

        $this->actingAs($rivalManager)
            ->postJson("/api/bookings/{$booking->id}/accept")
            ->assertForbidden();

        $this->actingAs($owner)
            ->postJson("/api/bookings/{$booking->id}/accept")
            ->assertOk()
            ->assertJsonPath('booking.status', 'booked');
    }

    public function test_model_not_found_responses_are_masked(): void
    {
        $this->getJson('/api/turfs/999999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Resource not found.']);
    }

    public function test_unknown_api_routes_return_masked_json_404(): void
    {
        $this->getJson('/api/definitely-not-a-route')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Resource not found.']);

        $this->postJson('/api/definitely-not-a-route', [])
            ->assertNotFound()
            ->assertExactJson(['message' => 'Resource not found.']);
    }

    public function test_validation_failures_return_a_clean_json_shape(): void
    {
        $response = $this->postJson('/api/login', []);

        $response->assertStatus(422);
        $this->assertSame(['message', 'errors'], array_keys($response->json()));
        $response->assertJsonStructure(['message', 'errors' => ['email', 'password']]);
    }

    public function test_user_phone_is_encrypted_at_rest(): void
    {
        $user = $this->makeUser('user');

        $stored = DB::table('users')->where('id', $user->id)->value('phone');

        $this->assertNotEmpty($stored);
        $this->assertStringStartsWith('eyJpdiI6', $stored);
        $this->assertSame($user->phone, Crypt::decryptString($stored));
    }

    public function test_sitemap_lists_approved_turfs_and_robots_blocks_private_paths(): void
    {
        $manager = $this->makeUser('turf');
        $turf = $this->makeTurf($manager, approved: true);
        $turf->fields()->create(['name' => 'Main field', 'price_per_slot' => 100]);
        $this->makeTurf($this->makeUser('turf'), approved: false);

        $sitemap = $this->get('/sitemap.xml');
        $sitemap->assertOk();
        $this->assertStringContainsString('<urlset', (string) $sitemap->getContent());
        $this->assertStringContainsString('/turfs/1', (string) $sitemap->getContent());

        $robots = $this->get('/robots.txt');
        $robots->assertOk();
        $this->assertStringContainsString('Disallow: /dashboard', (string) $robots->getContent());
        $this->assertStringContainsString('Disallow: /api/', (string) $robots->getContent());
        $this->assertStringContainsString('Sitemap: ', (string) $robots->getContent());
    }

    public function test_login_endpoint_is_rate_limited_per_ip(): void
    {
        $attempts = [];

        for ($i = 0; $i < 7; $i++) {
            $attempts[] = $this->postJson('/api/login', [
                'email' => "nobody{$i}@example.test",
                'password' => 'wrong-password',
            ]);
        }

        foreach (array_slice($attempts, 0, 6) as $response) {
            $response->assertStatus(401);
        }

        $attempts[6]->assertStatus(429);
    }
}
