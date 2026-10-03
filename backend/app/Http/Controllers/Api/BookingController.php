<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BookSlotRequest;
use App\Models\Booking;
use App\Models\Turf;
use App\Models\WalletEntry;
use App\Services\BookingNotificationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    public function __construct(private BookingNotificationService $notifications) {}

    public function store(BookSlotRequest $request): JsonResponse
    {
        $booking = DB::transaction(function () use ($request) {
            $turf = Turf::lockForUpdate()->findOrFail($request->integer('turf_id'));
            if (!$turf->is_approved) abort(403, 'This complex is not yet approved.');
            $start = Carbon::parse($request->start_time);
            $end = Carbon::parse($request->end_time);
            if ($start->lessThanOrEqualTo(now())) abort(422, 'Cannot request a slot in the past.');

            $slot = Booking::where('turf_id', $turf->id)->where('start_time', $start)->where('end_time', $end)
                ->where('status', 'available')->lockForUpdate()->first();
            if (!$slot) {
                $conflict = Booking::where('turf_id', $turf->id)->whereIn('status', ['pending', 'booked'])
                    ->where('start_time', '<', $end)->where('end_time', '>', $start)->lockForUpdate()->exists();
                if ($conflict) abort(409, 'This time range overlaps an existing request or booking.');
                $slot = new Booking(['turf_id' => $turf->id, 'start_time' => $start, 'end_time' => $end]);
            }
            $slot->fill(['user_id' => $request->user()->id, 'status' => 'pending', 'price' => $turf->price_per_slot,
                'commission_rate' => $turf->commission_rate, 'commission_amount' => null, 'decided_at' => null])->save();
            return $slot->fresh(['turf:id,name,location', 'user:id,name,email,phone']);
        });
        $this->notifications->requested($booking);
        return response()->json(['message' => 'Booking request sent. Awaiting approval from the complex owner.', 'booking' => $booking], 201);
    }

    public function accept(Booking $booking, Request $request): JsonResponse
    {
        $this->authorizeOwnerOrAdmin($request->user(), $booking);
        $booking = DB::transaction(function () use ($booking, $request) {
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            if ($booking->status !== 'pending') abort(422, 'Only pending requests can be accepted.');
            if ($booking->start_time->lessThanOrEqualTo(now())) abort(422, 'Cannot accept a slot in the past.');
            $conflict = Booking::where('turf_id', $booking->turf_id)->whereKeyNot($booking->id)->where('status', 'booked')
                ->where('start_time', '<', $booking->end_time)->where('end_time', '>', $booking->start_time)->lockForUpdate()->exists();
            if ($conflict) abort(409, 'This slot is no longer available.');
            $commission = round((float) $booking->price * (float) $booking->commission_rate / 100, 2);
            $booking->update(['status' => 'booked', 'commission_amount' => $commission, 'decided_at' => now()]);
            WalletEntry::firstOrCreate(['booking_id' => $booking->id], ['turf_id' => $booking->turf_id,
                'type' => 'commission_charge', 'amount' => $commission, 'note' => "Commission for booking #{$booking->id}", 'created_by' => $request->user()->id]);
            return $booking->fresh(['turf:id,name,location', 'user:id,name,email,phone']);
        });
        $this->notifications->decided($booking);
        if ($request->user()->isAdmin()) {
            $this->notifications->turfDecisionMade($booking, 'accepted', 'platform admin');
        }
        return response()->json(['message' => 'Booking request accepted and commission added to the wallet.', 'booking' => $booking]);
    }

    public function reject(Booking $booking, Request $request): JsonResponse
    {
        $this->authorizeOwnerOrAdmin($request->user(), $booking);
        $booking = DB::transaction(function () use ($booking) {
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            if ($booking->status !== 'pending') abort(422, 'Only pending requests can be rejected.');
            $booking->update(['status' => 'rejected', 'decided_at' => now()]);
            $this->makeSlotAvailable($booking);
            return $booking->fresh(['turf:id,name,location', 'user:id,name,email,phone']);
        });
        $this->notifications->decided($booking);
        if ($request->user()->isAdmin()) {
            $this->notifications->turfDecisionMade($booking, 'rejected', 'platform admin');
        }
        return response()->json(['message' => 'Booking request rejected. The slot is available again.', 'booking' => $booking]);
    }

    public function myBookings(Request $request): JsonResponse
    {
        $bookings = Booking::with('turf:id,name,location,price_per_slot')->where('user_id', $request->user()->id)
            ->whereNot('status', 'available')->orderByDesc('start_time')->get();
        $now = now();
        return response()->json(['requests' => $bookings->where('status', 'pending')->values(),
            'upcoming' => $bookings->filter(fn ($b) => $b->status === 'booked' && $b->start_time->greaterThan($now))->values(),
            'past' => $bookings->filter(fn ($b) => !($b->status === 'pending' || ($b->status === 'booked' && $b->start_time->greaterThan($now))))->values()]);
    }

    public function cancel(Booking $booking, Request $request): JsonResponse
    {
        $user = $request->user();
        $isOwner = $booking->turf->turf_manager_id === $user->id;
        if ($booking->user_id !== $user->id && !$user->isAdmin() && !$isOwner) abort(403, 'You cannot cancel this booking.');
        if (!in_array($booking->status, ['pending', 'booked'], true)) abort(422, 'This booking cannot be cancelled.');
        if ($booking->start_time->lessThanOrEqualTo(now())) abort(422, 'Cannot cancel a past booking.');
        DB::transaction(function () use ($booking) { $booking->update(['status' => 'cancelled', 'decided_at' => now()]); $this->makeSlotAvailable($booking); });
        $cancelledBy = $user->isAdmin() ? 'platform admin' : ($isOwner && $booking->user_id !== $user->id ? 'complex owner' : 'customer');
        $this->notifications->cancelled($booking, $cancelledBy);
        return response()->json(['message' => 'Booking cancelled successfully.', 'booking' => $booking->fresh('turf:id,name,location')]);
    }

    public function complete(Booking $booking, Request $request): JsonResponse
    {
        $this->authorizeOwnerOrAdmin($request->user(), $booking);
        if ($booking->status !== 'booked') abort(422, 'Only booked slots can be completed.');
        $booking->update(['status' => 'completed']);
        $this->notifications->completed($booking);
        return response()->json(['message' => 'Booking marked as completed.', 'booking' => $booking->fresh(['turf:id,name,location', 'user:id,name,email,phone'])]);
    }

    private function makeSlotAvailable(Booking $booking): void
    {
        Booking::firstOrCreate(['turf_id' => $booking->turf_id, 'start_time' => $booking->start_time,
            'end_time' => $booking->end_time, 'status' => 'available']);
    }

    private function authorizeOwnerOrAdmin($user, Booking $booking): void
    {
        if (!$user->isAdmin() && $booking->turf->turf_manager_id !== $user->id) abort(403, 'You cannot manage this booking.');
    }
}
