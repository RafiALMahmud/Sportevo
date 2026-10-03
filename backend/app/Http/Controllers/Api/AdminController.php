<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Models\WalletEntry;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminController extends Controller
{
    public function getStats(Request $request): JsonResponse
    {
        $totalUsers = User::count();
        $totalTurfs = Turf::count();
        $approvedTurfs = Turf::where('is_approved', true)->count();
        $pendingTurfs = Turf::where('is_approved', false)->count();
        $totalRoles = Role::count();
        $pendingRequests = Booking::where('status', 'pending')->count();

        return response()->json([
            'totalUsers' => $totalUsers,
            'totalTurfs' => $totalTurfs,
            'approvedTurfs' => $approvedTurfs,
            'pendingTurfs' => $pendingTurfs,
            'totalRoles' => $totalRoles,
            'pendingRequests' => $pendingRequests,
        ]);
    }

    public function listTurfs(Request $request): JsonResponse
    {
        $query = Turf::with('manager:id,name,email,phone', 'sports:id,name,slug')
            ->withSum('walletEntries as owed', DB::raw("CASE WHEN type = 'commission_charge' THEN amount ELSE -amount END"));

        if ($request->has('status')) {
            if ($request->status === 'pending') {
                $query->where('is_approved', false);
            } elseif ($request->status === 'approved') {
                $query->where('is_approved', true);
            }
        }

        if ($request->filled('search')) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$request->search}%")
                ->orWhere('location', 'like', "%{$request->search}%")
                ->orWhereHas('manager', fn ($m) => $m->where('name', 'like', "%{$request->search}%")
                    ->orWhere('email', 'like', "%{$request->search}%")));
        }

        $turfs = $query->orderBy('name')->paginate($request->integer('per_page', 20));

        $turfs->getCollection()->transform(fn ($turf) => $turf->setAttribute('wallet_balance', round((float) $turf->owed, 2)));

        return response()->json($turfs);
    }

    public function approveTurf(Turf $turf): JsonResponse
    {
        $turf->update(['is_approved' => true]);

        return response()->json([
            'message' => 'Complex approved successfully.',
            'turf' => $turf->fresh('manager:id,name,email,phone', 'sports:id,name,slug'),
        ]);
    }

    public function rejectTurf(Turf $turf): JsonResponse
    {
        $turf->update(['is_approved' => false]);

        return response()->json([
            'message' => 'Complex registration rejected.',
            'turf' => $turf->fresh('manager:id,name,email,phone'),
        ]);
    }

    public function destroyTurf(Turf $turf): JsonResponse
    {
        $turf->delete();

        return response()->json(['message' => 'Complex deleted successfully.']);
    }

    public function listUsers(Request $request): JsonResponse
    {
        $query = User::with('role:id,name')->withCount('turf');

        if ($request->has('role') && $request->role) {
            $query->whereHas('role', fn ($q) => $q->where('name', $request->role));
        }

        if ($request->filled('search')) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$request->search}%")
                ->orWhere('email', 'like', "%{$request->search}%")
                ->orWhere('phone', 'like', "%{$request->search}%"));
        }

        $users = $query->orderBy('name')->paginate($request->integer('per_page', 20));

        return response()->json($users);
    }

    public function createUser(StoreUserRequest $request): JsonResponse
    {
        if ($request->role === 'superadmin' && !$request->user()->hasRole('superadmin')) {
            abort(403, 'Only a superadmin can create another superadmin.');
        }
        $role = Role::where('name', $request->role)->first();

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'role_id' => $role?->id,
            'email_verified_at' => now(),
        ]);

        return response()->json([
            'message' => 'User created successfully.',
            'user' => $user->fresh('role:id,name'),
        ], 201);
    }

    public function destroyUser(User $user): JsonResponse
    {
        if ($user->id === request()->user()->id) abort(422, 'You cannot delete your own account.');
        if ($user->hasRole('superadmin') && !request()->user()->hasRole('superadmin')) abort(403, 'Only a superadmin can delete a superadmin.');
        $user->delete();

        return response()->json(['message' => 'User deleted successfully.']);
    }

    public function assignRole(Request $request, User $user): JsonResponse
    {
        $request->validate([
            'role' => ['required', 'string', 'exists:roles,name'],
        ]);

        $role = Role::where('name', $request->role)->first();
        if (($request->role === 'superadmin' || $user->hasRole('superadmin')) && !$request->user()->hasRole('superadmin')) {
            abort(403, 'Only a superadmin can manage superadmin access.');
        }
        $user->update(['role_id' => $role->id]);

        return response()->json([
            'message' => 'Role assigned successfully.',
            'user' => $user->fresh('role:id,name'),
        ]);
    }

    public function listSlots(Request $request): JsonResponse
    {
        $query = Booking::with(['turf:id,name,location', 'user:id,name,email,phone']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $query->whereDate('start_time', Carbon::parse($request->date)->toDateString());
        }

        if ($request->filled('turf_id')) {
            $query->where('turf_id', $request->integer('turf_id'));
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereHas('turf', fn ($t) => $t->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%"));
            });
        }

        $slots = $query->orderBy('start_time')->paginate($request->integer('per_page', 50));

        return response()->json($slots);
    }

    public function updateCommission(Request $request, Turf $turf): JsonResponse
    {
        $request->validate(['commission_rate' => ['required', 'numeric', 'min:0', 'max:100']]);
        $turf->update(['commission_rate' => $request->input('commission_rate')]);
        return response()->json(['message' => 'Commission rate updated. It applies to new requests only.', 'turf' => $turf]);
    }

    public function wallet(Request $request, Turf $turf): JsonResponse
    {
        return response()->json(['balance' => $turf->walletBalance(), 'entries' => $turf->walletEntries()->with('booking:id,start_time,price,commission_amount', 'creator:id,name')->latest()->paginate(50)]);
    }

    public function settleWallet(Request $request, Turf $turf): JsonResponse
    {
        $request->validate(['amount' => ['required', 'numeric', 'gt:0'], 'note' => ['nullable', 'string', 'max:255']]);
        $balance = $turf->walletBalance();
        if ((float) $request->amount > $balance) abort(422, 'Settlement cannot exceed the outstanding balance.');
        $entry = WalletEntry::create(['turf_id' => $turf->id, 'type' => 'settlement', 'amount' => $request->amount, 'note' => $request->input('note'), 'created_by' => $request->user()->id]);
        return response()->json(['message' => 'Wallet settlement recorded.', 'entry' => $entry, 'balance' => $turf->walletBalance()], 201);
    }
}
