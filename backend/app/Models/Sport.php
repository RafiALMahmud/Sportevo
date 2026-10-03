<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Sport extends Model
{
    protected $fillable = [
        'name',
        'slug',
    ];

    public function turfs(): BelongsToMany
    {
        return $this->belongsToMany(Turf::class);
    }
}