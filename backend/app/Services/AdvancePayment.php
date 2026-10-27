<?php

namespace App\Services;

use App\Http\Controllers\Api\BookingController;
use App\Models\Booking;
use App\Models\Field;
use App\Models\Turf;
use App\Models\WalletEntry;
use Illuminate\Support\Facades\DB;

class AdvancePayment
{
    public const SETTINGS = ['advance_enabled', 'advance_amount', 'advance_window_minutes', 'payment_provider', 'payment_number'];

    public static function rules(bool $registration = false): array
    {
        return [
            'advance_enabled' => ['sometimes', 'boolean'],
            'advance_amount' => ['sometimes', 'required', 'numeric', 'min:0.01', 'max:100000'],
            'advance_window_minutes' => ['sometimes', 'required', 'integer', 'min:30', 'max:10080'],
            'payment_provider' => [$registration ? 'required' : 'sometimes', 'required', 'string', 'max:80'],
            'payment_number' => [$registration ? 'required' : 'sometimes', 'required', 'string', 'min:7', 'max:40', 'regex:/^[+0-9][0-9 ()-]+$/'],
        ];
    }

    public static function snapshot(Turf $turf, float $price): array
    {
        $required = $turf->advance_enabled && $price > 0;
        abort_if($required && (! $turf->payment_number || ! $turf->payment_provider), 422, 'This complex must set up its payment number before accepting advance-payment requests.');

        return [
            'advance_required' => $required, 'advance_status' => $required ? 'awaiting_acceptance' : 'not_required',
            'advance_amount' => $required ? min(round($price, 2), (float) $turf->advance_amount) : 0,
            'advance_window_minutes' => $required ? $turf->advance_window_minutes : null,
            'payment_provider' => $required ? $turf->payment_provider : null,
            'payment_number' => $required ? $turf->payment_number : null,
        ];
    }

    public static function chargeCommission(Booking $booking, ?int $actorId): void
    {
        $amount = round((float) $booking->price * (float) $booking->commission_rate / 100, 2);
        $booking->update(['commission_amount' => $amount]);
        WalletEntry::firstOrCreate(['booking_id' => $booking->id], [
            'turf_id' => $booking->turf_id, 'type' => 'commission_charge', 'amount' => $amount,
            'note' => "Commission for booking #{$booking->id}", 'created_by' => $actorId,
        ]);
    }

    public function lock(int $id): Booking
    {
        $candidate = Booking::findOrFail($id);
        Turf::withTrashed()->whereKey($candidate->turf_id)->lockForUpdate()->firstOrFail();
        Field::withTrashed()->whereKey($candidate->field_id)->lockForUpdate()->firstOrFail();

        return Booking::whereKey($id)->lockForUpdate()->firstOrFail();
    }

    public function expire(int $id): bool
    {
        return DB::transaction(function () use ($id) {
            $booking = $this->lock($id);
            if ($booking->status !== 'booked' || $booking->advance_status !== 'awaiting_payment' ||
                ! $booking->advance_due_at || $booking->advance_due_at->isFuture()) {
                return false;
            }
            $booking->update(['status' => 'cancelled', 'advance_status' => 'expired', 'decided_at' => now()]);
            BookingController::releaseSlot($booking);
            ActivityLog::record('booking.advance_expired', ['booking_id' => $booking->id]);
            app(BookingNotificationService::class)->advanceUpdate($booking, 'Advance payment deadline expired', 'The advance-payment deadline passed without a submitted payment reference. The slot has been released.');

            return true;
        });
    }

    public function expireDue(?int $turfId = null, ?int $userId = null): int
    {
        $count = 0;
        Booking::where('status', 'booked')->where('advance_status', 'awaiting_payment')->where('advance_due_at', '<=', now())
            ->when($turfId, fn ($query) => $query->where('turf_id', $turfId))
            ->when($userId, fn ($query) => $query->where('user_id', $userId))
            ->select('id')->chunkById(100, function ($rows) use (&$count) {
                foreach ($rows as $row) {
                    $count += (int) $this->expire($row->id);
                }
            });

        return $count;
    }
}
