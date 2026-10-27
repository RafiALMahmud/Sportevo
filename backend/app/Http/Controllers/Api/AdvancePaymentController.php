<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ManageBookingRequest;
use App\Models\Booking;
use App\Models\Turf;
use App\Services\ActivityLog;
use App\Services\AdvancePayment;
use App\Services\BookingNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdvancePaymentController extends Controller
{
    private function authorizeSettings(Request $request, Turf $turf): void
    {
        abort_unless($request->user()->isAdmin() || ($request->user()->hasRole('turf') && $turf->turf_manager_id === $request->user()->id), 403);
    }

    public function settings(Request $request, Turf $turf)
    {
        $this->authorizeSettings($request, $turf);

        return response()->json(['settings' => $turf->only(AdvancePayment::SETTINGS)]);
    }

    public function updateSettings(Request $request, Turf $turf)
    {
        $this->authorizeSettings($request, $turf);
        $data = $request->validate(AdvancePayment::rules());

        return DB::transaction(function () use ($turf, $data) {
            $turf = Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $turf->fill($data);
            abort_if($turf->advance_enabled && (! $turf->payment_number || ! trim($turf->payment_provider)), 422, 'Add a payment provider and number before enabling advance payments.');
            $turf->save();
            ActivityLog::record('complex.advance_settings_updated', ['turf_id' => $turf->id, 'advance_enabled' => $turf->advance_enabled]);

            return response()->json(['message' => 'Advance payment settings saved. Existing booking terms are unchanged.', 'settings' => $turf->only(AdvancePayment::SETTINGS)]);
        });
    }

    public function inbox(Request $request, Turf $turf, AdvancePayment $payments)
    {
        $this->authorizeSettings($request, $turf);
        $payments->expireDue(turfId: $turf->id);

        return response()->json(Booking::where('turf_id', $turf->id)->where('status', 'booked')
            ->whereIn('advance_status', ['awaiting_payment', 'submitted'])
            ->with('user:id,name,email,phone', 'field:id,name', 'cancellationRequest')->orderByRaw("CASE WHEN advance_status = 'submitted' THEN 0 ELSE 1 END")
            ->orderBy('advance_due_at')->paginate(25));
    }

    public function submit(Request $request, Booking $booking, AdvancePayment $payments)
    {
        abort_unless($request->user()->hasRole('user') && $booking->user_id === $request->user()->id, 403);
        $data = $request->validate(['reference' => ['required', 'string', 'min:2', 'max:160']]);
        $payments->expire($booking->id);

        return DB::transaction(function () use ($booking, $payments, $data) {
            $booking = $payments->lock($booking->id);
            abort_unless($booking->status === 'booked' && $booking->advance_status === 'awaiting_payment' && $booking->advance_due_at?->isFuture(), 409, 'This booking is not awaiting payment or its deadline has passed.');
            $reference = trim($data['reference']);
            abort_if(mb_strlen($reference) < 2, 422, 'Enter a transaction ID or payment reference.');
            $booking->update(['payment_reference' => $reference, 'payment_submitted_at' => now(), 'advance_status' => 'submitted', 'payment_note' => null]);
            ActivityLog::record('booking.advance_submitted', ['booking_id' => $booking->id, 'reference' => $reference]);
            app(BookingNotificationService::class)->advanceUpdate($booking, 'Advance payment submitted', 'A payment reference was submitted. The slot is reserved while the owner checks receipt.');

            return response()->json(['message' => 'Payment reference sent. Your slot is held for owner review.', 'booking' => $booking]);
        });
    }

    public function confirm(ManageBookingRequest $request, Booking $booking, AdvancePayment $payments)
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $payments->expire($booking->id);

        return DB::transaction(function () use ($booking, $payments, $request, $data) {
            $booking = $payments->lock($booking->id);
            abort_unless($booking->status === 'booked' && in_array($booking->advance_status, ['awaiting_payment', 'submitted']), 409, 'This booking cannot have its advance confirmed.');
            abort_if($booking->advance_status === 'awaiting_payment' && ! $booking->advance_due_at?->isFuture(), 409, 'The payment deadline has passed.');
            abort_if($booking->cancellationRequest?->owner_status === 'pending', 409, 'Decide the cancellation request before confirming payment.');
            $booking->update(['advance_status' => 'confirmed', 'payment_confirmed_at' => now(), 'payment_confirmed_by' => $request->user()->id, 'payment_note' => $data['note'] ?? null]);
            AdvancePayment::chargeCommission($booking, $request->user()->id);
            ActivityLog::record('booking.advance_confirmed', ['booking_id' => $booking->id, 'direct_confirmation' => ! $booking->payment_submitted_at]);
            app(BookingNotificationService::class)->advanceUpdate($booking, 'Advance payment confirmed', 'The owner confirmed receipt of your advance. Your booking is confirmed.');

            return response()->json(['message' => 'Advance receipt confirmed. Booking confirmed and commission recorded.', 'booking' => $booking]);
        });
    }

    public function reject(ManageBookingRequest $request, Booking $booking, AdvancePayment $payments)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:2', 'max:500']]);
        DB::transaction(function () use ($booking, $payments, $data) {
            $booking = $payments->lock($booking->id);
            abort_unless($booking->status === 'booked' && $booking->advance_status === 'submitted', 409, 'Only a submitted payment reference can be rejected.');
            abort_if($booking->cancellationRequest?->owner_status === 'pending', 409, 'Decide the cancellation request before rejecting payment.');
            $booking->update(['advance_status' => 'awaiting_payment', 'payment_note' => trim($data['reason'])]);
            ActivityLog::record('booking.advance_rejected', ['booking_id' => $booking->id, 'reason' => $data['reason']]);
            app(BookingNotificationService::class)->advanceUpdate($booking, 'Payment reference needs correction', 'The owner could not verify the reference. Check My Bookings for the reason and the original payment deadline.');
        });
        $expired = $payments->expire($booking->id);

        return response()->json(['message' => $expired ? 'Reference rejected and the elapsed payment deadline released the slot.' : 'Reference rejected. The customer can correct it before the original deadline.']);
    }

    public function waive(ManageBookingRequest $request, Booking $booking, AdvancePayment $payments)
    {
        $payments->expire($booking->id);

        return DB::transaction(function () use ($booking, $payments, $request) {
            $booking = $payments->lock($booking->id);
            abort_unless($booking->status === 'booked' && in_array($booking->advance_status, ['awaiting_payment', 'submitted']), 409, 'This booking cannot have its advance waived.');
            abort_if($booking->advance_status === 'awaiting_payment' && ! $booking->advance_due_at?->isFuture(), 409, 'The payment deadline has passed.');
            abort_if($booking->cancellationRequest?->owner_status === 'pending', 409, 'Decide the cancellation request before waiving payment.');
            $booking->update(['advance_required' => false, 'advance_status' => 'waived', 'payment_confirmed_by' => $request->user()->id, 'payment_note' => 'Advance requirement waived by owner/admin.']);
            AdvancePayment::chargeCommission($booking, $request->user()->id);
            ActivityLog::record('booking.advance_waived', ['booking_id' => $booking->id]);
            app(BookingNotificationService::class)->advanceUpdate($booking, 'Advance payment waived', 'The advance requirement was waived for your booking. Your booking is confirmed.');

            return response()->json(['message' => 'Advance waived. Booking confirmed and commission recorded.']);
        });
    }
}
