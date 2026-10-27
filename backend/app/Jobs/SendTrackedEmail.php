<?php

namespace App\Jobs;

use App\Models\EmailDelivery;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Mail;
use Throwable;

class SendTrackedEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 45;

    public function __construct(public int $deliveryId) {}

    public function backoff(): array
    {
        return [60, 300, 900, 3600];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping('email:'.$this->deliveryId))->releaseAfter(60)->expireAfter(120)];
    }

    public function handle(): void
    {
        $delivery = EmailDelivery::find($this->deliveryId);
        if (! $delivery || $delivery->status === 'sent') {
            return;
        }
        $delivery->increment('attempts');
        try {
            Mail::html($delivery->body, fn ($message) => $message->to($delivery->recipient)->subject($delivery->subject));
            $delivery->update(['status' => 'sent', 'sent_at' => now(), 'last_error' => null]);
        } catch (Throwable $error) {
            $delivery->update(['status' => 'retrying', 'last_error' => mb_substr($error->getMessage(), 0, 2000)]);
            // SMTP messages can contain recipient addresses; keep the detailed error only in the encrypted outbox.
            throw new \RuntimeException('Email transport failed: '.get_class($error));
        }
    }

    public function failed(?Throwable $error): void
    {
        $delivery = EmailDelivery::whereKey($this->deliveryId)->where('status', '!=', 'sent')->first();
        $delivery?->update(['status' => 'failed', 'last_error' => mb_substr($error?->getMessage() ?? 'Delivery failed.', 0, 2000)]);
    }
}
