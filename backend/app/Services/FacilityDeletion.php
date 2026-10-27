<?php

namespace App\Services;

use App\Models\Field;
use App\Models\Turf;
use Illuminate\Support\Facades\DB;

class FacilityDeletion
{
    public function archiveField(Turf $turf, Field $field): void
    {
        abort_unless($field->turf_id === $turf->id, 404);
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        DB::transaction(function () use ($turf, $field) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = Field::where('turf_id', $turf->id)->whereKey($field->id)->lockForUpdate()->firstOrFail();
            abort_if($field->bookings()->whereIn('status', ['pending', 'booked'])->exists(), 409,
                'Resolve pending and accepted bookings on this field before deleting it.');
            $field->delete();
        });
    }

    public function archiveComplex(Turf $turf): void
    {
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        DB::transaction(function () use ($turf) {
            $turf = Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            abort_if($turf->bookings()->whereIn('status', ['pending', 'booked'])->exists(), 409,
                'Resolve pending and accepted bookings before deleting this complex.');
            foreach ($turf->fields()->orderBy('id')->lockForUpdate()->get() as $field) {
                $field->delete();
            }
            $turf->update(['is_approved' => false]);
            $turf->delete();
            // A direct admin deletion also resolves any outstanding owner deletion request.
            $turf->deletionRequest()->where('status', 'pending')->update([
                'status' => 'accepted', 'decided_by' => request()->user()?->id, 'decided_at' => now(),
            ]);
        });
    }
}
