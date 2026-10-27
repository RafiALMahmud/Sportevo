<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CommissionRefund;
use App\Models\ContactMessage;
use App\Models\Turf;
use App\Models\User;
use App\Models\WalletEntry;
use App\Services\AdvancePayment;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function user(Request $request): JsonResponse
    {
        app(AdvancePayment::class)->expireDue(userId: $request->user()->id);
        $now = now();
        $bookings = Booking::with('turf:id,name,location,price_per_slot', 'field:id,name', 'cancellationRequest')->where('user_id', $request->user()->id)->where('status', '!=', 'available')->orderByDesc('start_time')->get();

        return response()->json(['upcoming' => $bookings->filter(fn ($b) => $b->status === 'booked' && $b->start_time->greaterThan($now))->values(),
            'requests' => $bookings->where('status', 'pending')->values(),
            'past' => $bookings->filter(fn ($b) => ! ($b->status === 'pending' || ($b->status === 'booked' && $b->start_time->greaterThan($now))))->values(),
            'stats' => ['totalBookings' => $bookings->whereIn('status', ['booked', 'completed'])->count(), 'completed' => $bookings->where('status', 'completed')->count(), 'pendingRequests' => $bookings->where('status', 'pending')->count()]]);
    }

    public function turf(Request $request): JsonResponse
    {
        $ownedTurfs = Turf::withTrashed()->where('turf_manager_id', $request->user()->id)->get();
        $turf = $request->filled('turf_id') ? $ownedTurfs->firstWhere('id', $request->integer('turf_id')) : $ownedTurfs->first();
        if (! $turf) {
            return response()->json(['message' => 'No complex registered for this account.'], 404);
        }
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        $todaysBookings = Booking::with('user:id,name,email,phone', 'field:id,name', 'cancellationRequest')->where('turf_id', $turf->id)->where('start_time', '>=', Carbon::today())->where('start_time', '<', Carbon::tomorrow())->orderBy('start_time')->get();
        $requests = Booking::with('user:id,name,email,phone', 'field:id,name', 'cancellationRequest')->where('turf_id', $turf->id)->where('status', 'pending')->where('start_time', '>', now())->orderBy('start_time')->get();
        // Pending customers are anonymous until acceptance.
        $todaysBookings->each->forOwner();
        $requests->each->forOwner();
        $upcoming = Booking::with('user:id,name,email,phone', 'field:id,name', 'cancellationRequest')->where('turf_id', $turf->id)->where('status', 'booked')->where('start_time', '>', now())->orderBy('start_time')->take(10)->get();

        return response()->json(['timezone' => config('app.timezone'), 'turf' => $turf->load(['sports:id,name,slug', 'photos', 'fields.sports', 'fields.photos', 'deletionRequest']), 'turfs' => $ownedTurfs->map->only(['id', 'name']),
            'todaysBookings' => $todaysBookings, 'upcoming' => $upcoming, 'requests' => $requests,
            'wallet' => ['balance' => $turf->walletBalance(), 'refunds' => $turf->refunds()->latest()->get(), 'entries' => $turf->walletEntries()->with('booking:id,start_time,price,commission_amount', 'creator:id,name')->latest()->take(10)->get()],
            'stats' => ['todayBookings' => $todaysBookings->where('status', 'booked')->count(), 'availableToday' => $todaysBookings->where('status', 'available')->count(), 'pendingRequests' => $requests->count(), 'totalBooked' => Booking::where('turf_id', $turf->id)->where('status', 'booked')->count(), 'completed' => Booking::where('turf_id', $turf->id)->where('status', 'completed')->count()]]);
    }

    public function platform(Request $request): JsonResponse
    {
        $statuses = Booking::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $complexCounts = Turf::selectRaw('is_approved, COUNT(*) as total')->groupBy('is_approved')->pluck('total', 'is_approved');
        $stats = ['totalUsers' => User::count(), 'totalTurfs' => (int) $complexCounts->sum(),
            'approvedTurfs' => (int) ($complexCounts[1] ?? 0), 'pendingTurfs' => (int) ($complexCounts[0] ?? 0),
            'totalBookings' => (int) ($statuses['booked'] ?? 0), 'completed' => (int) ($statuses['completed'] ?? 0), 'pendingRequests' => (int) ($statuses['pending'] ?? 0)];
        // Aggregate the ledger directly: never load every complex and run three queries each.
        $netCharges = WalletEntry::selectRaw("COALESCE(SUM(CASE WHEN type = 'commission_charge' THEN amount ELSE -amount END), 0) AS balance")->value('balance');
        $outstanding = round((float) $netCharges - (float) CommissionRefund::sum('amount'), 2);

        return response()->json(['stats' => $stats, 'newContactMessages' => ContactMessage::where('status', 'new')->count(),
            'bookingsByStatus' => collect(['available', 'unavailable', 'pending', 'booked', 'rejected', 'cancelled', 'completed'])->mapWithKeys(fn ($s) => [$s => (int) ($statuses[$s] ?? 0)]),
            'recentRegistrations' => User::with('role:id,name')->latest()->take(8)->get(['id', 'name', 'email', 'role_id', 'created_at']),
            'recentBookings' => Booking::with(['turf:id,name', 'field:id,name', 'user:id,name'])->latest()->take(8)->get(),
            'pendingApprovals' => Turf::with('manager:id,name,email')->where('is_approved', false)->latest()->get(),
            'requests' => Booking::with(['turf:id,name,location', 'field:id,name', 'user:id,name,email,phone'])->where('status', 'pending')->orderBy('start_time')->take(50)->get(),
            'walletOutstanding' => $outstanding]);
    }
}
