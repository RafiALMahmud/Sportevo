<?php

namespace App\Services;

use App\Models\Activity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ActivityLog
{
    public static function record(string $action, array $details = []): void
    {
        $actor = request()->user();
        $activity = Activity::create(['actor_id' => $actor?->id, 'actor_name' => $actor?->name,
            'actor_email' => $actor?->email, 'action' => $action, 'details' => $details]);
        // Raw attributes retain ciphertext. toArray() would decrypt private data into the log file.
        DB::afterCommit(fn () => Log::channel('activity')->info($action, $activity->getAttributes()));
    }
}
