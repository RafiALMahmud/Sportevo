<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BookSlotRequest;
use App\Http\Requests\CancelBookingRequest;
use App\Http\Requests\ManageBookingRequest;
use App\Jobs\ExpireBookingAdvance;
use App\Models\Booking;
use App\Models\Field;
use App\Models\Turf;
use App\Models\User;
use App\Services\AdvancePayment;
use App\Services\BookingNotificationService;
use App\Services\FieldPricing;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    public function __construct(private BookingNotificationService $notifications) {}

    public function store(BookSlotRequest $request)
    {
        abort_unless(filled($request->user()->phone), 422, 'Add your phone number in My Profile before requesting a slot.');
        app(AdvancePayment::class)->expireDue(turfId: $request->integer('turf_id'));
        app(AdvancePayment::class)->expireDue(userId: $request->user()->id);
        $booking = DB::transaction(function () use ($request) {
            // Serialize this customer's requests, including requests on different complexes.
            $customer = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $turf = Turf::whereKey($request->integer('turf_id'))->lockForUpdate()->firstOrFail();
            abort_unless($turf->is_approved, 403, 'This complex is not yet approved.');
            $field = $turf->fields()->whereKey($request->integer('field_id'))->lockForUpdate()->firstOrFail();
            $start = Carbon::parse($request->start_time)->setTimezone(config('app.timezone'));
            $end = Carbon::parse($request->end_time)->setTimezone(config('app.timezone'));
            abort_if($start->lessThanOrEqualTo(now()), 422, 'Cannot request a slot in the past.');
            $slot = Booking::where('field_id', $field->id)->where('start_time', $start)->where('end_time', $end)
                ->where('status', 'available')->first();
            abort_unless($slot, 409, 'Choose an available generated slot on this field.');
            $customerConflict = Booking::where('user_id', $customer->id)
                ->whereIn('status', ['pending', 'booked'])
                ->where('start_time', '<', $end)->where('end_time', '>', $start)->exists();
            abort_if($customerConflict, 409, 'You already have a pending request or accepted booking during this time. Wait for the pending request to be rejected or cancel it before requesting another overlapping slot.');
            $conflict = Booking::where('field_id', $field->id)->whereKeyNot($slot->id)
                ->whereIn('status', ['unavailable', 'pending', 'booked', 'completed'])->where('start_time', '<', $end)->where('end_time', '>', $start)->exists();
            abort_if($conflict, 409, 'This field is already reserved at that time.');
            $price = FieldPricing::forSlot($slot, $field);
            $slot->update(['user_id' => $request->user()->id, 'status' => 'pending', 'price' => $price,
                'commission_rate' => $turf->commission_rate, 'commission_amount' => null, 'decided_at' => null] + AdvancePayment::snapshot($turf, $price));
            $this->notifications->requested($slot);

            return $slot->fresh(['turf:id,name,location', 'field:id,name', 'user:id,name,email,phone']);
        });

        return response()->json(['message' => 'Booking request sent.', 'booking' => $booking], 201);
    }

    public function accept(ManageBookingRequest $request, Booking $booking)
    {
        $booking = DB::transaction(function () use ($booking, $request) {
            $this->lockField($booking);
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            abort_if($booking->turf->trashed() || ! $booking->turf->is_approved || $booking->field?->trashed(), 422, 'This complex or field is unavailable.');
            abort_unless($booking->status === 'pending', 422, 'Only pending requests can be accepted.');
            abort_if($booking->start_time->lessThanOrEqualTo(now()), 422, 'Cannot accept a slot in the past.');
            $conflict = Booking::where('field_id', $booking->field_id)->where('turf_id', $booking->turf_id)->whereKeyNot($booking->id)
                ->whereIn('status', ['unavailable', 'booked', 'completed'])->where('start_time', '<', $booking->end_time)->where('end_time', '>', $booking->start_time)->exists();
            abort_if($conflict, 409, 'This field is already booked.');
            $booking->update(['status' => 'booked', 'decided_at' => now()]);
            if ($booking->advance_required) {
                // The booking is held, but platform commission starts only once
                // receipt is confirmed (or the advance requirement is waived).
                $deadline = now()->addMinutes($booking->advance_window_minutes);
                $booking->update(['advance_status' => 'awaiting_payment', 'advance_due_at' => $deadline]);
                ExpireBookingAdvance::dispatch($booking->id)->delay($deadline)->afterCommit();
            } else {
                AdvancePayment::chargeCommission($booking, $request->user()->id);
            }
            $this->notifications->decided($booking);
            if ($request->user()->isAdmin()) {
                $this->notifications->turfDecisionMade($booking, 'accepted', 'platform admin');
            }

            return $booking->fresh(['turf:id,name,location', 'field:id,name', 'user:id,name,email,phone']);
        });

        return response()->json(['message' => $booking->advance_required ? 'Request accepted. The customer must submit advance payment before the deadline.' : 'Booking accepted. Commission added to the wallet.', 'booking' => $booking]);
    }

    public function reject(ManageBookingRequest $request, Booking $booking)
    {
        $booking = DB::transaction(function () use ($booking, $request) {
            $this->lockField($booking);
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            abort_unless($booking->status === 'pending', 422, 'Only pending requests can be rejected.');
            $booking->update(['status' => 'rejected', 'decided_at' => now()]);
            $this->makeSlotAvailable($booking);
            $this->notifications->decided($booking);
            if ($request->user()->isAdmin()) {
                $this->notifications->turfDecisionMade($booking, 'rejected', 'platform admin');
            }

            return $booking->fresh(['turf:id,name,location', 'field:id,name', 'user:id,name,email,phone']);
        });
        if (! $request->user()->isAdmin()) {
            $booking->forOwner();
        }

        return response()->json(['message' => 'Request rejected; slot released.', 'booking' => $booking]);
    }

    public function myBookings(Request $request)
    {
        app(AdvancePayment::class)->expireDue(userId: $request->user()->id);
        $bookings = Booking::with('turf:id,name,location,phone,email', 'field:id,name', 'cancellationRequest')->where('user_id', $request->user()->id)
            ->whereNot('status', 'available')->orderByDesc('start_time')->get();

        return response()->json([
            'requests' => $bookings->where('status', 'pending')->values(),
            'upcoming' => $bookings->filter(fn ($b) => $b->status === 'booked' && $b->end_time->isFuture())->values(),
            'past' => $bookings->filter(fn ($b) => $b->status !== 'pending' && ($b->status !== 'booked' || $b->end_time->isPast()))->values(),
        ]);
    }

    public function cancel(CancelBookingRequest $request, Booking $booking)
    {
        app(AdvancePayment::class)->expire($booking->id);
        $request->validate(['reason' => ['nullable', 'string', 'max:1500']]);
        $result = DB::transaction(function () use ($booking, $request) {
            $this->lockField($booking);
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            abort_unless(in_array($booking->status, ['pending', 'booked']), 422, 'This booking cannot be cancelled.');
            abort_if($booking->start_time->lessThanOrEqualTo(now()), 422, 'Cannot cancel a past booking.');
            if ($booking->status === 'pending' || $booking->advance_status === 'awaiting_payment') {
                $booking->update(['status' => 'cancelled', 'decided_at' => now(), 'advance_status' => $booking->advance_required ? 'cancelled' : $booking->advance_status]);
                $this->makeSlotAvailable($booking);
                $this->notifications->cancelled($booking, 'customer');

                return ['message' => 'Pending request cancelled. No commission was charged.'];
            }
            $existing = $booking->cancellationRequest;
            abort_if($existing && $existing->owner_status !== 'rejected', 409, 'A cancellation request already exists.');
            $cancellation = $booking->cancellationRequest()->updateOrCreate(['booking_id' => $booking->id], [
                'requested_by' => $request->user()->id, 'reason' => $request->input('reason'), 'owner_status' => 'pending',
                'refund_status' => 'awaiting_owner', 'owner_decided_by' => null, 'owner_decided_at' => null,
            ]);
            $this->notifications->cancellationProgress($booking, "Cancellation requested for booking #{$booking->id}. The owner must accept before an admin can consider reversing commission.");

            return ['message' => 'Cancellation requested. The slot stays reserved until the owner accepts.', 'cancellation' => $cancellation];
        });

        return response()->json($result);
    }

    public function complete(ManageBookingRequest $request, Booking $booking)
    {
        DB::transaction(function () use ($booking) {
            $this->lockField($booking);
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            abort_unless($booking->status === 'booked', 422, 'Only accepted bookings can be completed.');
            abort_if($booking->advance_required && $booking->advance_status !== 'confirmed', 422, 'Confirm the advance payment before completing this booking.');
            abort_if($booking->end_time->isFuture(), 422, 'The booking must end before it can be completed.');
            abort_if($booking->cancellationRequest?->owner_status === 'pending', 422, 'Decide the pending cancellation first.');
            $booking->update(['status' => 'completed']);
            $this->notifications->completed($booking);
        });

        return response()->json(['message' => 'Booking completed.']);
    }

    public static function releaseSlot(Booking $booking): void
    {
        Booking::firstOrCreate(['turf_id' => $booking->turf_id, 'field_id' => $booking->field_id,
            'start_time' => $booking->start_time, 'end_time' => $booking->end_time, 'status' => 'available'],
            $booking->only(['slot_pricing_mode', 'slot_rate', 'is_peak']));
    }

    private function makeSlotAvailable(Booking $booking): void
    {
        self::releaseSlot($booking);
    }

    private function lockField(Booking $booking): void
    {
        Turf::withTrashed()->whereKey($booking->turf_id)->lockForUpdate()->firstOrFail();
        if ($booking->field_id) {
            Field::withTrashed()->whereKey($booking->field_id)->lockForUpdate()->firstOrFail();
        }
    }
}
