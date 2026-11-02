<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FeaturedPlacement;
use App\Models\FeaturedRequest;
use App\Models\FeaturedSetting;
use App\Models\Turf;
use App\Services\ActivityLog;
use App\Services\FeaturedComplexes as Featured;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class FeaturedComplexController extends Controller
{
    private function privateJson($data, int $status = 200)
    {
        return response()->json($data, $status, ['Cache-Control' => 'private, no-store']);
    }

    public function homepage()
    {
        $placements = FeaturedPlacement::live()->whereIn('turf_id', Featured::eligible()->select('turfs.id'))
            ->with(['turf.fields.sports', 'turf.photos' => fn ($query) => $query->limit(1)])->orderBy('priority')->orderBy('id')->limit(Featured::CAPACITY)->get();
        $featured = $placements->isNotEmpty();
        $rows = $featured ? $placements->map(fn ($placement) => Featured::publicComplex($placement->turf)
            + ['is_featured' => true, 'is_sponsored' => $placement->is_sponsored])
            : Featured::eligible()->with(['fields.sports', 'photos' => fn ($query) => $query->limit(1)])->orderBy('id')->limit(Featured::CAPACITY)->get()->map(fn ($turf) => Featured::publicComplex($turf));
        return response()->json(['data' => $rows->values(), 'mode' => $featured ? 'featured' : 'browse'], 200, ['Cache-Control' => 'no-store']);
    }

    public function owner(Request $request)
    {
        $turf = Turf::where('turf_manager_id', $request->user()->id)->first();
        return $this->privateJson(['turf' => $turf?->only('id', 'name', 'is_approved'), 'plans' => Featured::plans(),
            'payment' => FeaturedSetting::findOrFail(1)->checkout(), 'capacity' => Featured::CAPACITY,
            'occupied' => Featured::reservations()->count(),
            'placement' => $turf ? FeaturedPlacement::where('turf_id', $turf->id)->first() : null,
            'requests' => FeaturedRequest::where('owner_id', $request->user()->id)->latest('id')->paginate(10)]);
    }

    public function requestPlacement(Request $request)
    {
        $data = $request->validate(['days' => ['required', Rule::in(array_keys(Featured::PLANS))], 'provider' => ['required', Rule::in(['bKash', 'Nagad', 'Card'])]]);
        return DB::transaction(function () use ($request, $data) {
            $settings = FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $turf = Turf::where('turf_manager_id', $request->user()->id)->firstOrFail();
            Featured::reserveCapacity($turf->id);
            abort_if(FeaturedRequest::where('turf_id', $turf->id)->whereIn('status', ['awaiting_payment', 'submitted'])->exists(), 409, 'Your complex already has an open featured request.');
            $method = collect($settings->payment_details ?? [])->firstWhere('provider', $data['provider']);
            abort_unless($method, 422, 'This payment method is not configured. Contact SportEvo.');
            $quote = FeaturedRequest::create(['turf_id' => $turf->id, 'owner_id' => $request->user()->id,
                'days' => (int) $data['days'], 'amount' => Featured::PLANS[$data['days']], 'provider' => $method['provider'],
                'receiver_number' => $method['number'], 'status' => 'awaiting_payment']);
            ActivityLog::record('featured.requested', ['request_id' => $quote->id, 'turf_id' => $turf->id, 'days' => $quote->days, 'amount' => $quote->amount]);
            return $this->privateJson(['message' => 'Featured request created. Pay using the details on this request, then submit your transaction ID.', 'request' => $quote], 201);
        });
    }

    public function reference(Request $request, FeaturedRequest $featuredRequest)
    {
        abort_unless($featuredRequest->owner_id === $request->user()->id, 403);
        $data = $request->validate(['reference' => ['required', 'string', 'min:2', 'max:160']]);
        return DB::transaction(function () use ($featuredRequest, $data) {
            FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $quote = FeaturedRequest::whereKey($featuredRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($quote->status, ['awaiting_payment', 'submitted']), 409, 'This featured request is already decided.');
            $quote->update(['payment_reference' => trim($data['reference']), 'submitted_at' => now(), 'status' => 'submitted']);
            ActivityLog::record('featured.payment_submitted', ['request_id' => $quote->id]);
            return $this->privateJson(['message' => 'Payment reference sent for admin review.', 'request' => $quote]);
        });
    }

    public function cancel(Request $request, FeaturedRequest $featuredRequest)
    {
        abort_unless($featuredRequest->owner_id === $request->user()->id, 403);
        return DB::transaction(function () use ($featuredRequest) {
            FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $quote = FeaturedRequest::whereKey($featuredRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless($quote->status === 'awaiting_payment' && ! $quote->payment_reference, 409, 'Contact SportEvo to resolve a submitted payment.');
            $quote->update(['status' => 'cancelled']);
            ActivityLog::record('featured.cancelled', ['request_id' => $quote->id]);
            return $this->privateJson(['message' => 'Featured request cancelled.']);
        });
    }

    public function admin(Request $request)
    {
        $input = $request->validate(['status' => ['nullable', Rule::in(['open', 'awaiting_payment', 'submitted', 'approved', 'rejected', 'cancelled'])]]);
        $query = FeaturedRequest::with('turf:id,name,deleted_at', 'owner:id,name,email')->latest('id');
        if (($input['status'] ?? 'open') === 'open') $query->whereIn('status', ['awaiting_payment', 'submitted']);
        else $query->where('status', $input['status']);
        return $this->privateJson(['requests' => $query->paginate(20), 'plans' => Featured::plans(), 'capacity' => Featured::CAPACITY, 'occupied' => Featured::reservations()->count(),
            'placements' => FeaturedPlacement::with('turf:id,name,deleted_at')->reserved()->orderBy('priority')->orderBy('id')->get()]);
    }

    public function approve(Request $request, FeaturedRequest $featuredRequest)
    {
        $data = $request->validate(['payment_received' => ['required', 'accepted'], 'note' => ['nullable', 'string', 'max:500']]);
        return DB::transaction(function () use ($request, $featuredRequest, $data) {
            Featured::reserveCapacity($featuredRequest->turf_id);
            $quote = FeaturedRequest::whereKey($featuredRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($quote->status, ['awaiting_payment', 'submitted']), 409, 'This featured request is already decided.');
            $placement = FeaturedPlacement::where('turf_id', $quote->turf_id)->lockForUpdate()->first();
            $start = $placement && $placement->is_enabled && $placement->ends_at->isFuture() ? $placement->ends_at->copy() : now();
            $end = $start->copy()->addDays($quote->days);
            $values = ['is_enabled' => true, 'is_sponsored' => true, 'ends_at' => $end, 'updated_by' => $request->user()->id];
            if (! $placement || ! $placement->is_enabled || ! $placement->ends_at->isFuture()) $values['starts_at'] = now();
            $placement = FeaturedPlacement::updateOrCreate(['turf_id' => $quote->turf_id], $values);
            $quote->update(['status' => 'approved', 'decided_by' => $request->user()->id, 'decided_at' => now(),
                'starts_at' => $start, 'ends_at' => $end, 'decision_note' => $data['note'] ?? null]);
            ActivityLog::record('featured.approved', ['request_id' => $quote->id, 'placement_id' => $placement->id,
                'direct_confirmation' => ! $quote->payment_reference, 'amount' => $quote->amount, 'starts_at' => $start, 'ends_at' => $end]);
            return $this->privateJson(['message' => 'Payment confirmed and featured placement activated.', 'request' => $quote]);
        });
    }

    public function reject(Request $request, FeaturedRequest $featuredRequest)
    {
        $data = $request->validate(['note' => ['required', 'string', 'min:2', 'max:500']]);
        return DB::transaction(function () use ($request, $featuredRequest, $data) {
            FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $quote = FeaturedRequest::whereKey($featuredRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($quote->status, ['awaiting_payment', 'submitted']), 409, 'This featured request is already decided.');
            $quote->update(['status' => 'rejected', 'decision_note' => $data['note'], 'decided_by' => $request->user()->id, 'decided_at' => now()]);
            ActivityLog::record('featured.rejected', ['request_id' => $quote->id]);
            return $this->privateJson(['message' => 'Featured request rejected. Resolve any received payment with the owner separately.']);
        });
    }

    public function add(Request $request)
    {
        $data = $request->validate(['turf_id' => ['required', 'integer'], 'days' => ['required', Rule::in(array_keys(Featured::PLANS))],
            'priority' => ['sometimes', 'integer', 'min:0', 'max:999'], 'note' => ['required', 'string', 'min:2', 'max:500']]);
        return DB::transaction(function () use ($request, $data) {
            Featured::reserveCapacity((int) $data['turf_id']);
            $placement = FeaturedPlacement::where('turf_id', $data['turf_id'])->first();
            abort_if($placement && $placement->is_enabled && $placement->ends_at->isFuture(), 409, 'This complex is already featured. Edit its placement instead.');
            $placement = FeaturedPlacement::updateOrCreate(['turf_id' => $data['turf_id']], ['starts_at' => now(),
                'ends_at' => now()->addDays((int) $data['days']), 'priority' => $data['priority'] ?? 100,
                'is_enabled' => true, 'is_sponsored' => false, 'admin_note' => $data['note'], 'updated_by' => $request->user()->id]);
            ActivityLog::record('featured.added_by_admin', ['placement_id' => $placement->id, 'turf_id' => $placement->turf_id, 'days' => $data['days']]);
            return $this->privateJson(['message' => 'Featured placement added by admin. No payment receipt was recorded.', 'placement' => $placement], 201);
        });
    }

    public function edit(Request $request, FeaturedPlacement $featuredPlacement)
    {
        $data = $request->validate(['starts_at' => ['required', 'date'], 'ends_at' => ['required', 'date', 'after:starts_at'],
            'priority' => ['required', 'integer', 'min:0', 'max:999'], 'note' => ['required', 'string', 'min:2', 'max:500']]);
        return DB::transaction(function () use ($request, $featuredPlacement, $data) {
            Featured::reserveCapacity($featuredPlacement->turf_id);
            $placement = FeaturedPlacement::whereKey($featuredPlacement->id)->lockForUpdate()->firstOrFail();
            $before = $placement->only('starts_at', 'ends_at', 'priority', 'is_enabled');
            $placement->update(['starts_at' => $data['starts_at'], 'ends_at' => $data['ends_at'], 'priority' => $data['priority'],
                'is_enabled' => true, 'admin_note' => $data['note'], 'updated_by' => $request->user()->id]);
            ActivityLog::record('featured.edited', ['placement_id' => $placement->id, 'before' => $before, 'after' => $placement->only('starts_at', 'ends_at', 'priority', 'is_enabled')]);
            return $this->privateJson(['message' => 'Featured placement updated. Payment history is unchanged.', 'placement' => $placement]);
        });
    }

    public function remove(Request $request, FeaturedPlacement $featuredPlacement)
    {
        $data = $request->validate(['note' => ['required', 'string', 'min:2', 'max:500']]);
        return DB::transaction(function () use ($request, $featuredPlacement, $data) {
            FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $placement = FeaturedPlacement::whereKey($featuredPlacement->id)->lockForUpdate()->firstOrFail();
            $placement->update(['is_enabled' => false, 'admin_note' => $data['note'], 'updated_by' => $request->user()->id]);
            ActivityLog::record('featured.removed', ['placement_id' => $placement->id]);
            return $this->privateJson(['message' => 'Removed from featured placements. Payment history is retained.']);
        });
    }

    public function settings() { return $this->privateJson(FeaturedSetting::findOrFail(1)->checkout()); }

    public function updateSettings(Request $request)
    {
        $data = $request->validate(['methods' => ['present', 'array', 'max:3'], 'methods.*' => ['array:provider,number'],
            'methods.*.provider' => ['required', 'distinct', Rule::in(['bKash', 'Nagad', 'Card'])],
            'methods.*.number' => ['required', 'string', 'min:5', 'max:80'], 'instructions' => ['nullable', 'string', 'max:800']]);
        return DB::transaction(function () use ($data) {
            $settings = FeaturedSetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $settings->update(['payment_details' => $data['methods'], 'instructions' => $data['instructions'] ?? null]);
            ActivityLog::record('featured.payment_settings_changed', ['providers' => array_column($data['methods'], 'provider')]);
            return $this->privateJson(['message' => 'SportEvo payment details saved. Existing requests keep their original receiving details.'] + $settings->checkout());
        });
    }
}
