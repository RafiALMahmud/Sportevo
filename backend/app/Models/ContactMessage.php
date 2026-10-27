<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected $fillable = ['user_id', 'name', 'email', 'type', 'subject', 'message', 'status', 'handled_by'];

    protected $casts = ['name' => 'encrypted', 'email' => 'encrypted', 'subject' => 'encrypted', 'message' => 'encrypted'];
}
