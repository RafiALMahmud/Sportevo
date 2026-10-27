<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReviewRequest;
use App\Models\Booking;
use App\Models\Review;
use App\Models\Turf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function store(StoreReviewRequest $request, Turf $turf): JsonResponse
    {
        $booking = Booking::whereKey($request->integer('booking_id'))->where('turf_id', $turf->id)->where('user_id', $request->user()->id)
            ->whereIn('status', ['booked', 'completed'])->where('end_time', '<=', now())
            ->where(fn ($query) => $query->where('advance_required', false)->orWhere('advance_status', 'confirmed'))->first();
        abort_unless($booking, 422, 'Only your own accepted bookings that have ended can be reviewed.');
        $review = Review::updateOrCreate(['turf_id' => $turf->id, 'user_id' => $request->user()->id], ['booking_id' => $booking->id, 'rating' => $request->integer('rating'), 'comment' => $request->input('comment')]);

        return response()->json(['message' => 'Review saved.', 'review' => $review->load('user:id,name')], $review->wasRecentlyCreated ? 201 : 200);
    }

    public function index(Request $request)
    {
        $query = Review::with('user:id,name', 'turf:id,name');
        if (! $request->user()->isAdmin()) {
            $query->whereHas('turf', fn ($q) => $q->where('turf_manager_id', $request->user()->id));
        }

        return response()->json($query->latest()->paginate(25));
    }

    public function moderate(Request $request, Review $review)
    {
        abort_unless($request->user()->isAdmin() || $review->turf->turf_manager_id === $request->user()->id, 403);
        $request->validate(['is_hidden' => ['required', 'boolean']]);
        $review->update(['is_hidden' => $request->boolean('is_hidden')]);

        return response()->json(['message' => 'Review visibility updated.']);
    }

    public function destroy(Request $request, Review $review)
    {
        abort_unless($request->user()->isAdmin() || $review->turf->turf_manager_id === $request->user()->id, 403);
        $review->delete();

        return response()->json(['message' => 'Review deleted.']);
    }
}
