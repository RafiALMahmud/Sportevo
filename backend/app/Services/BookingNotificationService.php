<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\User;

class BookingNotificationService
{
    public function requested(Booking $booking): void
    {
        $booking->loadMissing('turf.manager', 'user', 'field');
        $when = $booking->start_time->format('D, d M Y g:i A');
        $this->send($booking->user?->email, 'Booking request received', "Your request for {$booking->turf->name} on {$when} is pending approval.");
        if ($booking->turf->booking_request_emails) {
            $field = $booking->field?->name ?? 'Field';
            $dashboard = rtrim(config('app.frontend_url') ?: config('app.url'), '/').'/dashboard/turf';
            foreach (array_unique(array_filter([$booking->turf->manager?->email, $booking->turf->email])) as $recipient) {
                $this->send($recipient, 'New booking request', "Booking request #{$booking->id} for {$booking->turf->name}, {$field}, on {$when} is awaiting your decision. Review it at {$dashboard}. Customer contact details are revealed only after acceptance.");
            }
        }
    }

    public function decided(Booking $booking): void
    {
        $booking->loadMissing('turf', 'user');
        $status = $booking->status === 'booked' ? 'accepted' : 'rejected';
        $when = $booking->start_time->format('D, d M Y g:i A');
        $price = number_format((float) $booking->price, 2);
        $detail = $status === 'accepted' ? " The confirmed price is ৳{$price} (BDT)." : '';
        if ($status === 'accepted' && $booking->advance_required) {
            $detail = ' The slot is held pending advance payment. Pay ৳'.number_format((float) $booking->advance_amount, 2).' to '.$booking->payment_provider.' '.$booking->payment_number.' and submit your transaction ID or reference in My Bookings before '.$booking->advance_due_at->format('d M Y g:i A').' ('.config('app.timezone').'). Unsubmitted payments cause automatic release. A submitted reference awaits owner verification.';
        }
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
        TrackedMail::send($to, $subject, '<h2>SportEvo</h2><p>'.e($body).'</p>');
    }

    public function cancellationProgress(Booking $booking, string $message): void
    {
        $booking->loadMissing('turf.manager', 'user');
        $this->send($booking->user?->email, 'Cancellation update', $message);
        $this->send($booking->turf->email ?: $booking->turf->manager?->email, 'Cancellation update', $message);
        foreach (User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'superadmin']))->get() as $admin) {
            $this->send($admin->email, 'Cancellation / commission refund update', $message);
        }
    }

    public function advanceUpdate(Booking $booking, string $subject, string $message): void
    {
        $booking->loadMissing('turf.manager', 'user', 'field');
        $body = "Booking #{$booking->id}, {$booking->turf->name}, ".($booking->field?->name ?? 'Field').'. '.$message;
        foreach (array_unique(array_filter([$booking->user?->email, $booking->turf->email, $booking->turf->manager?->email])) as $recipient) {
            $this->send($recipient, $subject, $body);
        }
    }
}
