<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Turf;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function user(Request $request): JsonResponse
    {
        $now = now();
        $bookings = Booking::with('turf:id,name,location,price_per_slot')->where('user_id', $request->user()->id)->where('status', '!=', 'available')->orderByDesc('start_time')->get();
        return response()->json(['upcoming' => $bookings->filter(fn ($b) => $b->status === 'booked' && $b->start_time->greaterThan($now))->values(),
            'requests' => $bookings->where('status', 'pending')->values(),
            'past' => $bookings->filter(fn ($b) => !($b->status === 'pending' || ($b->status === 'booked' && $b->start_time->greaterThan($now))))->values(),
            'stats' => ['totalBookings' => $bookings->whereIn('status', ['booked', 'completed'])->count(), 'completed' => $bookings->where('status', 'completed')->count(), 'pendingRequests' => $bookings->where('status', 'pending')->count()]]);
    }

    public function turf(Request $request): JsonResponse
    {
        $ownedTurfs = Turf::where('turf_manager_id', $request->user()->id)->get();
        $turf = $request->filled('turf_id') ? $ownedTurfs->firstWhere('id', $request->integer('turf_id')) : $ownedTurfs->first();
        if (!$turf) return response()->json(['message' => 'No complex registered for this account.'], 404);
        $todaysBookings = Booking::with('user:id,name,email,phone')->where('turf_id', $turf->id)->whereDate('start_time', Carbon::today())->orderBy('start_time')->get();
        $requests = Booking::with('user:id,name,email,phone')->where('turf_id', $turf->id)->where('status', 'pending')->where('start_time', '>', now())->orderBy('start_time')->get();
        // Pending customers are anonymous until acceptance.
        $todaysBookings->where('status', 'pending')->each(fn ($b) => $b->unsetRelation('user'));
        $requests->each(fn ($b) => $b->unsetRelation('user'));
        $upcoming = Booking::with('user:id,name,email,phone')->where('turf_id', $turf->id)->where('status', 'booked')->where('start_time', '>', now())->orderBy('start_time')->take(10)->get();
        return response()->json(['turf' => $turf->load(['sports:id,name,slug', 'photos']), 'turfs' => $ownedTurfs->map->only(['id', 'name']),
            'todaysBookings' => $todaysBookings, 'upcoming' => $upcoming, 'requests' => $requests,
            'wallet' => ['balance' => $turf->walletBalance(), 'entries' => $turf->walletEntries()->with('booking:id,start_time,price,commission_amount', 'creator:id,name')->latest()->take(10)->get()],
            'stats' => ['todayBookings' => $todaysBookings->where('status', 'booked')->count(), 'availableToday' => $todaysBookings->where('status', 'available')->count(), 'pendingRequests' => $requests->count(), 'totalBooked' => Booking::where('turf_id', $turf->id)->where('status', 'booked')->count(), 'completed' => Booking::where('turf_id', $turf->id)->where('status', 'completed')->count()]]);
    }

    public function platform(Request $request): JsonResponse
    {
        $stats = ['totalUsers' => User::count(), 'totalTurfs' => Turf::count(), 'approvedTurfs' => Turf::where('is_approved', true)->count(), 'pendingTurfs' => Turf::where('is_approved', false)->count(), 'totalBookings' => Booking::where('status', 'booked')->count(), 'completed' => Booking::where('status', 'completed')->count(), 'pendingRequests' => Booking::where('status', 'pending')->count()];
        return response()->json(['stats' => $stats,
            'bookingsByStatus' => collect(['available', 'pending', 'booked', 'rejected', 'cancelled', 'completed'])->mapWithKeys(fn ($s) => [$s => Booking::where('status', $s)->count()]),
            'recentRegistrations' => User::with('role:id,name')->latest()->take(8)->get(['id', 'name', 'email', 'role_id', 'created_at']),
            'recentBookings' => Booking::with(['turf:id,name', 'user:id,name'])->latest()->take(8)->get(),
            'pendingApprovals' => Turf::with('manager:id,name,email')->where('is_approved', false)->latest()->get(),
            'requests' => Booking::with(['turf:id,name,location', 'user:id,name,email,phone'])->where('status', 'pending')->orderBy('start_time')->take(50)->get(),
            'walletOutstanding' => Turf::all()->sum(fn ($turf) => $turf->walletBalance())]);
    }
}
