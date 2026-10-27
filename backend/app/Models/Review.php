<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $fillable = ['turf_id', 'user_id', 'booking_id', 'rating', 'comment', 'is_hidden'];

    protected $casts = ['is_hidden' => 'boolean'];

    public function turf(): BelongsTo
    {
        return $this->belongsTo(Turf::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }
}
