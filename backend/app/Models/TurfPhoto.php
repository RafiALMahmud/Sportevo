<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class TurfPhoto extends Model
{
    protected $fillable = ['turf_id', 'path', 'sort_order'];
    protected $appends = ['url'];

    public function turf(): BelongsTo { return $this->belongsTo(Turf::class); }
    public function getUrlAttribute(): string { return Storage::disk('public')->url($this->path); }
}
