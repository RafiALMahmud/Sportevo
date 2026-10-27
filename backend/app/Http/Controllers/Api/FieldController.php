<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Field;
use App\Models\Turf;
use App\Services\ActivityLog;
use App\Services\FieldPhotos;
use App\Services\FieldPricing;
use App\Services\FieldSports;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FieldController extends Controller
{
    public function store(Request $request, Turf $turf)
    {
        $this->owner($request, $turf);
        $data = $this->validateField($request);
        $field = app(FieldPhotos::class)->save($request->file('photos', []), function () use ($turf, $data) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = $turf->fields()->create(['name' => $data['name'], 'players_per_side' => $data['players_per_side'] ?? null] + FieldPricing::attributes($data));
            $ids = FieldSports::ids($data);
            $field->sports()->sync($ids);
            ActivityLog::record('Field.sports_selected', ['field_id' => $field->id, 'sports' => $ids]);

            return $field;
        });

        return response()->json(['message' => 'Field created.', 'field' => $field->load('sports', 'photos')], 201);
    }

    public function update(Request $request, Turf $turf, Field $field)
    {
        $this->owner($request, $turf);
        abort_unless($field->turf_id === $turf->id, 404);
        $data = $this->validateField($request);
        DB::transaction(function () use ($field, $data) {
            Turf::whereKey($field->turf_id)->lockForUpdate()->firstOrFail();
            $field = Field::whereKey($field->id)->lockForUpdate()->firstOrFail();
            $field->update(['name' => $data['name']] + array_intersect_key($data, ['players_per_side' => true]) + FieldPricing::attributes($data));
            $ids = FieldSports::ids($data);
            $field->sports()->sync($ids);
            ActivityLog::record('Field.sports_selected', ['field_id' => $field->id, 'sports' => $ids]);
        });

        return response()->json(['message' => 'Field updated. Existing quotes are unchanged.', 'field' => $field->fresh(['sports', 'photos'])]);
    }

    private function validateField(Request $request): array
    {
        return $request->validate(['name' => ['required', 'string', 'max:255'], 'players_per_side' => ['sometimes', 'nullable', 'integer', 'between:1,100']]
            + FieldPricing::rules($request->all()) + FieldSports::rules() + FieldPhotos::rules());
    }

    private function owner(Request $request, Turf $turf): void
    {
        abort_unless($request->user()->hasRole('turf') && $turf->turf_manager_id === $request->user()->id, 403);
    }
}
