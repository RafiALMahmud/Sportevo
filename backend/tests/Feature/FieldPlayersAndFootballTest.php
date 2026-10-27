<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FieldPlayersAndFootballTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, SportSeeder::class]);
    }

    private function owner(): User
    {
        return User::factory()->create(['role_id' => Role::where('name', 'turf')->value('id')]);
    }

    private function facility(): array
    {
        $owner = $this->owner();
        $turf = Turf::create(['name' => 'Team games', 'email' => $owner->email, 'location' => 'Bangladesh',
            'turf_manager_id' => $owner->id, 'price_per_slot' => 1000, 'commission_rate' => 10, 'is_approved' => true]);
        $field = $turf->fields()->create(['name' => 'Main field', 'price_per_slot' => 1000]);
        $field->sports()->sync([Sport::where('slug', 'football')->value('id')]);

        return [$owner, $turf, $field];
    }

    private function fieldData(array $changes = []): array
    {
        return array_replace(['name' => 'Football field', 'price_per_slot' => 1000,
            'sports' => [Sport::where('slug', 'football')->value('id')]], $changes);
    }

    public function test_first_field_player_count_is_optional_and_is_returned_as_an_integer(): void
    {
        foreach ([null, 5, 11] as $count) {
            $owner = $this->owner();
            $payload = $this->fieldData(['email' => $owner->email, 'location' => 'Bangladesh',
                'payment_provider' => 'bKash', 'payment_number' => '01712345678']);
            if ($count !== null) {
                $payload['players_per_side'] = (string) $count;
            }
            $this->actingAs($owner)->postJson('/api/turfs', $payload)->assertCreated()
                ->assertJsonPath('turf.fields.0.players_per_side', $count);
        }
    }

    public function test_each_field_can_set_change_and_clear_its_count_without_affecting_another_field(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $url = '/api/turfs/'.$turf->id.'/fields';
        $this->actingAs($owner)->putJson($url.'/'.$field->id, $this->fieldData(['players_per_side' => 7]))->assertOk()
            ->assertJsonPath('field.players_per_side', 7);
        $created = $this->postJson($url, $this->fieldData(['name' => 'Second field', 'players_per_side' => 5]))->assertCreated();
        $this->getJson('/api/turfs/'.$turf->id)->assertOk()->assertJsonFragment(['players_per_side' => 7])->assertJsonFragment(['players_per_side' => 5]);
        // A regular price edit omits capacity and must not erase it.
        $this->putJson($url.'/'.$field->id, $this->fieldData(['price_per_slot' => 1200]))->assertOk()->assertJsonPath('field.players_per_side', 7);
        $this->putJson($url.'/'.$field->id, $this->fieldData(['players_per_side' => '']))->assertOk()->assertJsonPath('field.players_per_side', null);
        $this->assertDatabaseHas('fields', ['id' => $created->json('field.id'), 'players_per_side' => 5]);
    }

    public function test_player_count_accepts_whole_positive_numbers_and_rejects_invalid_values(): void
    {
        [$owner, $turf, $field] = $this->facility();
        $url = '/api/turfs/'.$turf->id.'/fields/'.$field->id;
        $this->actingAs($owner);
        foreach ([0, -1, 101, 5.5, 'many', []] as $invalid) {
            $this->putJson($url, $this->fieldData(['players_per_side' => $invalid]))->assertUnprocessable()->assertJsonValidationErrors('players_per_side');
        }
        foreach ([1, 100, null] as $valid) {
            $this->putJson($url, $this->fieldData(['players_per_side' => $valid]))->assertOk()->assertJsonPath('field.players_per_side', $valid);
        }
        $this->actingAs($this->owner())->putJson($url, $this->fieldData(['players_per_side' => 11]))->assertForbidden();
        $this->assertNull($field->fresh()->players_per_side);
    }

    public function test_merge_keeps_all_active_archived_and_duplicate_assignments_and_booking_history(): void
    {
        [, $turf, $field] = $this->facility();
        $football = Sport::where('slug', 'football')->firstOrFail();
        $futsal = Sport::create(['name' => 'Futsal', 'slug' => 'futsal']);
        $bengaliFutsal = Sport::create(['name' => 'ফুটসাল', 'slug' => 'legacy-bengali-futsal']);
        $cricket = Sport::where('slug', 'cricket')->firstOrFail();
        $field->sports()->attach($futsal->id);
        $field->sports()->attach($bengaliFutsal->id);
        $field->update(['players_per_side' => 7]);
        $only = $turf->fields()->create(['name' => 'Small field', 'price_per_slot' => 800, 'players_per_side' => 5]);
        $only->sports()->sync([$futsal->id, $cricket->id]);
        $archived = $turf->fields()->create(['name' => 'Archived field', 'price_per_slot' => 500]);
        $archived->sports()->sync([$futsal->id]);
        $archived->delete();
        $turf->sports()->sync([$football->id, $futsal->id, $cricket->id]);
        Booking::create(['turf_id' => $turf->id, 'field_id' => $only->id, 'status' => 'completed',
            'price' => 800, 'commission_amount' => 80, 'start_time' => now()->subDays(2), 'end_time' => now()->subDays(2)->addHour()]);
        $before = DB::table('bookings')->get()->toJson();
        $fieldsBefore = DB::table('fields')->orderBy('id')->get()->toJson();
        $migration = require database_path('migrations/2026_10_26_000003_merge_futsal_into_football.php');
        $migration->up();
        $migration->up(); // Safe when retried after an interrupted release.
        $this->assertDatabaseMissing('sports', ['id' => $futsal->id]);
        $this->assertDatabaseMissing('sports', ['id' => $bengaliFutsal->id]);
        foreach ([$field, $only, $archived] as $entry) {
            $this->assertDatabaseHas('field_sport', ['field_id' => $entry->id, 'sport_id' => $football->id]);
        }
        $this->assertSame(1, DB::table('field_sport')->where('field_id', $field->id)->count());
        $this->assertDatabaseHas('field_sport', ['field_id' => $only->id, 'sport_id' => $cricket->id]);
        $this->assertSame(2, DB::table('sport_turf')->where('turf_id', $turf->id)->count());
        $this->assertSame($before, DB::table('bookings')->get()->toJson());
        $this->assertSame($fieldsBefore, DB::table('fields')->orderBy('id')->get()->toJson());
        $this->getJson('/api/turfs?sport=football')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/turfs?sport=futsal')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/turfs?sport_name=Futsal')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/turfs?sport[]=futsal')->assertUnprocessable();
    }

    public function test_merge_creates_football_when_only_a_legacy_futsal_category_exists(): void
    {
        [, $turf, $field] = $this->facility();
        Sport::where('slug', 'football')->delete();
        $futsal = Sport::create(['name' => 'Futsal', 'slug' => 'futsal']);
        $field->sports()->sync([$futsal->id]);
        $turf->sports()->sync([$futsal->id]);
        $migration = require database_path('migrations/2026_10_26_000003_merge_futsal_into_football.php');
        $migration->up();
        $football = Sport::where('slug', 'football')->firstOrFail();
        $this->assertDatabaseHas('field_sport', ['field_id' => $field->id, 'sport_id' => $football->id]);
        $this->assertDatabaseHas('sport_turf', ['turf_id' => $turf->id, 'sport_id' => $football->id]);
        $this->assertDatabaseMissing('sports', ['slug' => 'futsal']);
    }

    public function test_custom_futsal_names_reuse_football_and_catalog_and_seed_do_not_reintroduce_futsal(): void
    {
        [$owner, $turf] = $this->facility();
        foreach (['Futsal', '  FUTSAL  ', 'ফুটসাল', 'Football'] as $name) {
            $this->actingAs($owner)->postJson('/api/turfs/'.$turf->id.'/fields', $this->fieldData(['custom_sport' => $name]))
                ->assertCreated()->assertJsonCount(1, 'field.sports')->assertJsonPath('field.sports.0.name', 'Football');
        }
        $this->seed(SportSeeder::class);
        $this->assertSame(1, Sport::where('slug', 'football')->count());
        $this->assertDatabaseMissing('sports', ['slug' => 'futsal']);
        $this->getJson('/api/sports')->assertOk()->assertJsonFragment(['name' => 'Football'])->assertJsonMissing(['name' => 'Futsal']);
    }
}
