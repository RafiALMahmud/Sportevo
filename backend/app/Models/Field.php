<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Field extends Model
{
    use SoftDeletes;

    protected $fillable = ['turf_id', 'name', 'price_per_slot', 'pricing_mode', 'price_per_hour', 'players_per_side'];

    protected $casts = ['price_per_slot' => 'decimal:2', 'price_per_hour' => 'decimal:2', 'players_per_side' => 'integer'];

    public function turf()
    {
        return $this->belongsTo(Turf::class)->withTrashed();
    }

    public function sports()
    {
        return $this->belongsToMany(Sport::class);
    }

    public function photos()
    {
        return $this->hasMany(TurfPhoto::class)->orderBy('sort_order');
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}
