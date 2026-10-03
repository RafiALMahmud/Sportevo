<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateSlotsRequest;
use App\Http\Requests\StoreTurfRequest;
use App\Models\Booking;
use App\Models\Turf;
use App\Models\TurfPhoto;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class TurfController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Turf::with(['sports:id,name,slug', 'photos:id,turf_id,path,sort_order'])->withCount('reviews')->withAvg('reviews', 'rating')
            ->where('is_approved', true);
        if ($request->filled('search')) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$request->search}%")->orWhere('location', 'like', "%{$request->search}%"));
        }
        if ($request->filled('sport')) {
            $query->whereHas('sports', fn ($q) => $q->whereRaw('LOWER(name) = ?', [strtolower($request->sport)])
                ->orWhereRaw('LOWER(slug) = ?', [strtolower($request->sport)]));
        }
        if ($request->filled('location')) $query->where('location', 'like', "%{$request->location}%");
        return response()->json($query->paginate($request->integer('per_page', 12)));
    }

    public function show(Turf $turf): JsonResponse
    {
        abort_unless($turf->is_approved, 404, 'Turf not found.');
        $turf->load(['sports:id,name,slug', 'photos:id,turf_id,path,sort_order', 'reviews' => fn ($q) => $q->with('user:id,name')->latest()->take(20)])
            ->loadCount('reviews')->loadAvg('reviews', 'rating');
        return response()->json(['turf' => $turf]);
    }

    public function store(StoreTurfRequest $request): JsonResponse
    {
        $turf = Turf::create($request->only(['name', 'email', 'phone', 'location', 'price_per_slot']) + [
            'commission_rate' => 10, 'turf_manager_id' => $request->user()->id, 'is_approved' => false,
        ]);
        $turf->sports()->sync($request->sports);
        return response()->json(['message' => 'Complex registered successfully. Pending admin approval.',
            'turf' => $turf->load('sports:id,name,slug')], 201);
    }

    public function updateMyTurf(Request $request): JsonResponse
    {
        $turf = $this->resolveManagedTurf($request);
        $request->validate([
            'name' => ['sometimes', 'string', 'max:255'], 'email' => ['sometimes', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'], 'location' => ['sometimes', 'string', 'max:255'],
            'price_per_slot' => ['sometimes', 'numeric', 'min:0'], 'sports' => ['nullable', 'array', 'min:1'],
            'sports.*' => ['integer', 'exists:sports,id'],
        ]);
        $turf->update($request->only(['name', 'email', 'phone', 'location', 'price_per_slot']));
        if ($request->has('sports')) $turf->sports()->sync($request->sports);
        return response()->json(['message' => 'Complex updated successfully.', 'turf' => $turf->fresh(['sports:id,name,slug', 'photos'])]);
    }

    public function myTurf(Request $request): JsonResponse
    {
        $turfs = Turf::where('turf_manager_id', $request->user()->id)->with(['sports:id,name,slug', 'photos'])->get();
        $selected = $request->filled('turf_id') ? $turfs->firstWhere('id', (int) $request->turf_id) : $turfs->first();
        if (!$selected && $request->filled('turf_id')) abort(403, 'You do not own this complex.');
        return response()->json(['turf' => $selected, 'turfs' => $turfs]);
    }

    public function generateSlots(GenerateSlotsRequest $request, Turf $turf): JsonResponse
    {
        $this->authorizeTurfAccess($request->user(), $turf);
        $start = Carbon::parse("{$request->date} {$request->start_time}");
        $end = Carbon::parse("{$request->date} {$request->end_time}");
        $duration = (int) $request->slot_duration;
        $slots = [];
        for ($cursor = $start->copy(); $cursor->copy()->addMinutes($duration)->lessThanOrEqualTo($end); $cursor->addMinutes($duration)) {
            $slot = Booking::firstOrCreate(['turf_id' => $turf->id, 'start_time' => $cursor->copy(),
                'end_time' => $cursor->copy()->addMinutes($duration), 'status' => 'available']);
            $slots[] = $slot;
        }
        return response()->json(['message' => count($slots)." slot(s) generated for {$request->date}.", 'slots' => $slots], 201);
    }

    public function schedule(Request $request, Turf $turf): JsonResponse
    {
        $this->authorizeTurfAccess($request->user(), $turf);
        $query = Booking::with('user:id,name,email,phone')->where('turf_id', $turf->id);
        if ($request->filled('date')) $query->whereDate('start_time', Carbon::parse($request->date)->toDateString());
        $bookings = $query->orderBy('start_time')->get();
        $bookings->where('status', 'pending')->each(fn ($booking) => $booking->unsetRelation('user'));
        return response()->json(['bookings' => $bookings]);
    }

    public function getSlots(Request $request, Turf $turf): JsonResponse
    {
        abort_unless($turf->is_approved, 404, 'Turf not found.');
        $query = Booking::where('turf_id', $turf->id)->where('status', 'available');
        if ($request->filled('date')) $query->whereDate('start_time', Carbon::parse($request->date)->toDateString());
        elseif ($request->filled('from') && $request->filled('to')) $query->whereBetween('start_time', [Carbon::parse($request->from), Carbon::parse($request->to)]);
        return response()->json(['slots' => $query->orderBy('start_time')->get(), 'price_per_slot' => $turf->price_per_slot]);
    }

    public function uploadPhotos(Request $request, Turf $turf): JsonResponse
    {
        $this->authorizeTurfAccess($request->user(), $turf);
        $request->validate(['photos' => ['required', 'array', 'max:8'], 'photos.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120']]);
        $offset = (int) $turf->photos()->max('sort_order');
        foreach ($request->file('photos') as $index => $file) {
            $turf->photos()->create(['path' => $file->store("turfs/{$turf->id}", 'public'), 'sort_order' => $offset + $index + 1]);
        }
        return response()->json(['message' => 'Photos uploaded.', 'photos' => $turf->fresh('photos')->photos], 201);
    }

    public function destroyPhoto(Request $request, Turf $turf, TurfPhoto $photo): JsonResponse
    {
        $this->authorizeTurfAccess($request->user(), $turf);
        abort_unless($photo->turf_id === $turf->id, 404);
        Storage::disk('public')->delete($photo->path);
        $photo->delete();
        return response()->json(['message' => 'Photo deleted.']);
    }

    private function resolveManagedTurf(Request $request): Turf
    {
        $query = Turf::query();
        if ($request->user()->isAdmin() && $request->filled('turf_id')) return $query->findOrFail($request->integer('turf_id'));
        return $query->where('turf_manager_id', $request->user()->id)->firstOrFail();
    }

    private function authorizeTurfAccess($user, Turf $turf): void
    {
        if (!$user->isAdmin() && $turf->turf_manager_id !== $user->id) abort(403, 'You do not own this complex.');
    }
}
