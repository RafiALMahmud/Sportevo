<?php

namespace App\Jobs;

use App\Services\AdvancePayment;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ExpireBookingAdvance implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public int $bookingId) {}

    public function handle(AdvancePayment $payments): void
    {
        $payments->expire($this->bookingId);
    }
}
