<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Services\GoogleIdentity;
use Database\Seeders\RoleSeeder;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKey = '';
    private string $publicKey;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['services.google.client_id' => 'test.apps.googleusercontent.com', 'session.driver' => 'database']);
        $this->withHeaders(['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/login']);
        $key = openssl_pkey_new($this->keyOptions());
        openssl_pkey_export($key, $this->privateKey, null, $this->keyOptions());
        $this->publicKey = openssl_pkey_get_details($key)['key'];
        Cache::put('google-sign-in-certificates-v1', ['test-key' => $this->publicKey], 3600);
        Http::preventStrayRequests();
    }

    private function user(string $role = 'user'): User
    {
        return User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
    }

    private function keyOptions(): array
    {
        $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
        if (PHP_OS_FAMILY === 'Windows' && file_exists(dirname(PHP_BINARY).'/extras/ssl/openssl.cnf')) {
            $options['config'] = dirname(PHP_BINARY).'/extras/ssl/openssl.cnf';
        }
        return $options;
    }

    private function nonce(): string
    {
        $response = $this->getJson('/api/auth/google/nonce')->assertOk();
        $this->carrySession($response);
        return $response->json('nonce');
    }

    private function carrySession($response): void
    {
        $cookie = $response->getCookie(config('session.cookie'), false);
        if ($cookie) $this->withUnencryptedCookie($cookie->getName(), $cookie->getValue());
    }

    private function token(string $nonce, array $changes = [], ?string $key = null): string
    {
        return JWT::encode(array_replace(['iss' => 'https://accounts.google.com', 'aud' => 'test.apps.googleusercontent.com',
            'iat' => time(), 'exp' => time() + 300, 'sub' => 'google-test-identity', 'email' => 'new@example.test',
            'email_verified' => true, 'name' => 'Google Player', 'nonce' => $nonce], $changes), $key ?? $this->privateKey, 'RS256', 'test-key');
    }

    public function test_google_signup_collects_phone_and_allows_only_customer_or_owner(): void
    {
        foreach (['user', 'turf'] as $index => $role) {
            $nonce = $this->nonce();
            $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['sub' => 'identity-'.$role, 'email' => $role.'@example.test'])])
                ->assertOk()->assertJsonPath('requires_registration', true)->assertJsonMissingPath('sub');
            $this->postJson('/api/auth/google/register', ['role' => $role])->assertUnprocessable()->assertJsonValidationErrors('phone');
            $this->postJson('/api/auth/google/register', ['role' => 'superadmin', 'phone' => '01712345678'])->assertUnprocessable();
            $response = $this->postJson('/api/auth/google/register', ['role' => $role, 'phone' => '01712345678', 'email' => 'attacker@example.test']);
            $response->assertCreated()->assertJsonPath('user.role', $role)->assertJsonPath('user.email', $role.'@example.test')
                ->assertJsonPath('user.google_connected', true)->assertJsonPath('session_idle_seconds_remaining', 2700);
            $user = User::whereEmail($role.'@example.test')->firstOrFail();
            $this->assertNotEquals('identity-'.$role, $user->getRawOriginal('google_subject'));
            $this->assertNotNull($user->email_verified_at);
            $this->assertDatabaseCount('turfs', 0);
            $this->carrySession($response);
            \Illuminate\Support\Facades\Auth::forgetGuards();
            $this->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
            $this->carrySession($this->postJson('/api/logout')->assertOk());
            \Illuminate\Support\Facades\Auth::forgetGuards();
            $this->postJson('/api/auth/google/register', ['role' => $role, 'phone' => '01712345678'])->assertUnprocessable();
        }
    }

    public function test_invalid_tokens_claims_and_replayed_nonces_cannot_authenticate(): void
    {
        foreach ([['aud' => 'other'], ['iss' => 'https://attacker.test'], ['exp' => time() - 60], ['email_verified' => false], ['nonce' => 'not-issued'], ['sub' => ''], ['azp' => 'other']] as $change) {
            $nonce = $this->nonce();
            $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, $change)])->assertUnprocessable();
        }
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => 'not.a.valid.token'])->assertUnprocessable();
        $wrongKey = openssl_pkey_new($this->keyOptions());
        openssl_pkey_export($wrongKey, $private, null, $this->keyOptions());
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, [], $private)])->assertUnprocessable();
        $token = $this->token($nonce);
        $this->postJson('/api/auth/google', ['credential' => $token])->assertOk();
        $this->postJson('/api/auth/google', ['credential' => $token])->assertUnprocessable();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_third_party_mailbox_accounts_require_explicit_linking_and_keep_their_role(): void
    {
        $user = $this->user('superadmin');
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email])])->assertConflict();
        $this->assertNull($user->fresh()->google_subject_hash);
        $this->actingAs($user);
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google/link', ['credential' => $this->token($nonce)])->assertUnprocessable();
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google/link', ['credential' => $this->token($nonce, ['email' => $user->email])])->assertOk()->assertJsonPath('user.google_connected', true);
        $this->postJson('/api/logout')->assertOk();
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email]), 'role' => 'user'])->assertOk()->assertJsonPath('user.role', 'superadmin');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_verified_existing_gmail_accounts_auto_connect_without_changing_role_password_or_contact_details(): void
    {
        foreach (['user', 'turf', 'admin', 'superadmin'] as $role) {
            $user = $this->user($role);
            $user->update(['email' => $role.'@gmail.com']);
            $before = $user->fresh()->getRawOriginal();
            $nonce = $this->nonce();
            $response = $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => strtoupper($user->email), 'sub' => 'gmail-'.$role]), 'role' => 'superadmin']);
            $response->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonPath('user.role', $role)
                ->assertJsonPath('user.google_connected', true)->assertJsonMissingPath('requires_registration');
            $after = $user->fresh()->getRawOriginal();
            foreach (['name', 'email', 'email_hash', 'phone', 'password', 'role_id', 'auth_version'] as $field) $this->assertSame($before[$field] ?? null, $after[$field] ?? null);
            $this->assertSame(GoogleIdentity::subjectHash('gmail-'.$role), $user->fresh()->google_subject_hash);
            $this->carrySession($response);
            \Illuminate\Support\Facades\Auth::forgetGuards();
            $this->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);
            $this->carrySession($this->postJson('/api/logout')->assertOk());
            \Illuminate\Support\Facades\Auth::forgetGuards();
        }
        $this->assertDatabaseCount('users', 4);
        $this->assertDatabaseCount('email_deliveries', 0);
    }

    public function test_matching_workspace_accounts_auto_connect_but_missing_or_mismatched_hosted_domains_do_not(): void
    {
        $user = $this->user(); $user->update(['email' => 'player@company.example']);
        foreach ([null, '', 'other.example', ['company.example']] as $hostedDomain) {
            $nonce = $this->nonce();
            $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email, 'hd' => $hostedDomain])])->assertConflict();
            $this->assertNull($user->fresh()->google_subject_hash);
        }
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email, 'hd' => 'company.example'])])
            ->assertOk()->assertJsonPath('user.id', $user->id);
    }

    public function test_auto_connect_never_bypasses_app_verification_or_replaces_another_google_identity(): void
    {
        $user = $this->user(); $user->update(['email' => 'existing@gmail.com', 'email_verified_at' => null]);
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email])])->assertForbidden();
        $this->assertNull($user->fresh()->google_subject_hash);
        $user->forceFill(['email_verified_at' => now(), 'google_subject' => 'previous-identity', 'google_subject_hash' => GoogleIdentity::subjectHash('previous-identity')])->save();
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $user->email])])->assertConflict();
        $this->assertSame(GoogleIdentity::subjectHash('previous-identity'), $user->fresh()->google_subject_hash);
    }

    public function test_google_identity_is_released_when_account_is_deleted_without_restoring_history(): void
    {
        $user = $this->user();
        $user->update(['email' => 'deleted-google-account@gmail.com']);
        $user->forceFill(['google_subject' => 'google-test-identity', 'google_subject_hash' => GoogleIdentity::subjectHash('google-test-identity')])->save();
        $email = $user->email; $user->delete();
        $this->assertNull($user->fresh()->google_subject_hash);
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce, ['email' => $email])])->assertOk()->assertJsonPath('requires_registration', true);
        $response = $this->postJson('/api/auth/google/register', ['role' => 'user', 'phone' => '01712345678'])->assertCreated();
        $this->assertNotEquals($user->id, $response->json('user.id'));
        $this->assertSoftDeleted($user);
    }

    public function test_google_key_fetch_is_trusted_cached_and_outages_fail_closed(): void
    {
        Cache::forget('google-sign-in-certificates-v1');
        Http::fake(['https://www.googleapis.com/oauth2/v1/certs' => Http::response(['test-key' => $this->publicKey])]);
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce)])->assertOk();
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce)])->assertOk();
        Http::assertSentCount(1);
        Cache::forget('google-sign-in-certificates-v1');
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake(['https://www.googleapis.com/oauth2/v1/certs' => Http::response('', 503)]);
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce)])->assertStatus(503);
    }

    private function complex(?float $lat, ?float $lng, bool $approved = true): Turf
    {
        $owner = $this->user('turf');
        $turf = Turf::create(['name' => 'Match '.$owner->id, 'email' => $owner->email, 'location' => 'Bangladesh',
            'latitude' => $lat, 'longitude' => $lng, 'is_approved' => $approved, 'turf_manager_id' => $owner->id]);
        $turf->fields()->create(['name' => 'Main field', 'price_per_slot' => 1000]);
        return $turf;
    }

    public function test_nearby_search_sorts_by_distance_and_preserves_pagination_and_public_eligibility(): void
    {
        $far = $this->complex(23.85, 90.4); $near = $this->complex(23.801, 90.4);
        $this->complex(24.5, 90.4); $noPin = $this->complex(null, null); $this->complex(23.8, 90.4, false);
        $deleted = $this->complex(23.8, 90.4); $deleted->delete();
        $url = '/api/turfs?lat=23.8&lng=90.4&radius_km=10&per_page=1';
        $this->getJson($url)->assertOk()->assertJsonPath('total', 2)->assertJsonPath('data.0.id', $near->id);
        $this->getJson($url.'&page=2')->assertOk()->assertJsonPath('data.0.id', $far->id);
        $this->getJson('/api/turfs')->assertOk()->assertJsonFragment(['id' => $noPin->id, 'latitude' => null, 'longitude' => null]);
        $this->getJson('/api/turfs?lat=23.8&lng=90.4&radius_km=1')->assertOk()->assertJsonPath('total', 1);
    }

    public function test_blank_directory_filters_return_complexes_instead_of_validation_errors(): void
    {
        $turf = $this->complex(23.8, 90.4);
        $filters = '?page=1&search=&sport=&sport_name=&location=';
        $this->getJson('/api/turfs'.$filters)->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $turf->id);
        $this->getJson('/api/turfs/map'.$filters)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $turf->id);
        $this->getJson('/api/turfs?search[]=invalid')->assertUnprocessable();
        $this->getJson('/api/turfs?location[]=invalid')->assertUnprocessable();
    }

    public function test_map_bounds_and_name_filters_use_private_data_free_pins(): void
    {
        $inside = $this->complex(23.8, 90.4); $this->complex(25, 91); $this->complex(null, null);
        $response = $this->getJson('/api/turfs/map?north=24&south=23&west=90&east=91&search='.urlencode($inside->name))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $inside->id)->assertJsonPath('truncated', false);
        foreach (['email', 'phone', 'payment_number', 'turf_manager_id', 'google_subject'] as $private) $response->assertJsonMissingPath('data.0.'.$private);
        $this->getJson('/api/turfs?lat=23.8')->assertUnprocessable();
        $this->getJson('/api/turfs?lat=100&lng=90')->assertUnprocessable();
        $this->getJson('/api/turfs?lat=23&lng=90&radius_km=10000')->assertUnprocessable();
        $this->getJson('/api/turfs/map?north=23&south=24&east=91&west=90')->assertUnprocessable();
        $this->getJson('/api/turfs?lat=23&lng=90&north=24&south=23&west=90&east=91')->assertUnprocessable();
    }

    public function test_owner_can_save_and_clear_pin_but_other_owners_cannot_change_it(): void
    {
        $turf = $this->complex(null, null);
        $this->actingAs($turf->manager)->putJson('/api/my-turf', ['latitude' => 23.8, 'longitude' => 90.4])->assertOk()->assertJsonPath('turf.latitude', 23.8);
        $this->putJson('/api/my-turf', ['name' => 'New name'])->assertOk()->assertJsonPath('turf.longitude', 90.4);
        $this->putJson('/api/my-turf', ['latitude' => 23.8])->assertUnprocessable();
        $this->putJson('/api/my-turf', ['latitude' => 100, 'longitude' => 90])->assertUnprocessable();
        $other = $this->complex(25, 91);
        $this->actingAs($other->manager)->putJson('/api/my-turf', ['latitude' => 24, 'longitude' => 90])->assertOk();
        $this->assertEquals(23.8, $turf->fresh()->latitude);
        $this->actingAs($turf->manager)->putJson('/api/my-turf', ['latitude' => '', 'longitude' => ''])->assertOk()->assertJsonPath('turf.latitude', null)->assertJsonPath('turf.longitude', null);
    }

    public function test_pending_google_registration_is_encrypted_and_cannot_be_used_after_expiry(): void
    {
        $nonce = $this->nonce();
        $this->postJson('/api/auth/google', ['credential' => $this->token($nonce)])->assertOk();
        $sealed = session()->get('google_registration');
        $this->assertIsString($sealed);
        $this->assertStringNotContainsString('new@example.test', $sealed);
        $claims = json_decode(\Illuminate\Support\Facades\Crypt::decryptString($sealed), true);
        $claims['expires'] = time() - 1;
        $this->withSession(['google_registration' => \Illuminate\Support\Facades\Crypt::encryptString(json_encode($claims))]);
        $this->postJson('/api/auth/google/register', ['phone' => '01712345678', 'role' => 'turf'])->assertUnprocessable();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_maps_allow_only_first_party_geolocation_and_nonce_authorized_scripts(): void
    {
        $response = $this->get('/explore')->assertOk();
        $response->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
        $response->assertHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
        $csp = $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString("'strict-dynamic'", $csp);
        preg_match("/'nonce-([^']+)'/", $csp, $match);
        $this->assertNotEmpty($match[1]);
        $this->assertStringContainsString('nonce="'.$match[1].'"', $response->getContent());
        $this->getJson('/api/turfs')->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    }

    public function test_rollback_preserves_configured_pins_and_connections_and_empty_rollback_preserves_records(): void
    {
        $turf = $this->complex(23.8, 90.4);
        $migration = require database_path('migrations/2026_11_02_000001_add_google_identity_and_complex_coordinates.php');
        foreach (['pin', 'connection'] as $type) {
            if ($type === 'connection') {
                $turf->update(['latitude' => null, 'longitude' => null]);
                $turf->manager->forceFill(['google_subject' => 'identity', 'google_subject_hash' => GoogleIdentity::subjectHash('identity')])->save();
            }
            try { $migration->down(); $this->fail('Configured location/identity must prevent rollback.'); }
            catch (\RuntimeException $error) { $this->assertStringContainsString('Export and remove', $error->getMessage()); }
            $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('turfs', 'latitude'));
        }
        $turf->manager->forceFill(['google_subject' => null, 'google_subject_hash' => null])->save();
        $migration->down();
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('users', 'google_subject_hash'));
        $migration->up();
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('users', 'google_subject_hash'));
        $this->assertDatabaseHas('turfs', ['id' => $turf->id]);
        $this->assertDatabaseHas('fields', ['turf_id' => $turf->id, 'price_per_slot' => 1000]);
    }
}
