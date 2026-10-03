<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WalletEntry extends Model
{
    protected $fillable = ['turf_id', 'booking_id', 'type', 'amount', 'note', 'created_by'];
    protected $casts = ['amount' => 'decimal:2'];

    public function turf(): BelongsTo { return $this->belongsTo(Turf::class); }
    public function booking(): BelongsTo { return $this->belongsTo(Booking::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
