<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateSlotsRequest;
use App\Http\Requests\StoreTurfRequest;
use App\Http\Requests\UpdateMyTurfRequest;
use App\Http\Requests\UpdateSlotPriceRequest;
use App\Http\Requests\UploadPhotosRequest;
use App\Models\Booking;
use App\Models\Turf;
use App\Models\TurfPhoto;
use App\Models\User;
use App\Services\AdvancePayment;
use App\Services\FieldPhotos;
use App\Services\FieldPricing;
use App\Services\FieldSports;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class TurfController extends Controller
{
    public function index(Request $request)
    {
        $query = Turf::with(['fields.sports', 'photos' => fn ($q) => $q->limit(1)])->where('is_approved', true)->whereHas('fields')
            ->withCount(['reviews' => fn ($q) => $q->where('is_hidden', false)])
            ->withAvg(['reviews' => fn ($q) => $q->where('is_hidden', false)], 'rating');
        if ($request->filled('search')) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$request->search}%")->orWhere('location', 'like', "%{$request->search}%"));
        }
        if ($request->filled('sport')) {
            $request->validate(['sport' => ['string', 'max:80']]);
            $sport = FieldSports::canonicalName($request->string('sport')->toString());
            $query->whereHas('fields.sports', fn ($q) => $q->where('slug', $sport)->orWhere('name', $sport));
        }
        if ($request->filled('sport_name')) {
            $request->validate(['sport_name' => ['string', 'max:80']]);
            $query->whereHas('fields.sports', fn ($q) => $q->where('name', 'like', '%'.FieldSports::canonicalName($request->input('sport_name')).'%'));
        }
        if ($request->filled('location')) {
            $query->where('location', 'like', "%{$request->location}%");
        }

        return response()->json($query->paginate(min(50, max(1, $request->integer('per_page', 12)))));
    }

    public function show(Turf $turf)
    {
        abort_unless($turf->is_approved && $turf->fields()->exists(), 404);

        return response()->json(['turf' => $turf->load(['fields.sports', 'fields.photos', 'photos',
            'reviews' => fn ($q) => $q->where('is_hidden', false)->with('user:id,name')->latest()->take(20)])
            ->loadCount(['reviews' => fn ($q) => $q->where('is_hidden', false)])
            ->loadAvg(['reviews' => fn ($q) => $q->where('is_hidden', false)], 'rating')]);
    }

    public function store(StoreTurfRequest $request)
    {
        $field = app(FieldPhotos::class)->save($request->file('photos', []), function () use ($request) {
            User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_if(Turf::withTrashed()->where('turf_manager_id', $request->user()->id)->exists(), 409, 'Each owner account can register one complex. Use a separate account for another complex.');
            $pricing = FieldPricing::attributes($request->validated());
            $turf = Turf::create($request->only(['name', 'email', 'phone', 'location']) +
                ['price_per_slot' => $pricing['price_per_slot'], 'commission_rate' => 10, 'turf_manager_id' => $request->user()->id, 'is_approved' => false,
                    'advance_enabled' => $request->boolean('advance_enabled', true), 'advance_amount' => $request->input('advance_amount', 500),
                    'advance_window_minutes' => $request->input('advance_window_minutes', 60), 'payment_provider' => $request->payment_provider,
                    'payment_number' => $request->payment_number]);
            $field = $turf->fields()->create(['name' => $request->input('field_name') ?: 'Main field', 'players_per_side' => $request->input('players_per_side')] + $pricing);
            $sportIds = FieldSports::ids($request->validated());
            $field->sports()->sync($sportIds);
            $turf->sports()->sync($sportIds);

            return $field;
        });
        $turf = $field->turf;

        return response()->json(['message' => 'Complex registered with its first field. Pending admin approval.', 'turf' => $turf->load('fields.sports', 'fields.photos')], 201);
    }

    public function updateMyTurf(UpdateMyTurfRequest $request)
    {
        $turf = Turf::where('turf_manager_id', $request->user()->id)->firstOrFail();
        $turf->update($request->only(['name', 'email', 'phone', 'location', 'booking_request_emails']));

        return response()->json(['message' => 'Complex updated.', 'turf' => $turf->fresh(['fields.sports', 'fields.photos'])]);
    }

    public function myTurf(Request $request)
    {
        return response()->json(['turf' => Turf::where('turf_manager_id', $request->user()->id)->with(['fields.sports', 'fields.photos', 'deletionRequest'])->first()]);
    }

    public function generateSlots(GenerateSlotsRequest $request, Turf $turf)
    {
        $this->authorizeTurfAccess($request, $turf);
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        $slots = DB::transaction(function () use ($request, $turf) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = $turf->fields()->whereKey($request->integer('field_id'))->lockForUpdate()->firstOrFail();
            $startTime = $request->boolean('peak_only') ? $request->peak_start : $request->start_time;
            $endTime = $request->boolean('peak_only') ? $request->peak_end : $request->end_time;
            $start = Carbon::parse("{$request->date} {$startTime}");
            $end = Carbon::parse("{$request->date} {$endTime}");
            if ($end->lessThan($start)) {
                $end->addDay();
            }
            abort_if($start->lessThanOrEqualTo(now()), 422, 'Generate slots only in the future.');
            $duration = $request->integer('slot_duration');
            $ranges = [];
            for ($cursor = $start->copy(); $cursor->copy()->addMinutes($duration)->lessThanOrEqualTo($end); $cursor->addMinutes($duration)) {
                $finish = $cursor->copy()->addMinutes($duration);
                $overlap = Booking::where('field_id', $field->id)->whereIn('status', ['available', 'unavailable', 'pending', 'booked', 'completed'])
                    ->where('start_time', '<', $finish)->where('end_time', '>', $cursor)->exists();
                abort_if($overlap, 409, 'The requested generation overlaps an existing slot on this field. No slots were created.');
                $ranges[] = [$cursor->copy(), $finish];
            }
            abort_if(! $ranges, 422, 'The range is shorter than one slot.');

            return collect($ranges)->map(function ($range) use ($request, $turf, $field) {
                $peak = ($request->boolean('peak_enabled') || $request->boolean('peak_only')) && FieldPricing::overlapsPeak($range[0], $range[1], $request->peak_start, $request->peak_end);

                return Booking::create(['turf_id' => $turf->id, 'field_id' => $field->id,
                    'start_time' => $range[0], 'end_time' => $range[1], 'status' => 'available',
                    'is_peak' => $peak, 'slot_pricing_mode' => $peak ? $request->peak_pricing_mode : null,
                    'slot_rate' => $peak ? $request->peak_rate : null]);
            });
        });

        return response()->json(['message' => $slots->count().' slots generated.', 'slots' => $slots], 201);
    }

    public function deleteSlots(Request $request, Turf $turf)
    {
        $this->authorizeTurfAccess($request, $turf);
        $data = $request->validate(['field_id' => ['required', 'integer'],
            'slot_ids' => ['required', 'array', 'min:1', 'max:200'], 'slot_ids.*' => ['required', 'integer', 'distinct']]);
        $count = DB::transaction(function () use ($data, $turf) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = $turf->fields()->whereKey($data['field_id'])->lockForUpdate()->firstOrFail();
            $slots = $field->bookings()->whereIn('id', $data['slot_ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($slots->count() === count($data['slot_ids']), 404);
            $message = 'Only available, unbooked slots can be deleted. Booked slots and booking history are protected. No slots were deleted.';
            abort_if($slots->contains(fn ($slot) => ! $slot->isUnclaimedAvailableSlot()), 409, $message);
            // Recheck related financial/cancellation records before deleting any row.
            foreach (['wallet_entries', 'commission_refunds', 'cancellation_requests'] as $table) {
                abort_if(DB::table($table)->whereIn('booking_id', $data['slot_ids'])->exists(), 409, $message);
            }
            foreach ($slots as $slot) {
                $slot->delete(); // Fire the existing activity observer for each deleted slot.
            }

            return $slots->count();
        });

        return response()->json(['message' => 'Selected available slots deleted.', 'deleted_count' => $count]);
    }

    public function setSlotAvailability(Request $request, Turf $turf, Booking $booking)
    {
        $this->authorizeTurfAccess($request, $turf);
        abort_unless((int) $booking->turf_id === (int) $turf->id, 404);
        $request->validate([
            'available' => ['required', 'boolean'],
            'unavailable_type' => ['sometimes', 'string', Rule::in(['unavailable', 'offline_booking'])],
            'reason' => [Rule::requiredIf(fn () => ! $request->boolean('available') && $request->input('unavailable_type', 'unavailable') !== 'offline_booking'), 'nullable', 'string', 'max:500'],
        ]);
        $slot = DB::transaction(function () use ($request, $turf, $booking) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = $turf->fields()->whereKey($booking->field_id)->lockForUpdate()->firstOrFail();
            $slot = $field->bookings()->whereKey($booking->id)->lockForUpdate()->firstOrFail();
            $available = $request->boolean('available');
            $type = $request->input('unavailable_type', 'unavailable');
            $canChange = $available ? $slot->status === 'unavailable' :
                ($slot->status === 'available' || ($slot->status === 'unavailable' && ($slot->unavailable_type ?? 'unavailable') !== $type));
            abort_unless($canChange && $slot->user_id === null && $slot->commission_amount === null,
                409, 'Only open slots can be blocked, and only owner-blocked slots can be reopened. Online booking requests must use the booking approval/cancellation workflow.');
            abort_if($slot->start_time->lessThanOrEqualTo(now()), 422, 'Only future slots can change availability.');
            $overlap = Booking::where('field_id', $field->id)->whereKeyNot($slot->id)
                ->whereIn('status', ['available', 'unavailable', 'pending', 'booked', 'completed'])
                ->where('start_time', '<', $slot->end_time)->where('end_time', '>', $slot->start_time)->exists();
            abort_if($overlap, 409, 'Another slot already occupies this time on the same field.');
            $slot->update([
                'status' => $available ? 'available' : 'unavailable',
                'unavailable_type' => $available ? null : $type,
                'price' => ! $available && $type === 'offline_booking' ? FieldPricing::forSlot($slot, $field) : null,
                'unavailable_reason' => $available ? null : ($request->string('reason')->trim()->toString() ?: null),
                'unavailable_by' => $available ? null : $request->user()->id,
                'unavailable_at' => $available ? null : now(),
            ]);

            return $slot->fresh('field:id,name')->forOwner();
        });

        return response()->json([
            'message' => $request->boolean('available') ? 'Slot reopened for online requests.' :
                ($slot->isOfflineBooking() ? 'Offline booking recorded. Customers will see this slot as already booked.' : 'Slot marked unavailable. Customers cannot request it.'),
            'booking' => $slot,
        ]);
    }

    public function updateSlotPrice(UpdateSlotPriceRequest $request, Turf $turf, Booking $booking)
    {
        $this->authorizeTurfAccess($request, $turf);
        abort_unless((int) $booking->turf_id === (int) $turf->id, 404);
        $slot = DB::transaction(function () use ($request, $turf, $booking) {
            Turf::whereKey($turf->id)->lockForUpdate()->firstOrFail();
            $field = $turf->fields()->whereKey($booking->field_id)->lockForUpdate()->firstOrFail();
            $slot = $field->bookings()->whereKey($booking->id)->lockForUpdate()->firstOrFail();
            abort_unless($slot->status === 'available' && $slot->user_id === null && $slot->commission_amount === null,
                409, 'Only available slots can have their price changed. Existing requests and bookings keep their agreed price.');
            abort_unless($slot->start_time->isFuture(), 422, 'Only future slots can have their price changed.');
            $reset = $request->boolean('use_field_price');
            $slot->update(['slot_pricing_mode' => $reset ? null : $request->pricing_mode, 'slot_rate' => $reset ? null : $request->rate,
                'is_peak' => $reset ? false : $slot->is_peak]);
            $slot->setAttribute('price', FieldPricing::forSlot($slot, $field));

            return $slot->forOwner();
        });

        return response()->json(['message' => 'Slot price updated. Other slots and existing bookings are unchanged.', 'booking' => $slot]);
    }

    public function schedule(Request $request, Turf $turf)
    {
        $this->authorizeTurfAccess($request, $turf);
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d'], 'field_id' => ['nullable', 'integer']]);
        if ($request->filled('field_id')) {
            $turf->fields()->findOrFail($request->integer('field_id'));
        }
        $query = Booking::with('user:id,name,email,phone', 'field:id,name,price_per_slot,pricing_mode,price_per_hour', 'cancellationRequest')
            ->withExists(['walletEntries', 'commissionRefund'])->where('turf_id', $turf->id);
        if ($request->filled('date')) {
            $date = Carbon::parse($request->date)->startOfDay();
            $query->where('start_time', '>=', $date)->where('start_time', '<', $date->copy()->addDay());
        }
        if ($request->filled('field_id')) {
            $query->where('field_id', $request->integer('field_id'));
        }

        $bookings = $query->orderBy('start_time')->get()->map(function ($booking) {
            $booking->setAttribute('can_delete', $booking->isUnclaimedAvailableSlot() && ! $booking->wallet_entries_exists
                && ! $booking->commission_refund_exists && $booking->cancellationRequest === null);
            $booking->makeHidden(['wallet_entries_exists', 'commission_refund_exists']);
            if (in_array($booking->status, ['available', 'unavailable']) && ! $booking->isOfflineBooking() && $booking->field) {
                $booking->setAttribute('price', FieldPricing::forSlot($booking, $booking->field));
            }

            return $booking->forOwner();
        });

        return response()->json(['bookings' => $bookings, 'timezone' => config('app.timezone')]);
    }

    public function getSlots(Request $request, Turf $turf)
    {
        abort_unless($turf->is_approved, 404);
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d'], 'field_id' => ['required', 'integer']]);
        app(AdvancePayment::class)->expireDue(turfId: $turf->id);
        $field = $turf->fields()->findOrFail($request->integer('field_id'));
        $query = $field->bookings()->whereIn('status', ['available', 'unavailable', 'pending', 'booked', 'completed'])->where('end_time', '>', now());
        // Occupied slots stay visible. Only suppress stale duplicate OPEN rows;
        // never serialize a customer, reference or payment account publicly.
        $query->where(fn ($open) => $open->where('status', '!=', 'available')->orWhereNotExists(fn ($q) => $q->selectRaw('1')->from('bookings as occupied')
            ->whereColumn('occupied.field_id', 'bookings.field_id')->whereColumn('occupied.id', '!=', 'bookings.id')
            ->whereIn('occupied.status', ['unavailable', 'pending', 'booked', 'completed'])
            ->whereColumn('occupied.start_time', '<', 'bookings.end_time')
            ->whereColumn('occupied.end_time', '>', 'bookings.start_time')));
        if ($request->filled('date')) {
            $date = Carbon::parse($request->date)->startOfDay();
            $query->where('start_time', '>=', $date)->where('start_time', '<', $date->copy()->addDay());
        }

        $slots = $query->orderBy('start_time')->get(['id', 'field_id', 'turf_id', 'start_time', 'end_time', 'status', 'price', 'advance_status', 'unavailable_type', 'slot_pricing_mode', 'slot_rate', 'is_peak'])->map(function ($slot) use ($field) {
            $inProcess = $slot->status === 'pending' || ($slot->status === 'booked' && in_array($slot->advance_status, ['awaiting_payment', 'submitted']));

            return $slot->only(['id', 'field_id', 'turf_id', 'start_time', 'end_time', 'status']) + [
                'price' => number_format(in_array($slot->status, ['available', 'unavailable']) && ! $slot->isOfflineBooking() ? FieldPricing::forSlot($slot, $field) : (float) $slot->price, 2, '.', ''),
                'is_peak' => $slot->is_peak,
                'display_status' => $inProcess ? 'in_process' : (in_array($slot->status, ['booked', 'completed']) || $slot->isOfflineBooking() ? 'already_booked' : $slot->status),
                'can_request' => $slot->status === 'available' && $slot->start_time->isFuture(),
            ];
        });

        return response()->json(['slots' => $slots, 'price_per_slot' => $field->price_per_slot,
            'pricing_mode' => $field->pricing_mode, 'price_per_hour' => $field->price_per_hour]);
    }

    public function uploadPhotos(UploadPhotosRequest $request, Turf $turf)
    {
        $this->authorizeTurfAccess($request, $turf);
        $field = app(FieldPhotos::class)->save($request->file('photos'),
            fn () => $turf->fields()->findOrFail($request->integer('field_id')));

        return response()->json(['message' => 'Field photos uploaded.', 'photos' => $field->photos()->get()], 201);
    }

    public function destroyPhoto(Request $request, Turf $turf, TurfPhoto $photo)
    {
        $this->authorizeTurfAccess($request, $turf);
        abort_unless($photo->turf_id === $turf->id, 404);
        Storage::disk('public')->delete($photo->path);
        $photo->delete();

        return response()->json(['message' => 'Photo deleted.']);
    }

    private function authorizeTurfAccess(Request $request, Turf $turf): void
    {
        abort_unless($request->user()->hasRole('turf') && $turf->turf_manager_id === $request->user()->id, 403);
    }
}
