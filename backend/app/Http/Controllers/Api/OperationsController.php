<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendTrackedEmail;
use App\Models\Activity;
use App\Models\EmailDelivery;
use App\Services\ActivityLog;
use App\Services\PersonalData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OperationsController extends Controller
{
    private function activities(Request $request)
    {
        $query = Activity::query()->orderByDesc('id');
        if ($request->filled('actor_id')) {
            $query->where('actor_id', $request->integer('actor_id'));
        }
        if ($request->filled('search')) {
            $ids = PersonalData::matchingIds(Activity::class, $request->search, ['actor_name', 'actor_email']);
            $query->where(fn ($q) => $q->whereIn('id', $ids)->orWhere('action', 'like', "%{$request->search}%"));
        }

        return $query;
    }

    public function logs(Request $request)
    {
        return response()->json($this->activities($request)->paginate(50));
    }

    public function downloadLogs(Request $request)
    {
        return response()->streamDownload(function () use ($request) {
            foreach ($this->activities($request)->cursor() as $activity) {
                echo json_encode($activity, JSON_UNESCAPED_SLASHES)."\n";
            }
        }, 'sportevo-activity.txt', ['Content-Type' => 'text/plain', 'Cache-Control' => 'no-store']);
    }

    public function emails()
    {
        return response()->json(EmailDelivery::latest()->paginate(25));
    }

    public function retryEmail(EmailDelivery $emailDelivery)
    {
        return DB::transaction(function () use ($emailDelivery) {
            $email = EmailDelivery::whereKey($emailDelivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($email->status === 'failed', 422, 'Only failed deliveries can be retried.');
            $email->update(['status' => 'pending', 'last_error' => null]);
            SendTrackedEmail::dispatch($email->id)->afterCommit();
            ActivityLog::record('email.retry', ['delivery_id' => $email->id]);

            return response()->json(['message' => 'Email queued for retry.']);
        });
    }
}
