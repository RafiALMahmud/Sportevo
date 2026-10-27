<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CustomSportsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, SportSeeder::class]);
        Storage::fake('public');
    }

    private function owner(): User
    {
        return User::factory()->create(['role_id' => Role::where('name', 'turf')->value('id')]);
    }

    public function test_custom_only_first_field_with_photos_is_searchable_after_approval(): void
    {
        $owner = $this->owner();
        $response = $this->actingAs($owner)->post('/api/turfs', ['name' => 'New complex', 'email' => $owner->email,
            'payment_provider' => 'bKash', 'payment_number' => '01712345678',
            'location' => 'Dhaka', 'field_name' => 'Pickleball court', 'price_per_slot' => 150, 'custom_sport' => 'Pickleball',
            'photos' => [UploadedFile::fake()->image('court.jpg')]], ['Accept' => 'application/json'])->assertCreated();
        $response->assertJsonPath('turf.fields.0.sports.0.name', 'Pickleball')->assertJsonCount(1, 'turf.fields.0.photos');
        $turf = Turf::findOrFail($response->json('turf.id'));
        $this->getJson('/api/turfs?sport_name=pickle')->assertJsonCount(0, 'data');
        $turf->update(['is_approved' => true]);
        $this->getJson('/api/turfs?sport_name=pickle')->assertJsonCount(1, 'data');
        $this->getJson('/api/turfs?sport=pickleball')->assertJsonCount(1, 'data');
        $this->getJson('/api/turfs?sport_name=Hockey')->assertJsonCount(0, 'data');
        $this->getJson('/api/sports')->assertJsonFragment(['name' => 'Pickleball']);
    }

    public function test_custom_sports_are_reused_and_field_updates_can_mix_standard_and_other_sports(): void
    {
        $owner = $this->owner();
        $turf = Turf::create(['name' => 'Complex', 'email' => $owner->email, 'location' => 'Dhaka', 'price_per_slot' => 100,
            'commission_rate' => 10, 'turf_manager_id' => $owner->id]);
        $base = ['name' => 'Court', 'price_per_slot' => 100, 'sports' => [], 'custom_sport' => '  Pickleball  '];
        $first = $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/fields', $base)->assertCreated();
        $this->postJson('/api/turfs/'.$turf->id.'/fields', array_replace($base, ['custom_sport' => 'PICKLEBALL']))->assertCreated();
        $this->assertSame(1, Sport::where('slug', 'pickleball')->count());
        $standard = Sport::where('slug', 'football')->firstOrFail();
        $this->putJson('/api/turfs/'.$turf->id.'/fields/'.$first->json('field.id'), array_replace($base, ['sports' => [$standard->id], 'custom_sport' => 'Basketball']))
            ->assertOk()->assertJsonCount(2, 'field.sports');
        $this->assertSame(1, Sport::where('slug', 'basketball')->count());
        $this->actingAs($this->owner())->postJson('/api/turfs/'.$turf->id.'/fields', $base)->assertForbidden();
    }

    public function test_invalid_or_missing_sports_do_not_create_fields_or_catalog_entries(): void
    {
        $owner = $this->owner();
        $turf = Turf::create(['name' => 'Complex', 'email' => $owner->email, 'location' => 'Dhaka', 'price_per_slot' => 100,
            'commission_rate' => 10, 'turf_manager_id' => $owner->id]);
        $count = Sport::count();
        foreach (['', '<script>oops</script>', str_repeat('a', 81)] as $name) {
            $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/fields', ['name' => 'Court', 'price_per_slot' => 100, 'sports' => [], 'custom_sport' => $name])->assertUnprocessable();
        }
        $this->assertSame(0, $turf->fields()->count());
        $this->assertSame($count, Sport::count());
    }
}
