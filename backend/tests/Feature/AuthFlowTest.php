<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Mail::fake();
    }

    private function spaHeaders(): array
    {
        return [
            'Origin' => 'http://localhost:5173',
            'Referer' => 'http://localhost:5173/login',
        ];
    }

    public function test_same_origin_local_hosting_supports_session_login_on_custom_ports(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create(['password' => Hash::make('local-host-password')]);
        $response = $this->withHeaders(['Origin' => 'http://localhost:8001', 'Referer' => 'http://localhost:8001/login'])
            ->postJson('http://localhost:8001/api/login', ['email' => $user->email, 'password' => 'local-host-password']);
        $response->assertOk()->assertJsonPath('user.email', $user->email);
        $session = collect($response->baseResponse->headers->getCookies())
            ->first(fn ($cookie) => $cookie->getName() === config('session.cookie'));
        $this->assertNotNull($session);
        $this->app['auth']->forgetGuards();
        $this->withUnencryptedCookie($session->getName(), $session->getValue())
            ->getJson('http://localhost:8001/api/me')->assertOk()->assertJsonPath('user.email', $user->email);
        $this->assertContains(Sanctum::$currentRequestHostPlaceholder, config('sanctum.stateful'));
    }

    private function registerUser(array $overrides = []): array
    {
        $payload = array_merge([
            'name' => 'Probe User',
            'email' => 'probe@example.test',
            'phone' => '01712345678',
            'password' => 'secret1234',
            'password_confirmation' => 'secret1234',
        ], $overrides);

        $response = $this->withHeaders($this->spaHeaders())
            ->postJson('/api/register', $payload);

        $response->assertCreated();

        return $payload;
    }

    public function test_registration_creates_an_unverified_user_and_login_is_blocked(): void
    {
        $payload = $this->registerUser();

        $this->assertDatabaseHas('users', ['email_hash' => User::emailHash($payload['email'])]);
        $this->assertNull(User::whereEmail($payload['email'])->value('email_verified_at'));

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/login', [
                'email' => $payload['email'],
                'password' => $payload['password'],
            ])
            ->assertStatus(403)
            ->assertJsonPath('email', $payload['email'])
            ->assertJsonPath('email_verified', false);
    }

    public function test_verification_rejects_unknown_emails_and_wrong_codes(): void
    {
        $payload = $this->registerUser();

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/verify-email', ['email' => 'ghost@example.test', 'code' => '123456'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid or expired verification code.');

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/verify-email', ['email' => $payload['email'], 'code' => '000000'])
            ->assertStatus(422);
    }

    public function test_verification_with_the_real_code_signs_the_user_in(): void
    {
        $payload = $this->registerUser();

        User::whereEmail($payload['email'])->update([
            'verification_code' => Hash::make('123456'),
            'verification_code_expires_at' => now()->addMinutes(15),
        ]);

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/verify-email', ['email' => $payload['email'], 'code' => '123456'])
            ->assertOk()
            ->assertJsonPath('user.email', $payload['email']);

        $this->assertNotNull(User::whereEmail($payload['email'])->value('email_verified_at'));

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/login', [
                'email' => $payload['email'],
                'password' => $payload['password'],
            ])
            ->assertOk()
            ->assertJsonPath('user.email', $payload['email']);
    }

    public function test_resend_code_replaces_the_previous_hash(): void
    {
        $payload = $this->registerUser();

        $before = User::whereEmail($payload['email'])->value('verification_code');

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/resend-code', ['email' => $payload['email']])
            ->assertOk();

        $after = User::whereEmail($payload['email'])->value('verification_code');

        $this->assertNotSame($before, $after);
        $this->assertTrue(Hash::isHashed($after));
    }

    public function test_forgot_and_reset_password_flow(): void
    {
        $user = User::factory()->create(['password' => Hash::make('old-password-1')]);

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/forgot-password', ['email' => $user->email])
            ->assertOk();

        User::whereEmail($user->email)->update([
            'password_reset_code' => Hash::make('654321'),
            'password_reset_code_expires_at' => now()->addMinutes(10),
        ]);

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/reset-password', [
                'email' => $user->email,
                'code' => '654321',
                'password' => 'brand-new-pass',
                'password_confirmation' => 'brand-new-pass',
            ])
            ->assertOk();

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'old-password-1'])
            ->assertStatus(401);

        $this->withHeaders($this->spaHeaders())
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'brand-new-pass'])
            ->assertOk();
    }
}
