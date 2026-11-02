<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeaturedRequest extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['amount' => 'decimal:2', 'days' => 'integer', 'receiver_number' => 'encrypted',
        'payment_reference' => 'encrypted', 'decision_note' => 'encrypted', 'submitted_at' => 'datetime',
        'decided_at' => 'datetime', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    public function turf() { return $this->belongsTo(Turf::class)->withTrashed(); }
    public function owner() { return $this->belongsTo(User::class, 'owner_id')->withTrashed(); }
}
