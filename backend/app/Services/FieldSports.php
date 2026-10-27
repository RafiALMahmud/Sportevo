<?php

namespace App\Services;

use App\Models\Sport;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FieldSports
{
    public static function canonicalName(string $name): string
    {
        $name = Str::squish($name);

        return in_array(mb_strtolower($name), ['football', 'futsal', 'ফুটবল', 'ফুটসাল'], true) ? 'Football' : $name;
    }

    public static function rules(): array
    {
        return [
            'sports' => ['required_without:custom_sport', 'array', 'max:20'],
            'sports.*' => ['integer', 'distinct', 'exists:sports,id'],
            'custom_sport' => ['nullable', 'string', 'min:2', 'max:80', 'regex:/^[\pL\pN][\pL\pN\pM .&\x{27}()\/+-]*$/u'],
        ];
    }

    // Call inside the same transaction that creates/updates the field.
    public static function ids(array $data): array
    {
        $ids = array_map('intval', $data['sports'] ?? []);
        if (! empty($data['custom_sport'])) {
            $name = self::canonicalName($data['custom_sport']);
            $normalized = mb_strtolower($name);
            $slug = Str::slug($normalized);
            if ($slug === '') {
                $slug = 'sport-'.substr(hash('sha256', $normalized), 0, 24);
            }
            $sport = Sport::firstOrCreate(['slug' => $slug], ['name' => $name]);
            $ids[] = $sport->id;
        }
        $ids = array_values(array_unique($ids));
        if (count($ids) > 20) {
            throw ValidationException::withMessages(['sports' => 'Choose up to 20 sports, including your other sport.']);
        }

        return $ids;
    }
}
