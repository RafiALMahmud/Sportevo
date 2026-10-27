<?php

namespace App\Services;

use App\Jobs\SendTrackedEmail;
use App\Models\EmailDelivery;

class TrackedMail
{
    public static function send(?string $to, string $subject, string $html): void
    {
        if (! $to) {
            return;
        }
        $delivery = EmailDelivery::create(['recipient' => $to, 'subject' => $subject, 'body' => $html]);
        SendTrackedEmail::dispatch($delivery->id)->afterCommit();
    }
}
