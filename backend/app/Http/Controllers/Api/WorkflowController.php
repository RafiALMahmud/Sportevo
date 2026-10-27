<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CancellationRequest;
use App\Models\CommissionRefund;
use App\Models\Field;
use App\Models\Turf;
use App\Models\TurfDeletionRequest;
use App\Models\User;
use App\Services\BookingNotificationService;
use App\Services\FacilityDeletion;
use App\Services\TrackedMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkflowController extends Controller
{
    public function cancellations(Request $request)
    {
        $query = CancellationRequest::with('booking.turf:id,name,turf_manager_id', 'booking.field:id,name', 'booking.user:id,name,email,phone');
        if (! $request->user()->isAdmin()) {
            $query->whereHas('booking.turf', fn ($q) => $q->where('turf_manager_id', $request->user()->id));
        }

        return response()->json($query->latest()->paginate(25));
    }

    public function ownerDecision(Request $request, CancellationRequest $cancellation)
    {
        $request->validate(['decision' => ['required', 'in:accepted,rejected']]);
        abort_unless($request->user()->hasRole('turf') && $cancellation->booking->turf->turf_manager_id === $request->user()->id, 403);
        DB::transaction(function () use ($request, $cancellation) {
            $booking = $cancellation->booking;
            Turf::withTrashed()->whereKey($booking->turf_id)->lockForUpdate()->firstOrFail();
            Field::whereKey($booking->field_id)->lockForUpdate()->firstOrFail();
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            $cancellation = CancellationRequest::lockForUpdate()->findOrFail($cancellation->id);
            abort_unless($cancellation->owner_status === 'pending' && $booking->status === 'booked', 422, 'Cancellation already decided or booking no longer accepted.');
            $accepted = $request->decision === 'accepted';
            $hasCommission = $booking->commission_amount !== null;
            $cancellation->update(['owner_status' => $request->decision, 'refund_status' => $accepted && $hasCommission ? 'pending' : 'not_eligible',
                'owner_decided_by' => $request->user()->id, 'owner_decided_at' => now()]);
            if ($accepted) {
                $booking->update(['status' => 'cancelled', 'decided_at' => now(), 'advance_status' => $booking->advance_required && ! $hasCommission ? 'cancelled' : $booking->advance_status]);
                BookingController::releaseSlot($booking);
            }
            app(BookingNotificationService::class)->cancellationProgress($booking, "Owner {$request->decision} cancellation for booking #{$booking->id}. ".($accepted ? ($hasCommission ? 'Commission remains owed until admin refund approval.' : 'No platform commission was charged. Any customer advance refund must be arranged with the owner.') : 'The booking remains reserved.'));
        });

        return response()->json(['message' => 'Cancellation decision recorded.']);
    }

    public function refundDecision(Request $request, CancellationRequest $cancellation)
    {
        $request->validate(['decision' => ['required', 'in:accepted,rejected']]);
        DB::transaction(function () use ($request, $cancellation) {
            Turf::withTrashed()->whereKey($cancellation->booking->turf_id)->lockForUpdate()->firstOrFail();
            $cancellation = CancellationRequest::lockForUpdate()->findOrFail($cancellation->id);
            abort_unless($cancellation->owner_status === 'accepted' && $cancellation->refund_status === 'pending', 422, 'The owner must accept cancellation before a refund decision.');
            if ($request->decision === 'accepted') {
                CommissionRefund::create(['turf_id' => $cancellation->booking->turf_id, 'booking_id' => $cancellation->booking_id,
                    'amount' => $cancellation->booking->commission_amount, 'created_by' => $request->user()->id]);
            }
            $cancellation->update(['refund_status' => $request->decision, 'refund_decided_by' => $request->user()->id, 'refund_decided_at' => now()]);
            app(BookingNotificationService::class)->cancellationProgress($cancellation->booking, "Admin {$request->decision} commission reversal for booking #{$cancellation->booking_id}. This decision affects the owner's platform debt, not a customer payment.");
        });

        return response()->json(['message' => $request->decision === 'accepted' ? 'Commission reversed in the owner wallet.' : 'Refund rejected. Commission remains owed.']);
    }

    public function requestDeletion(Request $request, Turf $turf)
    {
        abort_unless($request->user()->hasRole('turf') && $turf->turf_manager_id === $request->user()->id, 403);
        $request->validate(['reason' => ['required', 'string', 'max:1500']]);
        DB::transaction(function () use ($request, $turf) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $existing = $turf->deletionRequest;
            abort_if($existing && $existing->status !== 'rejected', 409, 'A deletion request already exists.');
            $turf->deletionRequest()->updateOrCreate(['turf_id' => $turf->id], ['reason' => $request->reason, 'status' => 'pending', 'decided_by' => null, 'decided_at' => null]);
            foreach (User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'superadmin']))->get() as $admin) {
                TrackedMail::send($admin->email, 'Complex deletion requested', '<p>'.e($turf->name).' requested deletion. Review the request in your admin dashboard.</p>');
            }
        });

        return response()->json(['message' => 'Complex deletion requested. An admin will review it.'], 201);
    }

    public function deletionRequests()
    {
        return response()->json(TurfDeletionRequest::with('turf.manager:id,name,email')->latest()->paginate(25));
    }

    public function deletionDecision(Request $request, TurfDeletionRequest $deletion)
    {
        $request->validate(['decision' => ['required', 'in:accepted,rejected']]);
        DB::transaction(function () use ($request, $deletion) {
            $turf = Turf::whereKey($deletion->turf_id)->lockForUpdate()->firstOrFail();
            $deletion = TurfDeletionRequest::lockForUpdate()->findOrFail($deletion->id);
            abort_unless($deletion->status === 'pending', 422, 'Request already decided.');
            if ($request->decision === 'accepted') {
                self::archive($turf);
            }
            $deletion->update(['status' => $request->decision, 'decided_by' => $request->user()->id, 'decided_at' => now()]);
            TrackedMail::send($turf->manager->email, 'Complex deletion decision', '<p>Your complex deletion request was '.e($request->decision).'.</p>');
        });

        return response()->json(['message' => 'Deletion decision recorded. History is retained.']);
    }

    public static function archive(Turf $turf): void
    {
        app(FacilityDeletion::class)->archiveComplex($turf);
    }
}
