<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeaturedPlacement extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['admin_note'];
    protected $casts = ['is_enabled' => 'boolean', 'is_sponsored' => 'boolean', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'admin_note' => 'encrypted'];
    public function turf() { return $this->belongsTo(Turf::class)->withTrashed(); }
    public function scopeReserved($query) { return $query->where('is_enabled', true)->where('ends_at', '>', now()); }
    public function scopeLive($query) { return $query->reserved()->where('starts_at', '<=', now()); }
}
