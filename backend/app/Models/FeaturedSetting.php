<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeaturedSetting extends Model
{
    public $incrementing = false;
    protected $guarded = ['id'];
    protected $hidden = ['payment_details'];
    protected $casts = ['payment_details' => 'encrypted:array'];

    public function checkout(): array
    {
        return ['methods' => $this->payment_details ?? [], 'instructions' => $this->instructions ?? ''];
    }
}
