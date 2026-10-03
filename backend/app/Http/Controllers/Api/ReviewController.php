<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Review;
use App\Models\Turf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function store(Request $request, Turf $turf): JsonResponse
    {
        $request->validate(['booking_id' => ['required', 'integer'], 'rating' => ['required', 'integer', 'between:1,5'], 'comment' => ['nullable', 'string', 'max:1500']]);
        $booking = Booking::whereKey($request->integer('booking_id'))->where('turf_id', $turf->id)->where('user_id', $request->user()->id)->whereIn('status', ['booked', 'completed'])->firstOrFail();
        $review = Review::updateOrCreate(['turf_id' => $turf->id, 'user_id' => $request->user()->id], ['booking_id' => $booking->id, 'rating' => $request->integer('rating'), 'comment' => $request->input('comment')]);
        return response()->json(['message' => 'Review saved.', 'review' => $review->load('user:id,name')], 201);
    }
}
