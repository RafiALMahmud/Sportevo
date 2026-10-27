<?php

namespace App\Observers;

use App\Services\ActivityLog;
use Illuminate\Database\Eloquent\Model;

class ActivityObserver
{
    public function created(Model $model): void
    {
        $this->record($model, 'created');
    }

    public function updated(Model $model): void
    {
        $this->record($model, 'updated');
    }

    public function deleted(Model $model): void
    {
        $this->record($model, 'deleted');
    }

    private function record(Model $model, string $event): void
    {
        // Never put credentials, OTP hashes, or decrypted phone numbers in logs.
        $allowed = ['id', 'name', 'email', 'role_id', 'turf_id', 'field_id', 'user_id', 'booking_id', 'status', 'price',
            'price_per_slot', 'players_per_side', 'commission_rate', 'commission_amount', 'type', 'amount', 'owner_status', 'refund_status', 'rating', 'is_hidden', 'deleted_at',
            'start_time', 'end_time', 'slot_pricing_mode', 'slot_rate', 'is_peak', 'location', 'reason', 'comment', 'note', 'is_approved', 'turf_manager_id', 'owner_decided_by', 'refund_decided_by', 'decided_by',
            'unavailable_reason', 'unavailable_type', 'unavailable_by', 'unavailable_at', 'advance_required', 'advance_status', 'advance_amount',
            'advance_window_minutes', 'advance_due_at', 'payment_submitted_at', 'payment_confirmed_at', 'payment_confirmed_by'];
        ActivityLog::record(class_basename($model).'.'.$event, [
            'record_id' => $model->getKey(),
            'before' => array_intersect_key($model->getRawOriginal(), array_flip($allowed)),
            'after' => array_intersect_key($model->getAttributes(), array_flip($allowed)),
        ]);
    }
}
