<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssignRoleRequest;
use App\Http\Requests\SettleWalletRequest;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateCommissionRequest;
use App\Models\Booking;
use App\Models\Field;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Models\WalletEntry;
use App\Services\FacilityDeletion;
use App\Services\PersonalData;
use App\Services\TrackedMail;
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
        $query = Turf::withTrashed()->with('manager:id,name,email,phone', 'sports:id,name,slug')
            ->with(['fields' => fn ($query) => $query->withTrashed()->with('sports')->withCount([
                'bookings as active_bookings_count' => fn ($bookings) => $bookings->whereIn('status', ['pending', 'booked']),
            ])])
            ->withCount(['fields', 'bookings as active_bookings_count' => fn ($bookings) => $bookings->whereIn('status', ['pending', 'booked'])])
            ->withSum('commissionEntries as commission_total', 'amount')
            ->withSum('settlementEntries as settlement_total', 'amount')
            ->withSum('refunds as refund_total', 'amount');

        if ($request->has('status')) {
            if ($request->status === 'pending') {
                $query->whereNull('deleted_at')->where('is_approved', false);
            } elseif ($request->status === 'approved') {
                $query->where('is_approved', true);
            } elseif ($request->status === 'archived') {
                $query->onlyTrashed();
            }
        }

        if ($request->filled('search')) {
            $managerIds = PersonalData::matchingIds(User::class, $request->search, ['name', 'email']);
            $query->where(fn ($q) => $q->where('name', 'like', "%{$request->search}%")
                ->orWhere('location', 'like', "%{$request->search}%")
                ->orWhereIn('turf_manager_id', $managerIds));
        }

        $turfs = $query->orderBy('name')->paginate(min(100, max(1, $request->integer('per_page', 20))));

        $turfs->getCollection()->transform(fn ($turf) => $turf->setAttribute(
            'wallet_balance',
            round((float) $turf->commission_total - (float) $turf->settlement_total - (float) $turf->refund_total, 2)
        ));

        return response()->json($turfs);
    }

    public function approveTurf(Turf $turf): JsonResponse
    {
        DB::transaction(function () use ($turf) {
            $turf = Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $turf->update(['is_approved' => true]);
            TrackedMail::send($turf->manager->email, 'Complex approved', '<p>Your complex '.e($turf->name).' is approved and available for bookings.</p>');
        });

        return response()->json([
            'message' => 'Complex approved successfully.',
            'turf' => $turf->fresh('manager:id,name,email,phone', 'sports:id,name,slug'),
        ]);
    }

    public function rejectTurf(Turf $turf): JsonResponse
    {
        DB::transaction(function () use ($turf) {
            $turf = Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $turf->update(['is_approved' => false]);
            TrackedMail::send($turf->manager->email, 'Complex approval declined', '<p>Your complex '.e($turf->name).' is not approved. Please contact the platform admins.</p>');
        });

        return response()->json([
            'message' => 'Complex registration rejected.',
            'turf' => $turf->fresh('manager:id,name,email,phone'),
        ]);
    }

    public function destroyTurf(Turf $turf): JsonResponse
    {
        DB::transaction(function () use ($turf) {
            $turf = Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            WorkflowController::archive($turf);
        });

        return response()->json(['message' => 'Complex deleted successfully.']);
    }

    public function destroyField(Turf $turf, Field $field): JsonResponse
    {
        app(FacilityDeletion::class)->archiveField($turf, $field);

        return response()->json(['message' => 'Field deleted. Booking and photo history retained.']);
    }

    public function listUsers(Request $request): JsonResponse
    {
        $query = User::with('role:id,name')->withCount('turf');

        if ($request->has('role') && $request->role) {
            $query->whereHas('role', fn ($q) => $q->where('name', $request->role));
        }

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->whereIn('id', PersonalData::matchingIds(User::class, $search, ['name', 'email']));
        }

        $users = $query->latest('id')->paginate(min(100, max(1, $request->integer('per_page', 20))));

        return response()->json($users);
    }

    public function createUser(StoreUserRequest $request): JsonResponse
    {
        if ($request->role === 'superadmin' && ! $request->user()->hasRole('superadmin')) {
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

    public function destroyUser(Request $request, User $user): JsonResponse
    {
        $request->validate(['delete_complexes' => ['sometimes', 'boolean']]);
        $actor = $request->user();

        return DB::transaction(function () use ($request, $user, $actor) {
            $user = User::with('role')->whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($user->id === $actor->id) {
                abort(422, 'Use account settings to delete your own profile.');
            }

            // Superadmins are peer accounts: nobody may remove another superadmin.
            if ($user->hasRole('superadmin')) {
                abort(403, 'Superadmin accounts cannot be deleted.');
            }

            // Admins can create admins, but only a superadmin can remove one.
            if ($user->hasRole('admin') && ! $actor->hasRole('superadmin')) {
                abort(403, 'Only a superadmin can remove an admin.');
            }

            $complexes = Turf::where('turf_manager_id', $user->id)->orderBy('id')->lockForUpdate()->get();
            abort_if($complexes->isNotEmpty() && ! $request->boolean('delete_complexes'), 409,
                'Choose Delete owner & complex, or delete the complex first. Historical records are retained.');
            foreach ($complexes as $complex) {
                app(FacilityDeletion::class)->archiveComplex($complex);
            }
            $user->tokens()->delete();
            $user->increment('auth_version');
            $user->delete();

            return response()->json(['message' => $complexes->isNotEmpty()
                ? 'Owner and complex deleted. Booking, photo and wallet history retained.'
                : 'User deleted successfully.']);
        });
    }

    public function assignRole(AssignRoleRequest $request, User $user): JsonResponse
    {
        $role = Role::where('name', $request->role)->first();
        if (($request->role === 'superadmin' || $user->hasRole('superadmin')) && ! $request->user()->hasRole('superadmin')) {
            abort(403, 'Only a superadmin can manage superadmin access.');
        }
        if ($user->hasRole('admin') && ! $request->user()->hasRole('superadmin')) {
            abort(403, 'Only a superadmin can change an admin role.');
        }
        abort_if($request->role !== 'turf' && Turf::where('turf_manager_id', $user->id)->exists(), 409, 'An active complex must keep its owner role.');
        $user->update(['role_id' => $role->id]);

        return response()->json([
            'message' => 'Role assigned successfully.',
            'user' => $user->fresh('role:id,name'),
        ]);
    }

    public function listSlots(Request $request): JsonResponse
    {
        $query = Booking::with(['turf:id,name,location', 'field:id,name', 'cancellationRequest', 'user:id,name,email,phone']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $date = Carbon::parse($request->date)->startOfDay();
            $query->where('start_time', '>=', $date)->where('start_time', '<', $date->copy()->addDay());
        }

        if ($request->filled('turf_id')) {
            $query->where('turf_id', $request->integer('turf_id'));
        }
        if ($request->filled('field_id')) {
            $query->where('field_id', $request->integer('field_id'));
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $userIds = PersonalData::matchingIds(User::class, $search, ['name', 'email']);
            $query->where(function ($q) use ($search, $userIds) {
                $q->whereHas('turf', fn ($t) => $t->where('name', 'like', "%{$search}%"))
                    ->orWhereIn('user_id', $userIds);
            });
        }

        $slots = $query->orderBy('start_time')->paginate(min(100, max(1, $request->integer('per_page', 50))));

        return response()->json($slots);
    }

    public function updateCommission(UpdateCommissionRequest $request, Turf $turf): JsonResponse
    {
        $turf->update(['commission_rate' => $request->input('commission_rate')]);

        return response()->json(['message' => 'Commission rate updated. It applies to new requests only.', 'turf' => $turf]);
    }

    public function wallet(Request $request, Turf $turf): JsonResponse
    {
        return response()->json(['balance' => $turf->walletBalance(), 'refunds' => $turf->refunds()->latest()->get(), 'entries' => $turf->walletEntries()->with('booking:id,start_time,price,commission_amount', 'creator:id,name')->latest()->paginate(50)]);
    }

    public function settleWallet(SettleWalletRequest $request, Turf $turf): JsonResponse
    {
        return DB::transaction(function () use ($request, $turf) {
            $turf = Turf::withTrashed()->whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $balance = $turf->walletBalance();
            if ((float) $request->amount > $balance) {
                abort(422, 'Settlement cannot exceed the outstanding balance.');
            }
            $entry = WalletEntry::create(['turf_id' => $turf->id, 'type' => 'settlement', 'amount' => $request->amount, 'note' => $request->input('note'), 'created_by' => $request->user()->id]);

            return response()->json(['message' => 'Wallet settlement recorded.', 'entry' => $entry, 'balance' => $turf->walletBalance()], 201);
        });
    }
}
