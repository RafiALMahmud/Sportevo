<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends Model
{
    protected $fillable = [
        'turf_id',
        'user_id',
        'start_time',
        'end_time',
        'status',
        'price',
        'commission_rate',
        'commission_amount',
        'decided_at',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'price' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'decided_at' => 'datetime',
    ];

    public function turf(): BelongsTo
    {
        return $this->belongsTo(Turf::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
