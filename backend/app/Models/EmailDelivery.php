<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailDelivery extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['body'];

    protected $casts = ['recipient' => 'encrypted', 'subject' => 'encrypted', 'body' => 'encrypted', 'last_error' => 'encrypted', 'sent_at' => 'datetime'];
}
