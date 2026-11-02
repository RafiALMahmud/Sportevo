<?php

namespace App\Services;

use App\Models\FeaturedPlacement;
use App\Models\FeaturedRequest;
use App\Models\FeaturedSetting;
use App\Models\Turf;
use Illuminate\Support\Facades\DB;

class FeaturedComplexes
{
    public const PLANS = [15 => 150, 30 => 300, 60 => 500];
    public const CAPACITY = 9;

    public static function plans(): array
    {
        return collect(self::PLANS)->map(fn ($price, $days) => ['days' => $days, 'amount' => $price])->values()->all();
    }

    public static function eligible()
    {
        return Turf::where('is_approved', true)->whereHas('fields')
            ->whereHas('manager', fn ($query) => $query->whereNull('users.deleted_at'));
    }

    public static function reserveCapacity(int $turfId): void
    {
        // All placement/checkout mutations take the same singleton row lock first.
        FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
        abort_unless(self::eligible()->whereKey($turfId)->exists(), 422, 'Only an approved, active complex with fields can be featured.');
        $occupied = self::reservations();
        abort_if(! (clone $occupied)->where('turf_id', $turfId)->exists() && $occupied->count() >= self::CAPACITY,
            409, 'All nine featured places are occupied. Contact SportEvo before paying or try again later.');
    }

    public static function publicComplex(Turf $turf): array
    {
        return ['id' => $turf->id, 'name' => $turf->name, 'location' => $turf->location,
            'photos' => $turf->photos->take(1)->map(fn ($photo) => ['url' => $photo->url])->values(),
            'fields' => $turf->fields->map(fn ($field) => ['id' => $field->id, 'name' => $field->name,
                'pricing_mode' => $field->pricing_mode, 'price_per_slot' => $field->price_per_slot,
                'price_per_hour' => $field->price_per_hour, 'sports' => $field->sports->map(fn ($sport) => $sport->only('id', 'name', 'slug'))]),
        ];
    }

    public static function reservations()
    {
        $ids = FeaturedPlacement::reserved()->select('turf_id')->union(
            FeaturedRequest::whereIn('status', ['awaiting_payment', 'submitted'])->select('turf_id'));
        return DB::query()->fromSub($ids, 'reserved_features')->whereIn('turf_id', self::eligible()->select('turfs.id'));
    }
}
