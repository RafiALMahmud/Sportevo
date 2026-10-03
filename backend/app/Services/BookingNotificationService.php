<?php

namespace App\Services;

use App\Models\Booking;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class BookingNotificationService
{
    public function requested(Booking $booking): void
    {
        $booking->loadMissing('turf.manager', 'user');
        $when = $booking->start_time->format('D, d M Y g:i A');
        $this->send($booking->user?->email, 'Booking request received', "Your request for {$booking->turf->name} on {$when} is pending approval.");
        $this->send($booking->turf->email ?: $booking->turf->manager?->email, 'New booking request', "A new booking request for {$booking->turf->name} on {$when} is awaiting your decision. Customer contact details are revealed only after acceptance.");
    }

    public function decided(Booking $booking): void
    {
        $booking->loadMissing('turf', 'user');
        $status = $booking->status === 'booked' ? 'accepted' : 'rejected';
        $when = $booking->start_time->format('D, d M Y g:i A');
        $price = number_format((float) $booking->price, 2);
        $detail = $status === 'accepted' ? " The confirmed price is {$price}." : '';
        $this->send($booking->user?->email, "Booking request {$status}", "Your booking request for {$booking->turf->name} on {$when} was {$status}.{$detail}");
    }

    public function cancelled(Booking $booking, string $cancelledBy): void
    {
        $booking->loadMissing('turf', 'user');
        $when = $booking->start_time->format('D, d M Y g:i A');
        $this->send($booking->user?->email, 'Booking cancelled', "The booking for {$booking->turf->name} on {$when} was cancelled by the {$cancelledBy}.");
        $this->send($booking->turf->email ?: $booking->turf->manager?->email, 'Booking cancelled', "The booking for {$booking->turf->name} on {$when} was cancelled by the {$cancelledBy}.");
    }

    public function completed(Booking $booking): void
    {
        $booking->loadMissing('turf', 'user');
        $when = $booking->start_time->format('D, d M Y g:i A');
        $this->send($booking->user?->email, 'Booking completed', "Thanks for playing at {$booking->turf->name}. Your booking on {$when} is now marked completed. You can leave a review.");
    }

    public function turfDecisionMade(Booking $booking, string $decision, string $actor): void
    {
        $booking->loadMissing('turf.manager', 'user');
        $when = $booking->start_time->format('D, d M Y g:i A');
        $this->send($booking->turf->email ?: $booking->turf->manager?->email, "Booking request {$decision}",
            "The {$actor} {$decision} a booking request for {$booking->turf->name} on {$when}.");
    }

    private function send(?string $to, string $subject, string $body): void
    {
        if (!$to) return;
        try {
            Mail::html("<h2>Sports Evo</h2><p>{$body}</p>", fn ($message) => $message->to($to)->subject($subject));
        } catch (\Throwable $exception) {
            Log::warning("Booking email failed for {$to}: {$exception->getMessage()}");
        }
    }
}
