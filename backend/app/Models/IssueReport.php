<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IssueReport extends Model
{
    protected $fillable = ['user_id', 'subject', 'message', 'status', 'admin_reply', 'handled_by'];

    protected $casts = ['subject' => 'encrypted', 'message' => 'encrypted', 'admin_reply' => 'encrypted'];

    public function user()
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
