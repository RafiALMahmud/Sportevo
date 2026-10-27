<?php

namespace Tests\Feature;

use App\Models\Field;
use App\Models\Role;
use App\Models\Sport;
use App\Models\Turf;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class FieldPhotoUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, SportSeeder::class]);
        Queue::fake();
        Storage::fake('public');
    }

    private function owner(): User
    {
        return User::factory()->create(['role_id' => Role::where('name', 'turf')->value('id')]);
    }

    private function payload(): array
    {
        return ['name' => 'Football field', 'price_per_slot' => 100, 'sports' => [Sport::first()->id], 'payment_provider' => 'bKash', 'payment_number' => '01712345678'];
    }

    private function complex(User $owner): Turf
    {
        return Turf::create(['name' => 'Photo complex', 'email' => $owner->email, 'location' => 'Dhaka',
            'turf_manager_id' => $owner->id, 'price_per_slot' => 100, 'commission_rate' => 10, 'is_approved' => false]);
    }

    public function test_first_field_can_be_created_with_photos_after_account_registration(): void
    {
        $owner = $this->owner();
        $response = $this->actingAs($owner)->post('/api/turfs', $this->payload() + [
            'email' => $owner->email, 'location' => 'Dhaka', 'field_name' => 'Pitch one',
            'photos' => [UploadedFile::fake()->image('first.jpg'), UploadedFile::fake()->image('second.png')],
        ], ['Accept' => 'application/json'])->assertCreated();
        $response->assertJsonCount(2, 'turf.fields.0.photos')->assertJsonPath('turf.fields.0.name', 'Pitch one');
        $field = Field::findOrFail($response->json('turf.fields.0.id'));
        foreach ($field->photos as $photo) {
            Storage::disk('public')->assertExists($photo->path);
            $this->assertSame($field->turf_id, $photo->turf_id);
            $this->assertStringStartsWith('/storage/', $photo->url);
        }
    }

    public function test_additional_field_creation_persists_its_own_images(): void
    {
        $owner = $this->owner();
        $turf = $this->complex($owner);
        $response = $this->actingAs($owner)->post('/api/turfs/'.$turf->id.'/fields', $this->payload() + [
            'photos' => [UploadedFile::fake()->image('field.png')],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonCount(1, 'field.photos');
        $photo = Field::findOrFail($response->json('field.id'))->photos()->firstOrFail();
        Storage::disk('public')->assertExists($photo->path);
        $this->getJson('/api/dashboard/turf')->assertOk()->assertJsonCount(1, 'turf.fields.0.photos');
    }

    public function test_invalid_photos_do_not_create_a_complex_or_field(): void
    {
        $owner = $this->owner();
        $this->actingAs($owner)->post('/api/turfs', $this->payload() + [
            'email' => $owner->email, 'location' => 'Dhaka', 'photos' => [UploadedFile::fake()->image('too-big.jpg')->size(5121)],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        $this->assertDatabaseCount('turfs', 0);
        $turf = $this->complex($owner);
        $this->post('/api/turfs/'.$turf->id.'/fields', $this->payload() + [
            'photos' => [UploadedFile::fake()->create('document.txt', 1, 'text/plain')],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        $this->assertDatabaseCount('fields', 0);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_upload_rejects_other_owners_fields_and_full_galleries(): void
    {
        $owner = $this->owner();
        $turf = $this->complex($owner);
        $field = $turf->fields()->create(collect($this->payload())->except('sports')->all());
        $other = $this->owner();
        $otherTurf = $this->complex($other);
        $otherField = $otherTurf->fields()->create(collect($this->payload())->except('sports')->all());
        $url = '/api/turfs/'.$turf->id.'/photos';
        $payload = ['field_id' => $field->id, 'photos' => [UploadedFile::fake()->image('image.jpg')]];
        $this->actingAs($other)->post($url, $payload, ['Accept' => 'application/json'])->assertForbidden();
        $this->actingAs($owner)->post($url, ['field_id' => $otherField->id, 'photos' => $payload['photos']], ['Accept' => 'application/json'])->assertNotFound();
        for ($i = 0; $i < 24; $i++) {
            $field->photos()->create(['turf_id' => $turf->id, 'path' => "existing-$i.jpg", 'sort_order' => $i]);
        }
        $this->post($url, $payload, ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('turf_photos', 24);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_failed_file_write_rolls_back_new_field_and_removes_preceding_file(): void
    {
        $owner = $this->owner();
        $turf = $this->complex($owner);
        $disk = Storage::disk('public');
        $mock = Mockery::mock($disk);
        $writes = 0;
        $mock->shouldReceive('putFileAs')->twice()->andReturnUsing(function (...$args) use ($disk, &$writes) {
            return ++$writes === 1 ? $disk->putFileAs(...$args) : false;
        });
        $mock->shouldReceive('delete')->once()->andReturnUsing(fn ($path) => $disk->delete($path));
        Storage::shouldReceive('disk')->with('public')->andReturn($mock);
        $this->actingAs($owner)->post('/api/turfs/'.$turf->id.'/fields', $this->payload() + [
            'photos' => [UploadedFile::fake()->image('first.jpg'), UploadedFile::fake()->image('second.jpg')],
        ], ['Accept' => 'application/json'])->assertStatus(503);
        $this->assertDatabaseCount('fields', 0);
        $this->assertDatabaseCount('turf_photos', 0);
        $this->assertSame([], $disk->allFiles());
    }

    public function test_each_role_can_update_only_their_own_name_and_encrypted_phone(): void
    {
        foreach (['user', 'turf', 'admin', 'superadmin'] as $role) {
            $user = User::factory()->create(['role_id' => Role::where('name', $role)->value('id')]);
            $this->actingAs($user)->patchJson('/api/profile', ['name' => 'Updated name', 'phone' => '01712345678',
                'email' => 'changed@example.invalid', 'role_id' => Role::where('name', 'superadmin')->value('id')])
                ->assertOk()->assertJsonPath('user.name', 'Updated name')->assertJsonPath('user.role', $role)->assertJsonPath('user.email', $user->email);
            $this->assertSame('01712345678', $user->fresh()->phone);
            $this->assertNotSame('01712345678', DB::table('users')->where('id', $user->id)->value('phone'));
        }
    }

    public function test_profile_update_requires_authentication_and_valid_details(): void
    {
        $this->patchJson('/api/profile', ['name' => 'Guest'])->assertUnauthorized();
        $this->actingAs($this->owner())->patchJson('/api/profile', ['name' => '', 'phone' => str_repeat('1', 21)])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'phone']);
    }
}
