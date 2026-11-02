<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PlaceSearch
{
    public function search(string $query): array
    {
        $endpoint = config('services.places.url');
        $key = 'places:v1:'.hash('sha256', $endpoint.'|'.mb_strtolower($query));
        if (($cached = Cache::get($key)) !== null) return $cached;

        // Serialize requests across users and workers; repeated searches use the cache.
        $lock = Cache::lock('places:provider-lock', 15);
        if (! $lock->get()) $this->busy();
        try {
            if (($cached = Cache::get($key)) !== null) return $cached;
            if ((float) Cache::get('places:next-request', 0) > microtime(true)) $this->busy();
            Cache::put('places:next-request', microtime(true) + 1.1, 5);
            try {
                $response = Http::acceptJson()->withUserAgent('SportEvo/1.0 (+https://sportevo.games)')
                    ->connectTimeout(3)->timeout(8)->get($endpoint, [
                        'q' => $query, 'limit' => 5, 'bbox' => '88,20.3,92.8,26.7',
                        'countrycode' => 'BD', 'lang' => 'en',
                    ]);
            } catch (\Throwable $e) {
                throw new HttpException(503, 'Place search is unavailable. You can still choose a point on the map.');
            }
            if (! $response->successful() || ! is_array($response->json('features'))) {
                throw new HttpException(503, 'Place search is unavailable. You can still choose a point on the map.');
            }
            $places = [];
            foreach (array_slice($response->json('features'), 0, 5) as $feature) {
                if (! is_array($feature)) continue;
                $properties = $feature['properties'] ?? [];
                $coords = $feature['geometry']['coordinates'] ?? [];
                if (! is_array($properties) || ! is_array($coords)
                    || ($feature['geometry']['type'] ?? '') !== 'Point' || count($coords) !== 2
                    || ! is_numeric($coords[0]) || ! is_numeric($coords[1])
                    || $coords[0] < 88 || $coords[0] > 92.8 || $coords[1] < 20.3 || $coords[1] > 26.7
                    || strtoupper($properties['countrycode'] ?? '') !== 'BD') continue;
                $parts = [];
                foreach (['name', 'street', 'district', 'city', 'county', 'state', 'country'] as $field) {
                    if (is_string($properties[$field] ?? null) && trim($properties[$field]) !== '') {
                        $parts[] = mb_substr(trim($properties[$field]), 0, 200);
                    }
                }
                if (! $parts) continue;
                $places[] = ['name' => implode(', ', array_unique($parts)), 'lat' => (float) $coords[1], 'lng' => (float) $coords[0]];
            }
            Cache::put($key, $places, now()->addDays(7));
            return $places;
        } finally {
            $lock->release();
        }
    }

    private function busy(): never
    {
        throw new HttpException(429, 'Place search is busy. Please try again in a few seconds.', null, ['Retry-After' => '2']);
    }
}
