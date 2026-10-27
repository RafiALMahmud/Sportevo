<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Field;
use Carbon\CarbonInterface;
use Illuminate\Validation\Rule;

class FieldPricing
{
    public static function rules(array $input): array
    {
        $hourly = ($input['pricing_mode'] ?? 'slot') === 'hour';

        return [
            'pricing_mode' => ['sometimes', 'string', Rule::in(['slot', 'hour'])],
            'price_per_slot' => [Rule::requiredIf(! $hourly), 'nullable', 'numeric', 'between:0,100000'],
            'price_per_hour' => [Rule::requiredIf($hourly), 'nullable', 'numeric', 'between:0,100000'],
        ];
    }

    public static function attributes(array $data): array
    {
        $hourly = ($data['pricing_mode'] ?? 'slot') === 'hour';

        return [
            'pricing_mode' => $hourly ? 'hour' : 'slot',
            'price_per_slot' => $data['price_per_slot'] ?? 0,
            'price_per_hour' => $hourly ? $data['price_per_hour'] : null,
        ];
    }

    public static function quote(Field $field, CarbonInterface $start, CarbonInterface $end): float
    {
        return self::rateQuote($field->pricing_mode ?? 'slot', $field->pricing_mode === 'hour' ? $field->price_per_hour : $field->price_per_slot, $start, $end);
    }

    public static function forSlot(Booking $slot, ?Field $field = null): float
    {
        if ($slot->slot_rate !== null && in_array($slot->slot_pricing_mode, ['slot', 'hour'])) {
            return self::rateQuote($slot->slot_pricing_mode, $slot->slot_rate, $slot->start_time, $slot->end_time);
        }

        return self::quote($field ?? $slot->field, $slot->start_time, $slot->end_time);
    }

    public static function rateQuote(string $mode, mixed $rate, CarbonInterface $start, CarbonInterface $end): float
    {
        if ($mode !== 'hour') {
            return round((float) $rate, 2);
        }
        $rateCents = (int) round((float) $rate * 100);
        $seconds = $start->diffInSeconds($end, false);

        return round($rateCents * $seconds / 3600) / 100;
    }

    public static function overlapsPeak(CarbonInterface $start, CarbonInterface $end, string $peakStart, string $peakEnd): bool
    {
        // Include the preceding day's window for a peak period spanning midnight.
        for ($day = $start->copy()->startOfDay()->subDay(); $day->lessThan($end); $day = $day->addDay()) {
            $from = $day->copy()->setTimeFromTimeString($peakStart);
            $until = $day->copy()->setTimeFromTimeString($peakEnd);
            if ($until->lessThanOrEqualTo($from)) {
                $until = $until->addDay();
            }
            if ($start->lessThan($until) && $end->greaterThan($from)) {
                return true;
            }
        }

        return false;
    }
}
