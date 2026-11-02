<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class ComplexLocation
{
    public static function rules(): array
    {
        return ['latitude' => ['nullable', 'required_with:longitude', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'required_with:latitude', 'numeric', 'between:-180,180']];
    }

    public static function attributes(Request $request): array
    {
        return $request->exists('latitude') || $request->exists('longitude')
            ? ['latitude' => $request->input('latitude'), 'longitude' => $request->input('longitude')] : [];
    }

    public static function filter(Builder $query, Request $request): void
    {
        $data = $request->validate([
            'lat' => ['required_with:lng,radius_km', 'numeric', 'between:-90,90'],
            'lng' => ['required_with:lat,radius_km', 'numeric', 'between:-180,180'],
            'radius_km' => ['sometimes', 'numeric', 'between:1,200'],
            'north' => ['required_with:south,east,west', 'numeric', 'between:-90,90', 'gt:south'],
            'south' => ['required_with:north,east,west', 'numeric', 'between:-90,90'],
            'east' => ['required_with:north,south,west', 'numeric', 'between:-180,180', 'gt:west'],
            'west' => ['required_with:north,south,east', 'numeric', 'between:-180,180'],
        ]);
        abort_if(isset($data['lat'], $data['north']), 422, 'Choose either a nearby search or a map area.');
        if (isset($data['north'])) {
            $query->whereBetween('latitude', [$data['south'], $data['north']])
                ->whereBetween('longitude', [$data['west'], $data['east']]);
        }
        if (isset($data['lat'], $data['lng'])) {
            $lat = (float) $data['lat']; $lng = (float) $data['lng']; $radius = (float) ($data['radius_km'] ?? 10);
            // A bounding box first keeps the distance calculation on a small candidate set.
            $latDelta = rad2deg($radius / 6371);
            $lngDelta = min(180, $latDelta / max(0.001, cos(deg2rad($lat))));
            $query->whereBetween('latitude', [max(-90, $lat - $latDelta), min(90, $lat + $latDelta)]);
            // Wrapped longitudes are uncommon for BD, but supported for valid global coordinates.
            $west = $lng - $lngDelta; $east = $lng + $lngDelta;
            if ($west < -180) $query->where(fn ($q) => $q->where('longitude', '>=', $west + 360)->orWhere('longitude', '<=', $east));
            elseif ($east > 180) $query->where(fn ($q) => $q->where('longitude', '>=', $west)->orWhere('longitude', '<=', $east - 360));
            else $query->whereBetween('longitude', [$west, $east]);
            $connection = $query->getModel()->getConnection();
            if ($connection->getDriverName() === 'sqlite') {
                foreach (['RADIANS' => 'deg2rad', 'SIN' => 'sin', 'COS' => 'cos', 'SQRT' => 'sqrt', 'ASIN' => 'asin'] as $sql => $php) {
                    $connection->getPdo()->sqliteCreateFunction($sql, $php, 1);
                }
                $connection->getPdo()->sqliteCreateFunction('POWER', 'pow', 2);
            }
            $distance = '6371 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(latitude - ?) / 2), 2) + COS(RADIANS(?)) * COS(RADIANS(latitude)) * POWER(SIN(RADIANS(longitude - ?) / 2), 2)))';
            $query->addSelect('turfs.*')->selectRaw($distance.' AS distance_km', [$lat, $lat, $lng])
                ->whereRaw($distance.' <= ?', [$lat, $lat, $lng, $radius])->orderBy('distance_km');
        }
        $query->orderBy('turfs.id');
    }
}
