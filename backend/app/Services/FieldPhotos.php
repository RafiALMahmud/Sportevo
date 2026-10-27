<?php

namespace App\Services;

use App\Models\Field;
use App\Models\Turf;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;

class FieldPhotos
{
    public static function rules(bool $required = false): array
    {
        return [
            'photos' => [$required ? 'required' : 'sometimes', 'bail', 'array', 'min:1', 'max:8'],
            'photos.*' => ['bail', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ];
    }

    // Database changes and file writes succeed together; failed writes leave no partial field/gallery.
    public function save(array $files, Closure $fieldProvider): Field
    {
        $paths = [];
        try {
            return DB::transaction(function () use ($files, $fieldProvider, &$paths) {
                $field = $fieldProvider();
                Turf::whereKey($field->turf_id)->lockForUpdate()->firstOrFail();
                $field = Field::whereKey($field->id)->lockForUpdate()->firstOrFail();
                abort_if($field->photos()->count() + count($files) > 24, 422, 'A field can have up to 24 photos. Delete an existing photo first.');
                $order = (int) $field->photos()->max('sort_order');
                foreach ($files as $file) {
                    $path = $file->store("turfs/{$field->turf_id}/fields/{$field->id}", 'public');
                    if ($path === false) {
                        throw new HttpException(503, 'Photo storage is unavailable. Please try again.');
                    }
                    $paths[] = $path;
                    $field->photos()->create(['turf_id' => $field->turf_id, 'path' => $path, 'sort_order' => ++$order]);
                }

                return $field;
            });
        } catch (\Throwable $error) {
            foreach ($paths as $path) {
                Storage::disk('public')->delete($path);
            }
            throw $error;
        }
    }
}
