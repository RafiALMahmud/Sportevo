<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TurfDeletionRequest extends Model
{
    protected $guarded = ['id'];

    public function turf()
    {
        return $this->belongsTo(Turf::class)->withTrashed();
    }
}
