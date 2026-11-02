<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PlaceSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();
        config(['services.places.url' => 'https://places.example.test/api/']);
    }

    private function feature(array $changes = []): array
    {
        return array_replace_recursive([
            'type' => 'Feature', 'geometry' => ['type' => 'Point', 'coordinates' => [90.4125, 23.8103]],
            'properties' => ['name' => 'Dhaka', 'city' => 'Dhaka', 'state' => 'Dhaka Division', 'country' => 'Bangladesh', 'countrycode' => 'BD', 'private_extra' => 'not public'],
        ], $changes);
    }

    public function test_guests_can_search_bangladesh_places_and_repeated_searches_are_cached(): void
    {
        Http::fake(['places.example.test/*' => Http::response(['features' => [$this->feature()]])]);
        $this->getJson('/api/locations/search?q=Dhaka')->assertOk()->assertExactJson(['data' => [
            ['name' => 'Dhaka, Dhaka Division, Bangladesh', 'lat' => 23.8103, 'lng' => 90.4125],
        ]]);
        $this->getJson('/api/locations/search?q=dhaka')->assertOk()->assertJsonCount(1, 'data');
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['countrycode'] === 'BD' && $request['bbox'] === '88,20.3,92.8,26.7'
            && $request['limit'] === 5 && str_contains($request->header('User-Agent')[0], 'SportEvo'));
    }

    public function test_invalid_queries_do_not_call_the_provider(): void
    {
        foreach (['', 'ab', str_repeat('x', 201)] as $query) {
            $this->getJson('/api/locations/search?q='.urlencode($query))->assertUnprocessable()->assertJsonValidationErrors('q');
        }
        $this->getJson('/api/locations/search?q[]=Dhaka')->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_country_and_coordinate_checks_reject_bad_provider_results(): void
    {
        Http::fake(['places.example.test/*' => Http::response(['features' => [
            $this->feature(['properties' => ['countrycode' => 'IN']]),
            $this->feature(['geometry' => ['coordinates' => [10, 50]]]),
            $this->feature(['geometry' => ['coordinates' => ['bad', 23]]]),
            null,
            $this->feature(),
            $this->feature(),
        ]])]);
        $this->getJson('/api/locations/search?q=Dhaka')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonMissingPath('data.0.properties');
    }

    public function test_global_rate_gate_and_lock_prevent_parallel_upstream_searches(): void
    {
        Cache::put('places:next-request', microtime(true) + 30, 60);
        $this->getJson('/api/locations/search?q=Dhaka')->assertStatus(429)->assertHeader('Retry-After', '2');
        Cache::forget('places:next-request');
        $lock = Cache::lock('places:provider-lock', 15);
        $this->assertTrue($lock->get());
        try { $this->getJson('/api/locations/search?q=Dhaka')->assertStatus(429); }
        finally { $lock->release(); }
        Http::assertNothingSent();
    }

    public function test_empty_results_are_cached_and_work_with_bangla_queries(): void
    {
        Http::fake(['places.example.test/*' => Http::response(['features' => []])]);
        $url = '/api/locations/search?q='.urlencode('ঢাকা');
        $this->getJson($url)->assertOk()->assertExactJson(['data' => []]);
        $this->getJson($url)->assertOk();
        Http::assertSentCount(1);
    }

    public function test_provider_errors_keep_details_private_and_release_the_lock(): void
    {
        Http::fake(['places.example.test/*' => Http::response('private upstream error', 500)]);
        $this->getJson('/api/locations/search?q=Dhaka')->assertStatus(503)
            ->assertJsonPath('message', 'Place search is unavailable. You can still choose a point on the map.');
        $lock = Cache::lock('places:provider-lock', 15);
        $this->assertTrue($lock->get()); $lock->release();
        Cache::forget('places:next-request');
        Http::fake(['places.example.test/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('private network detail')]);
        $this->getJson('/api/locations/search?q=Dhaka')->assertStatus(503)
            ->assertJsonPath('message', 'Place search is unavailable. You can still choose a point on the map.');
    }
}
